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
import {
  mergeQualityResolutions,
  readQualityResolutions,
  readTrustedSourceUrls,
} from '@/lib/quality-resolution-ledger';
import { ResearchNotesArraySchema } from '@eai/shared';
import type { PublicationStageContext } from '../types';
import {
  sanitizeFactualSummary,
  sanitizeSuppressiveFeedbackItem,
} from '../utils/factual';
import { preparePublicationDraft } from '../utils/text';
import { isMockMode } from './dev-mock';
import {
  assertDraftRevisionMatches,
  readDraftRevisionIdentity,
  type DraftRevisionIdentity,
} from '@/lib/draft-revision';
import { runSerializableTransaction } from '@/lib/serializable-transaction';

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
  system: Record<string, unknown>,
  createdAt: Date,
  expectedRevisionId?: string,
  expectedBodyHash?: string
): { finalDraft: string; draftRevision: DraftRevisionIdentity } => {
  const storedDraft =
    typeof system.polishedDraft === 'string'
      ? preparePublicationDraft(system.polishedDraft)
      : '';
  const requestedDraft = preparePublicationDraft(text);
  if (!storedDraft || storedDraft !== requestedDraft) {
    throw new Error('Save the current final draft before running publication checks.');
  }
  const draftRevision = readDraftRevisionIdentity({
    system,
    body: storedDraft,
    fallbackCreatedAt: createdAt,
  });
  assertDraftRevisionMatches({
    current: draftRevision,
    expectedRevisionId,
    expectedBodyHash,
  });
  return { finalDraft: requestedDraft, draftRevision };
};

const updatePublicationIfRevisionCurrent = async ({
  logId,
  expectedRevision,
  data,
}: {
  logId: string;
  expectedRevision: DraftRevisionIdentity;
  data: Prisma.AnalysisLogUpdateArgs['data'];
}): Promise<void> => {
  await runSerializableTransaction(async (tx) => {
    const current = await tx.analysisLog.findUnique({ where: { id: logId } });
    if (!current) throw new Error('Analysis history not found.');
    const { system } = readStoredState(current.metadata);
    const currentDraft = typeof system.polishedDraft === 'string'
      ? preparePublicationDraft(system.polishedDraft)
      : '';
    const currentRevision = readDraftRevisionIdentity({
      system,
      body: currentDraft,
      fallbackCreatedAt: current.createdAt,
    });
    assertDraftRevisionMatches({
      current: currentRevision,
      expectedRevisionId: expectedRevision.revisionId,
      expectedBodyHash: expectedRevision.bodyHash,
    });
    const currentMetadata = current.metadata
      && typeof current.metadata === 'object'
      && !Array.isArray(current.metadata)
        ? current.metadata as Record<string, unknown>
        : {};
    const requestedMetadata = data.metadata
      && typeof data.metadata === 'object'
      && !Array.isArray(data.metadata)
        ? data.metadata as Record<string, unknown>
        : null;
    const currentSystem = currentMetadata._system
      && typeof currentMetadata._system === 'object'
      && !Array.isArray(currentMetadata._system)
        ? currentMetadata._system as Record<string, unknown>
        : {};
    const requestedSystem = requestedMetadata?._system
      && typeof requestedMetadata._system === 'object'
      && !Array.isArray(requestedMetadata._system)
        ? requestedMetadata._system as Record<string, unknown>
        : {};
    const nextData: Prisma.AnalysisLogUpdateArgs['data'] = requestedMetadata
      ? {
          ...data,
          metadata: {
            ...currentMetadata,
            ...requestedMetadata,
            _system: {
              ...currentSystem,
              ...requestedSystem,
            },
          } as Prisma.InputJsonValue,
        }
      : data;
    await tx.analysisLog.update({ where: { id: logId }, data: nextData });
  });
};

export async function handleQualityGateOnly(
  ctx: PublicationStageContext
): Promise<void> {
  const log = await loadOwnedLog(ctx);
  const { metadata, system } = readStoredState(log.metadata);
  const { finalDraft, draftRevision } = assertCurrentDraft(
    ctx.text,
    system,
    log.createdAt,
    ctx.revisionId,
    ctx.bodyHash
  );
  const confirmedInternalUrls = mergeConfirmedInternalUrls(
    readConfirmedInternalUrls(system),
    log.feedback
  );
  const resolvedQualityFindings = mergeQualityResolutions(
    readQualityResolutions(system),
    log.feedback
  );
  const trustedSourceUrls = readTrustedSourceUrls(resolvedQualityFindings);
  const storedResearchNotes = ResearchNotesArraySchema.safeParse(metadata.researchNotes);
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
        modelOverride: ctx.modelOverride,
        originalDraft: ctx.originalDraft || finalDraft,
        finalDraft,
        metadata: ctx.metadata,
        analysisSpeed: ctx.analysisSpeed,
        trustedInternalUrls: confirmedInternalUrls,
        trustedSourceUrls,
        trustedInternalDomains: ctx.editorialProfile.config.internalLinkDomains,
        resolvedQualityFindings,
        telemetry,
        editorialProfile: ctx.editorialProfile,
        sanitizeFeedback: sanitizeSuppressiveFeedbackItem,
        sanitizeSummary: sanitizeFactualSummary,
        researchNotes: storedResearchNotes.success ? storedResearchNotes.data : [],
        publicationMode: 'fast',
        workingTitle:
          typeof metadata.workingTitle === 'string'
            ? metadata.workingTitle
            : undefined,
        publicationPackage: null,
      });

  const result = response.result;
  await updatePublicationIfRevisionCurrent({
    logId: log.id,
    expectedRevision: draftRevision,
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
          qualityGateState: result.readiness === 'ready' ? 'valid' : 'stale',
          refinementChanges: result.changes,
          qualityGateCheckedAt: new Date().toISOString(),
          confirmedInternalUrls,
          resolvedQualityFindings,
          draftRevision,
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
  ctx.sendEvent('revision_identity', draftRevision);
  ctx.sendEvent('complete', {});
}

export async function handleGenerateSeo(
  ctx: PublicationStageContext
): Promise<void> {
  const log = await loadOwnedLog(ctx);
  const { metadata, system } = readStoredState(log.metadata);
  const { finalDraft, draftRevision } = assertCurrentDraft(
    ctx.text,
    system,
    log.createdAt,
    ctx.revisionId,
    ctx.bodyHash
  );
  if (system.readiness !== 'ready') {
    throw new Error('Complete or approve the current quality findings before generating SEO metadata.');
  }

  ctx.sendEvent('status', 'generating_seo');
  const telemetry = new AiTelemetryCollector();
  const confirmedInternalUrls = mergeConfirmedInternalUrls(
    readConfirmedInternalUrls(system),
    log.feedback
  );
  const resolvedQualityFindings = mergeQualityResolutions(
    readQualityResolutions(system),
    log.feedback
  );
  const trustedSourceUrls = readTrustedSourceUrls(resolvedQualityFindings);
  const storedResearchNotes = ResearchNotesArraySchema.safeParse(metadata.researchNotes);
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

  ctx.sendEvent('seo_metadata', seo);
  ctx.sendEvent('status', 'quality_gate');
  const qualityGateResponse = missingKey
    ? {
        modelName: 'dev-mock-quality-gate',
        result: {
          readiness: 'ready' as const,
          summary: '[DEV MODE] The final draft and publication metadata passed the quality check.',
          changes: ['Checked the final draft and publication metadata together.'],
          feedback: [],
          flags: [],
        },
      }
    : await runFinalQualityGateSafely({
        signal: ctx.state.signal,
        provider: ctx.effectiveProvider,
        modelOverride: ctx.modelOverride,
        originalDraft: log.content || finalDraft,
        finalDraft,
        metadata: ctx.metadata,
        analysisSpeed: ctx.analysisSpeed,
        trustedInternalUrls: confirmedInternalUrls,
        trustedSourceUrls,
        trustedInternalDomains: ctx.editorialProfile.config.internalLinkDomains,
        resolvedQualityFindings,
        telemetry,
        editorialProfile: ctx.editorialProfile,
        sanitizeFeedback: sanitizeSuppressiveFeedbackItem,
        sanitizeSummary: sanitizeFactualSummary,
        researchNotes: storedResearchNotes.success ? storedResearchNotes.data : [],
        publicationMode: 'publish_ready',
        workingTitle: seo.title,
        publicationPackage: seo,
      });
  const qualityGate = qualityGateResponse.result;

  await updatePublicationIfRevisionCurrent({
    logId: log.id,
    expectedRevision: draftRevision,
    data: {
      verdict: qualityGate.readiness,
      summary: qualityGate.summary,
      feedback: qualityGate.feedback as Prisma.InputJsonValue,
      flags: qualityGate.flags as Prisma.InputJsonValue,
      metadata: {
        ...metadata,
        generatedMetadata: seo,
        publicationPackageStatus: 'current',
        _system: {
          ...system,
          readiness: qualityGate.readiness,
          refinementChanges: qualityGate.changes,
          publicationPackageStatus: 'current',
          qualityGateState: qualityGate.readiness === 'ready' ? 'valid' : 'stale',
          seoReviewState: 'valid',
          seoGeneratedAt: new Date().toISOString(),
          qualityGateCheckedAt: new Date().toISOString(),
          confirmedInternalUrls,
          resolvedQualityFindings,
          draftRevision,
        },
      } as Prisma.InputJsonValue,
    },
  });
  ctx.sendEvent('feedback_reset', null);
  ctx.sendEvent('readiness', qualityGate.readiness);
  ctx.sendEvent('summary', qualityGate.summary);
  ctx.sendEvent('changes', qualityGate.changes);
  qualityGate.feedback.forEach((item, index) =>
    ctx.sendEvent('feedback_item', { item, index })
  );
  ctx.sendEvent('flags', qualityGate.flags);
  ctx.sendEvent('publication_package_status', 'current');
  ctx.sendEvent('revision_identity', draftRevision);
  ctx.sendEvent('complete', {});
}
