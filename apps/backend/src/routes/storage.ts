import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import { generatePresignedUploadUrl, getFileBuffer } from '@/lib/r2';
import { prisma, Prisma } from '@/lib/db';
import { PDFParse } from 'pdf-parse';

const router = Router();

// Whitelist of supported MIME types
const ALLOWED_MIME_TYPES = ['text/plain', 'text/csv', 'application/pdf'];

/**
 * POST /api/storage/presigned-url
 * Generates a presigned upload URL for a user
 */
router.post('/presigned-url', requireAuth, async (req, res) => {
  try {
    const { filename, contentType } = req.body;
    if (!filename || !contentType) {
      return res.status(400).json({ error: 'Missing filename or contentType' });
    }

    if (!ALLOWED_MIME_TYPES.includes(contentType)) {
      return res.status(400).json({ 
        error: `MIME type "${contentType}" tidak didukung. Harap unggah file .csv, .pdf, atau .txt.` 
      });
    }

    const { userId } = req.auth!;
    const result = await generatePresignedUploadUrl(userId, filename, contentType);

    return res.json(result);
  } catch (error) {
    console.error('[STORAGE_PRESIGNED_URL_ERROR]', error);
    return res.status(500).json({ error: 'Failed to generate presigned upload URL' });
  }
});

/**
 * POST /api/storage/extract
 * Confirms upload, extracts text content, and optionally associates it with a document
 */
router.post('/extract', requireAuth, async (req, res) => {
  try {
    const { fileKey, contentType, filename, activeHistoryId, publicUrl } = req.body;
    if (!fileKey || !contentType || !filename || !publicUrl) {
      return res.status(400).json({ error: 'Missing required parameters (fileKey, contentType, filename, publicUrl)' });
    }

    // 1. Fetch file buffer from R2 bucket
    const buffer = await getFileBuffer(fileKey);

    // 2. Validate file size on backend (Gate 2: Max 10MB)
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Ukuran file melebihi batas maksimal 10MB.' });
    }

    // 3. Extract text based on Content Type
    let extractedText = '';
    if (contentType === 'text/plain' || contentType === 'text/csv') {
      extractedText = buffer.toString('utf-8');
    } else if (contentType === 'application/pdf') {
      try {
        const parser = new PDFParse({ data: buffer });
        const parsed = await parser.getText();
        extractedText = parsed.text ? parsed.text.trim() : '';
      } catch (pdfErr) {
        console.error('[STORAGE_PDF_PARSING_ERROR]', pdfErr);
        return res.status(400).json({ error: 'Failed to extract text from the PDF file.' });
      }

      // Check if text is empty (scanned or image-based PDF)
      if (!extractedText) {
        return res.status(400).json({ 
          error: 'This PDF cannot be read because it is image-based or scanned.' 
        });
      }
    } else {
      return res.status(400).json({ error: 'Unsupported file format for text extraction.' });
    }

    const attachmentId = fileKey.split('/').pop() || Date.now().toString();
    const newAttachment = {
      id: attachmentId,
      filename,
      r2Key: fileKey,
      publicUrl,
      contentType,
      extractedText,
      uploadedAt: new Date().toISOString(),
    };

    // 4. Persist to DB if activeHistoryId is supplied
    if (activeHistoryId) {
      const log = await prisma.analysisLog.findUnique({
        where: { id: activeHistoryId },
      });

      if (log) {
        const existingMetadata = log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata)
          ? (log.metadata as Record<string, unknown>)
          : {};
        
        // Single-file cap V1: replace previous attachments
        const updatedAttachments = [newAttachment];

        await prisma.analysisLog.update({
          where: { id: activeHistoryId },
          data: {
            metadata: {
              ...existingMetadata,
              attachments: updatedAttachments,
            } as Prisma.InputJsonValue,
          },
        });
      }
    }

    return res.json({ success: true, attachment: newAttachment });
  } catch (error) {
    console.error('[STORAGE_EXTRACT_ERROR]', error);
    return res.status(500).json({ error: 'Failed to extract file context' });
  }
});

export default router;
