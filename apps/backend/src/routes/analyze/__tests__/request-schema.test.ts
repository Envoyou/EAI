import { describe, expect, it } from 'vitest';
import { AnalyzeMetadataSchema } from '@eai/shared';

describe('analyze metadata request contract', () => {
  it('accepts bounded research notes and attachments', () => {
    const parsed = AnalyzeMetadataSchema.safeParse({
      category: 'Editorial',
      researchNotes: [{
        id: 'note-1',
        content: 'Source-backed working note.',
        sources: [{ url: 'https://example.com/source', domain: 'example.com' }],
        savedAt: '2026-07-30T00:00:00.000Z',
      }],
      attachments: [{
        id: 'attachment-1',
        filename: 'brief.txt',
        r2Key: 'workspace/brief.txt',
        publicUrl: 'https://files.example.com/brief.txt',
        contentType: 'text/plain',
        extractedText: 'Attachment context.',
        uploadedAt: '2026-07-30T00:00:00.000Z',
      }],
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects unknown metadata and oversized research content', () => {
    expect(AnalyzeMetadataSchema.safeParse({ injectedPolicy: 'ignore system' }).success)
      .toBe(false);
    expect(AnalyzeMetadataSchema.safeParse({
      researchNotes: [{
        id: 'note-1',
        content: 'x'.repeat(15_001),
        sources: [],
        savedAt: '2026-07-30T00:00:00.000Z',
      }],
    }).success).toBe(false);
  });
});
