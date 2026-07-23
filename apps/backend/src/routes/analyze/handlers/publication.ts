import type { Prisma } from '@/lib/db';
import { prisma } from '@/lib/db';
import { AiTelemetryCollector } from '@/lib/ai-telemetry';
import { resolveModel } from '@/lib/ai/model-router';
import { SeoPromptComposer } from '@/lib/ai/prompt-engine/composer/seo-composer';
import { runFinalQualityGateSafely } from '@/lib/ai/quality-gate-stage';
import { runSeoStage } from '@/lib/ai/seo-stage';
import {
  mergeConfirmedInternalUrls,
  readConfirmedInternalUrls,
} from '@/lib/confirmed-internal-links';
import type { PublicationStageContext } from '../types';
import {
  sanitizeFactualSummary,
  sanitizeSuppressiveFeedbackItem,
} from '../utils/factual';
import { preparePublicationDraft } from '../utils/text';
import { isMockMode } from './dev-mock';

const loadOwnedLog = async (ctx: PublicationStageContext) => {
  if (!ctx.userId) {
    throw new Error('Sign in to update a saved publication.');
  }
  const log = await prisma.analysisLog.findUnique({
    where: { id: ctx.analysisLogId },
  });
  if (!log) throw new Error('Analysis history not found.');
  const sameWorkspace = Boolean(
    ctx.workspace.organizationId &&
    log.organizationId === ctx.workspace.organizationId
  );
  const legacyOwnLog = !log.organizationId && log.userId === ctx.userId;
  if (!sameWorkspace && !legacyOwnLog) {
    throw new Error('You do not have access to this publication.');
  }
  return log;
};

const readStoredState = (metadataValue: unknown) => {
  const metadata =
    metadataValue && typeof metadataValue === 'object' && !Array.isArray(metadataValue)
      ? (metadataValue as Record<string, unknown>)
      : {};
  const system =
    metadata._system && typeof metadata._system === 'object' && !Array.isArray(metadata._system)
      ? (metadata._system as Record<string, unknown>)
      : {};
  return { metadata, system };
};

const assertCurrentDraft = (
  text: string,
  system: Record<string, unknown>
) => {
  const storedDraft =
    typeof system.polishedDraft === 'string'
      ? preparePublicationDraft(system.polishedDraft)
      : '';
  const requestedDraft = preparePublicationDraft(text);
  if (!storedDraft || storedDraft !== requestedDraft) {
    throw new Error('Save the current final draft before running publication checks.');
  }
  return requestedDraft;
};

export async function handleQualityGateOnly(
  ctx: PublicationStageContext
): Promise<void> {
  const log = await loadOwnedLog(ctx);
  const { metadata, system } = readStoredState(log.metadata);
  const finalDraft = assertCurrentDraft(ctx.text, system);
  const confirmedInternalUrls = mergeConfirmedInternalUrls(
    readConfirmedInternalUrls(system),
    log.feedback
  );
  ctx.sendEvent('status', 'quality_gate');

  const telemetry = new AiTelemetryCollector();
  const missingKey = isMockMode(ctx.effectiveProvider);
  const response = missingKey
    ? {
        modelName: 'dev-mock-quality-gate',
        result: {
          readiness: 'ready' as const,
          summary: '[DEV MODE] The saved final draft passed the content quality check.',
          changes: ['Checked the saved final draft without rewriting it.'],
          feedback: [],
          flags: [],
        },
      }
    : await runFinalQualityGateSafely({
        signal: ctx.state.signal,
        provider: ctx.effectiveProvider,
        originalDraft: ctx.originalDraft || finalDraft,
        finalDraft,
        metadata: ctx.metadata,
        analysisSpeed: ctx.analysisSpeed,
        trustedInternalUrls: confirmedInternalUrls,
        trustedInternalDomains: ctx.editorialProfile.config.internalLinkDomains,
        telemetry,
        editorialProfile: ctx.editorialProfile,
        sanitizeFeedback: sanitizeSuppressiveFeedbackItem,
        sanitizeSummary: sanitizeFactualSummary,
        researchNotes: [],
        publicationMode: 'fast',
        workingTitle:
          typeof metadata.workingTitle === 'string'
            ? metadata.workingTitle
            : undefined,
        publicationPackage: null,
      });

  const result = response.result;
  await prisma.analysisLog.update({
    where: { id: log.id },
    data: {
      verdict: result.readiness,
      summary: result.summary,
      feedback: result.feedback as Prisma.InputJsonValue,
      flags: result.flags as Prisma.InputJsonValue,
      metadata: {
        ...metadata,
        _system: {
          ...system,
          polishedDraft: finalDraft,
          readiness: result.readiness,
          refinementChanges: result.changes,
          qualityGateCheckedAt: new Date().toISOString(),
          confirmedInternalUrls,
        },
      } as Prisma.InputJsonValue,
    },
  });

  ctx.sendEvent('feedback_reset', null);
  ctx.sendEvent('readiness', result.readiness);
  ctx.sendEvent('summary', result.summary);
  ctx.sendEvent('changes', result.changes);
  result.feedback.forEach((item, index) =>
    ctx.sendEvent('feedback_item', { item, index })
  );
  ctx.sendEvent('flags', result.flags);
  ctx.sendEvent('complete', {});
}

export async function handleGenerateSeo(
  ctx: PublicationStageContext
): Promise<void> {
  const log = await loadOwnedLog(ctx);
  const { metadata, system } = readStoredState(log.metadata);
  const finalDraft = assertCurrentDraft(ctx.text, system);
  if (system.readiness !== 'ready') {
    throw new Error('Complete or approve the current quality findings before generating SEO metadata.');
  }

  ctx.sendEvent('status', 'generating_seo');
  const telemetry = new AiTelemetryCollector();
  const missingKey = isMockMode(ctx.effectiveProvider);
  const seo = missingKey
    ? {
        title: 'Mock Publication Title',
        slug: 'mock-publication-title',
        excerpt: 'A concise publication excerpt for the saved final draft.',
        metaTitle: 'Mock Publication Title',
        metaDescription: 'A concise meta description generated for the saved final draft.',
        coverImageAltText: 'Cover image for the saved final draft',
        tags: ['editorial', 'content strategy', 'publishing'],
      }
    : await runSeoStage({
        signal: ctx.state.signal,
        provider: ctx.effectiveProvider,
        modelName: resolveModel(
          ctx.effectiveProvider,
          'seo',
          ctx.analysisSpeed,
          ctx.modelOverride
        ),
        article: finalDraft,
        metadata: ctx.metadata,
        editorialProfile: ctx.editorialProfile,
        systemInstruction: new SeoPromptComposer(ctx.editorialProfile.config, {
          includeTextSchema: ctx.effectiveProvider !== 'gemini',
        }).compose('xml'),
        telemetry,
      });

  await prisma.analysisLog.update({
    where: { id: log.id },
    data: {
      metadata: {
        ...metadata,
        generatedMetadata: seo,
        publicationPackageStatus: 'current',
        _system: {
          ...system,
          publicationPackageStatus: 'current',
          seoGeneratedAt: new Date().toISOString(),
        },
      } as Prisma.InputJsonValue,
    },
  });
  ctx.sendEvent('seo_metadata', seo);
  ctx.sendEvent('publication_package_status', 'current');
  ctx.sendEvent('complete', {});
}
