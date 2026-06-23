import { Router } from 'express';
import { prisma, Prisma } from '@/lib/db';
import { requireAuth } from '@/middleware/auth';
import {
  CmsAdapterError,
  CmsExportResult,
  resolveCmsAdapterForProfile,
} from '@/lib/cms-adapter';
import { resolveEditorialProfileForUser } from '@/lib/editorial-profile-server';
import { getWorkspaceState } from '@/lib/user-workspace';
import { getAllFeatureFlags } from '@eai/shared/server';

const router = Router();

// POST /api/export
router.post('/', requireAuth, async (req, res) => {
  try {
    const featureFlags = await getAllFeatureFlags();
    if (featureFlags.maintenance_mode || !featureFlags.cms_export_enabled) {
      return res.status(503).json({
        error: featureFlags.maintenance_mode
          ? 'CMS export is temporarily paused for maintenance.'
          : 'CMS export is temporarily disabled.',
      });
    }

    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    
    if (!workspace || workspace.needsOnboarding) {
      return res.status(409).json({ error: 'Workspace onboarding must be completed before export.' });
    }

    const { 
      analysisLogId, 
      sourceRef, 
      title, 
      slug, 
      excerpt, 
      content, 
      metaTitle, 
      metaDescription, 
      focusKeyword, 
      canonicalUrl, 
      category, 
      tags, 
      coverImageAltText,
      coverImagePrompt 
    } = req.body;

    if (!analysisLogId || !sourceRef || !title || !excerpt || !content || !metaTitle || !metaDescription) {
      return res.status(400).json({ error: 'Missing required fields for export.' });
    }

    // Load and check ownership of the logEntry before proceeding to blog api call
    const logEntry = await prisma.analysisLog.findUnique({
      where: { id: analysisLogId },
    });

    if (!logEntry) {
      return res.status(404).json({ error: 'Analysis log not found.' });
    }

    const sameWorkspace = Boolean(workspace.organizationId && logEntry.organizationId === workspace.organizationId);
    const legacyOwnLog = !logEntry.organizationId && logEntry.userId === userId;
    if (!sameWorkspace && !legacyOwnLog) {
      return res.status(403).json({ error: 'Unauthorized to export this log.' });
    }

    const storedMetadata =
      logEntry.metadata && typeof logEntry.metadata === 'object'
        ? (logEntry.metadata as Record<string, unknown>)
        : {};
    const systemMetadata =
      storedMetadata._system && typeof storedMetadata._system === 'object'
        ? (storedMetadata._system as Record<string, unknown>)
        : {};
    if (
      systemMetadata.analysisSpeed === 'fast' ||
      systemMetadata.readiness !== 'ready' ||
      logEntry.editorStatus !== 'refined'
    ) {
      return res.status(409).json({ error: 'Only a Publish Ready article that passed the quality gate can be exported.' });
    }

    const payload = {
      sourceRef,
      title,
      slug,
      excerpt,
      content,
      metaTitle,
      metaDescription,
      focusKeyword,
      canonicalUrl,
      category,
      tags,
      coverImageAltText,
      coverImagePrompt,
    };

    let exportResult: CmsExportResult | null = null;
    let cmsAdapterKey = 'unresolved';
    let isSuccess = false;
    let errorMessage = '';
    let errorStatusCode = 500;

    try {
      const editorialProfile = await resolveEditorialProfileForUser(userId, workspace.organizationId);
      const cmsAdapter = await resolveCmsAdapterForProfile(editorialProfile);
      cmsAdapterKey = cmsAdapter.key;
      exportResult = await cmsAdapter.exportDraft(payload);
      isSuccess = true;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      if (error instanceof CmsAdapterError) {
        errorStatusCode = error.statusCode;
      }
    }

    // Persist to database atomically
    try {
      if (logEntry) {
        const metadata = logEntry.metadata && typeof logEntry.metadata === 'object' ? logEntry.metadata as Record<string, unknown> : {};
        
        if (isSuccess) {
          metadata.exportStatus = {
            cmsAdapterKey,
            externalPostId: exportResult?.externalPostId,
            editUrl: exportResult?.editUrl,
            blogPostId: exportResult?.externalPostId,
            blogEditUrl: exportResult?.editUrl,
            lastExportedAt: new Date().toISOString(),
            lastExportStatus: 'success',
          };
          // Preserve sourceRef if not present
          metadata.sourceRef = metadata.sourceRef || sourceRef;
        } else {
          metadata.exportStatus = {
            ...(metadata.exportStatus || {}),
            cmsAdapterKey,
            lastExportedAt: new Date().toISOString(),
            lastExportStatus: 'failed',
            lastExportError: errorMessage,
          };
        }

        await prisma.analysisLog.update({
          where: { id: analysisLogId },
          data: { 
            metadata: metadata as Prisma.InputJsonValue,
            ...(isSuccess ? { editorStatus: 'exported' } : {})
          },
        });
      }
    } catch (dbError) {
      console.error('Failed to update AnalysisLog metadata after export:', dbError);
    }

    if (isSuccess) {
      return res.json({
        success: true,
        cmsAdapterKey,
        postId: exportResult?.externalPostId,
        editUrl: exportResult?.editUrl,
        created: exportResult?.created,
      });
    } else {
      return res.status(errorStatusCode).json({ error: errorMessage, cmsAdapterKey });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during export.';
    return res.status(500).json({ error: errorMessage });
  }
});

export default router;
