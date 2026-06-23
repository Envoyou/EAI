import type { EditorialProfileSnapshot } from './editorial-profile';
import { prisma } from './db';
import { decryptCredentials } from './credential-vault';

export interface CmsPublishedPost {
  title: string;
  slug: string;
}

export interface CmsDraftPayload {
  sourceRef: string;
  title: string;
  slug?: string;
  excerpt: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
  focusKeyword?: string;
  canonicalUrl?: string;
  category?: string;
  tags?: string[];
  coverImageAltText?: string;
  coverImagePrompt?: string;
}

export interface CmsExportResult {
  externalPostId?: string;
  editUrl?: string;
  created?: boolean;
}

export interface CmsAdapter {
  key: string;
  displayName: string;
  listPublishedPosts(limit?: number): Promise<CmsPublishedPost[]>;
  exportDraft(payload: CmsDraftPayload): Promise<CmsExportResult>;
}

export class CmsAdapterError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(
    message: string,
    statusCode = 500,
    code = 'cms_adapter_error'
  ) {
    super(message);
    this.name = 'CmsAdapterError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const normalizeBaseUrl = (value: string) =>
  value.replace(/\/$/, '').replace(/\/api$/, '');

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number
) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const fetchWithRetry = async (
  url: string,
  init: RequestInit,
  timeouts: number[]
) => {
  let lastError: unknown;
  for (const timeout of timeouts) {
    try {
      return await fetchWithTimeout(url, init, timeout);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('CMS request failed after retry.');
};

interface EaiRestAdapterOptions {
  key: string;
  displayName: string;
  baseUrl: string;
  secret: string;
}

export const createEaiRestAdapter = ({
  key,
  displayName,
  baseUrl,
  secret,
}: EaiRestAdapterOptions): CmsAdapter => {
  if (!baseUrl) {
    throw new CmsAdapterError(
      'CMS base URL is not configured.',
      503,
      'cms_base_url_missing'
    );
  }
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  return {
    key,
    displayName,

    async listPublishedPosts(limit = 20) {
      const safeLimit = Math.min(Math.max(Math.round(limit), 1), 100);
      const response = await fetchWithRetry(
        `${normalizedBaseUrl}/api/posts?limit=${safeLimit}`,
        { method: 'GET' },
        [8000, 5000]
      );
      if (!response.ok) {
        throw new CmsAdapterError(
          `CMS catalog request failed with status ${response.status}.`,
          502,
          'cms_catalog_failed'
        );
      }

      const result = await response.json() as any;
      if (!result?.success || !Array.isArray(result.data)) {
        throw new CmsAdapterError(
          'CMS catalog returned an invalid response.',
          502,
          'cms_catalog_invalid'
        );
      }

      return result.data
        .filter((post: unknown): post is { title: string; slug: string } => {
          if (!post || typeof post !== 'object') return false;
          const value = post as Record<string, unknown>;
          return typeof value.title === 'string' && typeof value.slug === 'string';
        })
        .map((post: { title: string; slug: string }) => ({
          title: post.title,
          slug: post.slug,
        }));
    },

    async exportDraft(payload) {
      if (!secret) {
        throw new CmsAdapterError(
          'CMS export secret is not configured.',
          503,
          'cms_secret_missing'
        );
      }

      const response = await fetchWithTimeout(
        `${normalizedBaseUrl}/api/admin/posts/import-from-eai`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-EAI-Secret': secret,
          },
          body: JSON.stringify({
            ...payload,
            status: 'draft',
          }),
        },
        15000
      );
      const result = await response.json().catch(() => null) as any;
      if (!response.ok || !result?.success) {
        const message = result?.error || `CMS export failed with status ${response.status}.`;
        const statusCode =
          /unauthorized/i.test(message) ? 401 :
          /category_not_found|validation/i.test(message) ? 400 :
          502;
        throw new CmsAdapterError(message, statusCode, 'cms_export_failed');
      }

      return {
        externalPostId: result.postId,
        editUrl: result.editUrl,
        created: result.created,
      };
    },
  };
};

const createEnvoyouAdapter = () => createEaiRestAdapter({
  key: 'envoyou-rest-v1',
  displayName: 'Envoyou Blog',
  baseUrl: process.env.BLOG_BACKEND_API_URL || '',
  secret: process.env.BLOG_IMPORT_SHARED_SECRET || '',
});

export const resolveCmsAdapter = (
  profile: EditorialProfileSnapshot
): CmsAdapter => {
  if (profile.profileKey === 'envoyou') {
    return createEnvoyouAdapter();
  }

  throw new CmsAdapterError(
    `CMS adapter is not configured for editorial profile "${profile.profileKey}".`,
    409,
    'cms_adapter_not_configured'
  );
};

export const listPublishedPostsForProfile = async (
  profile: EditorialProfileSnapshot,
  limit = 20
) => (await resolveCmsAdapterForProfile(profile)).listPublishedPosts(limit);

export const resolveCmsAdapterForProfile = async (
  profile: EditorialProfileSnapshot
): Promise<CmsAdapter> => {
  if (profile.profileKey === 'envoyou') {
    return createEnvoyouAdapter();
  }
  if (!profile.organizationId) {
    throw new CmsAdapterError(
      'Editorial profile is not linked to an organization.',
      409,
      'cms_organization_missing'
    );
  }

  const connection = await prisma.cmsConnection.findFirst({
    where: {
      organizationId: profile.organizationId,
      isActive: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!connection) {
    throw new CmsAdapterError(
      `CMS adapter is not configured for editorial profile "${profile.profileKey}".`,
      409,
      'cms_adapter_not_configured'
    );
  }
  if (connection.adapterKey !== 'eai-rest-v1') {
    throw new CmsAdapterError(
      `Unsupported CMS adapter "${connection.adapterKey}".`,
      409,
      'cms_adapter_unsupported'
    );
  }

  const credentials = connection.encryptedCredentials
    ? decryptCredentials(connection.encryptedCredentials)
    : {};
  return createEaiRestAdapter({
    key: connection.adapterKey,
    displayName: connection.name,
    baseUrl: connection.baseUrl,
    secret: credentials.secret || '',
  });
};
