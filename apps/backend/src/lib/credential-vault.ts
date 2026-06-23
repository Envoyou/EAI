import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { z } from 'zod';

export const CREDENTIAL_KEY_VERSION = 'v1';
const CredentialPayloadSchema = z.record(z.string(), z.string().max(2000));

const getEncryptionKey = () => {
  const secret = process.env.CMS_CREDENTIALS_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('CMS_CREDENTIALS_ENCRYPTION_KEY is not configured.');
  }
  return createHash('sha256').update(secret).digest();
};

export const encryptCredentials = (credentials: Record<string, string>) => {
  const validatedCredentials = CredentialPayloadSchema.parse(credentials);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(validatedCredentials), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    CREDENTIAL_KEY_VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
};

export const decryptCredentials = (payload: string) => {
  const [version, encodedIv, encodedAuthTag, encodedEncrypted] = payload.split('.');
  if (
    version !== CREDENTIAL_KEY_VERSION ||
    !encodedIv ||
    !encodedAuthTag ||
    !encodedEncrypted
  ) {
    throw new Error('Unsupported encrypted credential payload.');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(encodedIv, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(encodedAuthTag, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encodedEncrypted, 'base64url')),
    decipher.final(),
  ]);
  const parsed = CredentialPayloadSchema.safeParse(JSON.parse(decrypted.toString('utf8')));
  if (!parsed.success) throw new Error('Decrypted credentials are invalid.');
  return parsed.data;
};
