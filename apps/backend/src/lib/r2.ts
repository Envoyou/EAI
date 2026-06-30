import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'eai-insight';

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.warn('[R2 SDK Client] Missing Cloudflare R2 environment variables. File upload & extraction will not function.');
}

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: accessKeyId || '',
    secretAccessKey: secretAccessKey || '',
  },
});

/**
 * Converts a Node.js Readable stream into a Buffer
 */
function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/**
 * Downloads a file from private Cloudflare R2 bucket with retry support
 */
export async function getFileBuffer(fileKey: string, retries = 3, delayMs = 500): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: fileKey,
  });

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await r2Client.send(command);
      if (response.Body) {
        return await streamToBuffer(response.Body as Readable);
      }
      throw new Error('Response body is empty');
    } catch (err) {
      const errorName = err && typeof err === 'object' && 'name' in err ? (err as Record<string, unknown>).name : undefined;
      // Non-transient errors: do not retry
      const isRetryable = errorName !== 'AccessDenied' && errorName !== 'InvalidAccessKeyId' && errorName !== 'SignatureDoesNotMatch';
      if (!isRetryable || attempt === retries - 1) {
        throw err;
      }
      console.warn(`[R2 getFileBuffer] Attempt ${attempt + 1} failed for key ${fileKey}, retrying in ${delayMs}ms:`, err instanceof Error ? err.message : err);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Failed to retrieve file from R2 after retries.');
}

/**
 * Generates a PUT presigned URL for secure frontend-direct uploading
 */
export async function generatePresignedUploadUrl(userId: string, filename: string, contentType: string) {
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const fileKey = `uploads/${userId}/${Date.now()}-${sanitizedFilename}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: fileKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 600 });
  const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL 
    ? `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${fileKey}`
    : `https://${bucketName}.r2.cloudflarestorage.com/${fileKey}`;

  return {
    uploadUrl,
    fileKey,
    publicUrl,
  };
}
