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
import { FeedbackItemSchema, ResearchNotesArraySchema, SeoMetadataSchema } from '@eai/shared';
import type { FeedbackItem, FinalQualityGateOutput, PublicationPackage, SeoField, ValidationScope } from '@eai/shared';
import type { PublicationStageContext } from '../types';
import {
  sanitizeFactualSummary,
  sanitizeSuppressiveFeedbackItem,
} from '../utils/factual';
import { preparePublicationDraft } from '../utils/text';
import { isMockMode } from './dev-mock';
import {
  assertDraftRevisionMatches,
  readContentBlockSnapshots,
  readDraftRevisionIdentity,
  readStoredContentBlocks,
  type DraftRevisionIdentity,
} from '@/lib/draft-revision';
import { runSerializableTransaction } from '@/lib/serializable-transaction';
import {
  assignPersistentEditorialIdentities,
  EditorialIdentityStateSchema,
} from '@/lib/editorial-identity';
import {
  buildValidationScope,
  StoredValidationResultSchema,
  VALIDATION_POLICY_VERSION,
} from '@/lib/validation-scope';
import { applyDeterministicQualityChecks } from '@/lib/final-quality';
import {
  createValidSeoFieldStates,
  markSeoFieldsValid,
  readSeoFieldStates,
  resolveStatusFromSeoFields,
  SAFE_AUTO_REFRESH_SEO_FIELDS,
} from '@/lib/seo-field-state';

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

const readStoredFeedback = (value: unknown): FeedbackItem[] => Array.isArray(value)
  ? value.flatMap((item) => {
      const parsed = FeedbackItemSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    })
  : [];

const buildScopedDraft = (
  finalDraft: string,
  system: Record<string, unknown>,
  scope: ValidationScope
): string => {
  const snapshots = readContentBlockSnapshots({
    body: finalDraft,
    storedBlocks: readStoredContentBlocks(system),
  });
  const changed = new Set(scope.changedBlockIds);
  const selectedIndexes = new Set<number>();
  if (snapshots.length > 0) {
    selectedIndexes.add(0);
    selectedIndexes.add(snapshots.length - 1);
  }
  snapshots.forEach((block, index) => {
    if (!changed.has(block.blockId)) return;
    selectedIndexes.add(index);
    if (index > 0) selectedIndexes.add(index - 1);
    if (index + 1 < snapshots.length) selectedIndexes.add(index + 1);
  });
  const selected = snapshots.filter((_block, index) => selectedIndexes.has(index));
  return (selected.length > 0 ? selected : snapshots.slice(0, 3))
    .map((block) => block.content)
    .join('\n\n');
};

const mergeIncrementalFeedback = ({
  existing,
  current,
  scope,
}: {
  existing: FeedbackItem[];
  current: FeedbackItem[];
  scope: ValidationScope;
}): FinalQualityGateOutput['feedback'] => {
  const affectedFeedback = new Set(scope.affectedFeedbackIds);
  const affectedClaims = new Set(scope.affectedClaimIds);
  const affectedBlocks = new Set(scope.changedBlockIds);
  const retained = existing.filter((item) => {
    if (item.status === 'pass' || item.isApplied || item.isAccepted || item.isVerified) return false;
    return !(
      (item.feedbackId && affectedFeedback.has(item.feedbackId))
      || (item.claimId && affectedClaims.has(item.claimId))
      || (item.blockId && affectedBlocks.has(item.blockId))
    );
  });
  const byIdentity = new Map<string, FeedbackItem>();
  [...retained, ...current].forEach((item) => {
    const key = item.feedbackId
      ?? [item.category, item.targetText ?? item.message, item.targetField ?? 'body'].join('::');
    byIdentity.set(key, item);
  });
  return Array.from(byIdentity.values()).map((item) => ({
    ...item,
    operation: item.operation ?? 'manual',
  }));
};

const aggregateIncrementalResult = ({
  result,
  feedback,
  mode,
}: {
  result: FinalQualityGateOutput;
  feedback: FinalQualityGateOutput['feedback'];
  mode: ValidationScope['validationMode'];
}): FinalQualityGateOutput => {
  const readiness = feedback.some((item) => item.status === 'fail')
    ? 'blocked'
    : feedback.length > 0
      ? 'needs_review'
      : 'ready';
  return {
    ...result,
    readiness,
    feedback,
    flags: readiness === 'ready' ? [] : result.flags,
    summary: readiness === 'ready'
      ? `The ${mode} validation passed for the current revision; unchanged checks were retained.`
      : result.summary,
  };
};

export async function handleValidateRevision(
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
  const existingFeedback = readStoredFeedback(log.feedback);
  const scope = buildValidationScope({ system, feedback: existingFeedback });
  ctx.sendEvent('validation_scope', scope);
  const parsedPreviousValidation = StoredValidationResultSchema.safeParse(
    system.lastValidationResult
  );
  const previousValidation = parsedPreviousValidation.success
    ? parsedPreviousValidation.data
    : null;
  if (
    previousValidation?.revisionId === draftRevision.revisionId
    && previousValidation.bodyHash === draftRevision.bodyHash
    && typeof previousValidation.automatedRounds === 'number'
    && previousValidation.automatedRounds >= 1
  ) {
    const readiness = system.readiness === 'ready'
      || system.readiness === 'needs_review'
      || system.readiness === 'blocked'
        ? system.readiness
        : 'needs_review';
    ctx.sendEvent('feedback_reset', null);
    ctx.sendEvent('readiness', readiness);
    ctx.sendEvent('summary', log.summary ?? 'The current revision already has an automatic validation result.');
    ctx.sendEvent('changes', ['Reused the existing validation result for this exact revision.']);
    existingFeedback.forEach((item, index) =>
      ctx.sendEvent('feedback_item', { item, index })
    );
    ctx.sendEvent('flags', Array.isArray(log.flags) ? log.flags : []);
    ctx.sendEvent('revision_identity', draftRevision);
    ctx.sendEvent('complete', {});
    return;
  }
  if (scope.validationMode === 'full') {
    await handleQualityGateOnly(ctx, scope);
    return;
  }

  ctx.sendEvent('status', 'quality_gate');
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
  const researchNotes = storedResearchNotes.success ? storedResearchNotes.data : [];
  const identityState = EditorialIdentityStateSchema.safeParse(system.editorialIdentities);
  const affectedSourceIds = new Set(scope.affectedSourceIds);
  const affectedResearchNoteIds = identityState.success
    ? new Set(identityState.data.sources
        .filter((source) => affectedSourceIds.has(source.sourceId))
        .flatMap((source) => source.researchNoteId ? [source.researchNoteId] : []))
    : new Set<string>();
  const scopedResearchNotes = affectedResearchNoteIds.size > 0
    ? researchNotes.filter((note) => affectedResearchNoteIds.has(note.id))
    : researchNotes;
  const language = ctx.metadata?.outputLanguage === 'id' ? 'id' : 'en';
  let result: FinalQualityGateOutput;

  if (scope.validationMode === 'targeted' && !isMockMode(ctx.effectiveProvider)) {
    const scopedDraft = buildScopedDraft(finalDraft, system, scope);
    const telemetry = new AiTelemetryCollector();
    const response = await runFinalQualityGateSafely({
      signal: ctx.state.signal,
      provider: ctx.effectiveProvider,
      modelOverride: ctx.modelOverride,
      originalDraft: scopedDraft,
      finalDraft: scopedDraft,
      deterministicDraft: finalDraft,
      deterministicOriginalDraft: log.content || finalDraft,
      identityDraft: finalDraft,
      identitySystem: system,
      identityFallbackCreatedAt: log.createdAt,
      taskInstruction: [
        'Validate only the changed passage and its nearby context.',
        'Check the affected claim, source support, factual qualifiers, and local coherence.',
        'The first and last excerpts are non-contiguous global coherence anchors; compare meaning but do not judge transitions between excerpts.',
        'Do not reopen unrelated editorial decisions or invent findings outside this passage.',
      ].join(' '),
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
      researchNotes: scopedResearchNotes,
      publicationMode: 'fast',
      workingTitle: typeof metadata.workingTitle === 'string' ? metadata.workingTitle : undefined,
      publicationPackage: null,
    });
    result = response.result;
  } else {
    result = applyDeterministicQualityChecks({
      readiness: 'ready',
      summary: 'The changed blocks passed deterministic and lightweight coherence checks.',
      changes: ['Validated only the blocks and dependencies changed in the current revision.'],
      feedback: [],
      flags: [],
    }, finalDraft, log.content || finalDraft, {
      trustedInternalUrls: confirmedInternalUrls,
      trustedSourceUrls,
      trustedInternalDomains: ctx.editorialProfile.config.internalLinkDomains,
      trustedEntities: [ctx.editorialProfile.config.brandName],
      allowedEditorialTerms: ctx.editorialProfile.config.allowedEditorialTerms,
      language,
      publicationMode: 'fast',
    });
  }

  const identified = assignPersistentEditorialIdentities({
    feedback: result.feedback,
    finalDraft,
    system,
    researchNotes,
    fallbackCreatedAt: log.createdAt,
  });
  const mergedFeedback = mergeIncrementalFeedback({
    existing: existingFeedback,
    current: identified.feedback,
    scope,
  });
  const aggregated = aggregateIncrementalResult({
    result: { ...result, feedback: identified.feedback },
    feedback: mergedFeedback,
    mode: scope.validationMode,
  });
  const checkedAt = new Date().toISOString();
  await updatePublicationIfRevisionCurrent({
    logId: log.id,
    expectedRevision: draftRevision,
    data: {
      verdict: aggregated.readiness,
      summary: aggregated.summary,
      feedback: aggregated.feedback as unknown as Prisma.InputJsonValue,
      flags: aggregated.flags as Prisma.InputJsonValue,
      metadata: {
        ...metadata,
        _system: {
          ...system,
          readiness: aggregated.readiness,
          qualityGateState: aggregated.readiness === 'ready' ? 'valid' : 'stale',
          incrementalValidationCheckedAt: checkedAt,
          lastValidationResult: {
            policyVersion: VALIDATION_POLICY_VERSION,
            revisionId: draftRevision.revisionId,
            bodyHash: draftRevision.bodyHash,
            validationLevel: scope.validationMode,
            status: aggregated.readiness === 'ready' ? 'passed' : aggregated.readiness,
            checkedAt,
            scope,
            automatedRounds: 1,
          },
          editorialIdentities: identified.editorialIdentities,
          draftRevision,
        },
      } as unknown as Prisma.InputJsonValue,
    },
  });

  ctx.sendEvent('feedback_reset', null);
  ctx.sendEvent('readiness', aggregated.readiness);
  ctx.sendEvent('summary', aggregated.summary);
  ctx.sendEvent('changes', aggregated.changes);
  aggregated.feedback.forEach((item, index) =>
    ctx.sendEvent('feedback_item', { item, index })
  );
  ctx.sendEvent('flags', aggregated.flags);
  ctx.sendEvent('revision_identity', draftRevision);
  ctx.sendEvent('complete', {});
}

export async function handleQualityGateOnly(
  ctx: PublicationStageContext,
  incrementalScope?: ValidationScope
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
        identitySystem: system,
        identityFallbackCreatedAt: log.createdAt,
      });

  const identified = assignPersistentEditorialIdentities({
    feedback: response.result.feedback,
    finalDraft,
    system,
    researchNotes: storedResearchNotes.success ? storedResearchNotes.data : [],
    fallbackCreatedAt: log.createdAt,
  });
  const result = { ...response.result, feedback: identified.feedback };
  await updatePublicationIfRevisionCurrent({
    logId: log.id,
    expectedRevision: draftRevision,
    data: {
      verdict: result.readiness,
      summary: result.summary,
      feedback: result.feedback as unknown as Prisma.InputJsonValue,
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
          editorialIdentities: identified.editorialIdentities,
          ...(incrementalScope
            ? {
                incrementalValidationCheckedAt: new Date().toISOString(),
                lastValidationResult: {
                  policyVersion: VALIDATION_POLICY_VERSION,
                  revisionId: draftRevision.revisionId,
                  bodyHash: draftRevision.bodyHash,
                  validationLevel: 'full',
                  status: result.readiness === 'ready' ? 'passed' : result.readiness,
                  checkedAt: new Date().toISOString(),
                  scope: incrementalScope,
                  automatedRounds: 1,
                },
              }
            : {}),
        },
      } as unknown as Prisma.InputJsonValue,
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
        identitySystem: system,
        identityFallbackCreatedAt: log.createdAt,
      });
  const identified = assignPersistentEditorialIdentities({
    feedback: qualityGateResponse.result.feedback,
    finalDraft,
    system,
    researchNotes: storedResearchNotes.success ? storedResearchNotes.data : [],
    fallbackCreatedAt: log.createdAt,
  });
  const qualityGate = {
    ...qualityGateResponse.result,
    feedback: identified.feedback,
  };
  const seoFieldStates = createValidSeoFieldStates(draftRevision);

  await updatePublicationIfRevisionCurrent({
    logId: log.id,
    expectedRevision: draftRevision,
    data: {
      verdict: qualityGate.readiness,
      summary: qualityGate.summary,
      feedback: qualityGate.feedback as unknown as Prisma.InputJsonValue,
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
          seoFieldStates,
          seoGeneratedAt: new Date().toISOString(),
          qualityGateCheckedAt: new Date().toISOString(),
          confirmedInternalUrls,
          resolvedQualityFindings,
          draftRevision,
          editorialIdentities: identified.editorialIdentities,
        },
      } as unknown as Prisma.InputJsonValue,
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
  ctx.sendEvent('seo_field_states', seoFieldStates);
  ctx.sendEvent('revision_identity', draftRevision);
  ctx.sendEvent('complete', {});
}

export async function handleRefreshSeoFields(
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
    throw new Error('Complete the current content validation before refreshing SEO fields.');
  }
  const storedPackage = SeoMetadataSchema.safeParse(metadata.generatedMetadata);
  if (!storedPackage.success) {
    throw new Error('Generate publication metadata before refreshing dependent SEO fields.');
  }
  const requested = Array.from(new Set(ctx.seoFields ?? []))
    .filter((field): field is SeoField => SAFE_AUTO_REFRESH_SEO_FIELDS.includes(field));
  const currentStates = readSeoFieldStates(system.seoFieldStates);
  const fields = requested.filter((field) => currentStates[field]?.status === 'stale');
  if (fields.length === 0) {
    ctx.sendEvent('seo_metadata', storedPackage.data);
    ctx.sendEvent('seo_field_states', currentStates);
    ctx.sendEvent('publication_package_status', resolveStatusFromSeoFields(currentStates, true));
    ctx.sendEvent('complete', {});
    return;
  }

  ctx.sendEvent('status', 'generating_seo');
  const missingKey = isMockMode(ctx.effectiveProvider);
  const candidate: PublicationPackage = missingKey
    ? {
        excerpt: 'A concise publication excerpt for the saved final draft.',
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
        telemetry: new AiTelemetryCollector(),
      });
  const merged: PublicationPackage = { ...storedPackage.data };
  fields.forEach((field) => {
    if (field === 'tags') {
      if (candidate.tags) merged.tags = candidate.tags;
      return;
    }
    const value = candidate[field];
    if (typeof value === 'string') merged[field] = value;
  });
  const deterministicAudit = applyDeterministicQualityChecks({
    readiness: 'ready',
    summary: 'Checked refreshed publication metadata.',
    changes: [],
    feedback: [],
    flags: [],
  }, finalDraft, finalDraft, {
    language: ctx.metadata?.outputLanguage === 'id' ? 'id' : 'en',
    publicationMode: 'publish_ready',
    publicationPackage: merged,
    seoRules: ctx.editorialProfile.config.seoRules,
  });
  const targetByField: Partial<Record<SeoField, string>> = {
    excerpt: 'publication.excerpt',
    metaDescription: 'publication.metaDescription',
    coverImageAltText: 'publication.coverImageAlt',
    tags: 'publication.tags',
  };
  const draftNumbers = new Set(finalDraft.match(/\d[\d.,:%/-]*/gu) ?? []);
  const hasUnsupportedNumbers = (field: SeoField): boolean => {
    const value = field === 'tags'
      ? merged.tags?.join(' ') ?? ''
      : typeof merged[field] === 'string' ? merged[field] : '';
    return (value.match(/\d[\d.,:%/-]*/gu) ?? []).some((number) => !draftNumbers.has(number));
  };
  const validFields = fields.filter((field) =>
    !hasUnsupportedNumbers(field)
    && !deterministicAudit.feedback.some((item) =>
      item.status === 'fail' && item.targetField === targetByField[field]
    )
  );
  const persistedPackage: PublicationPackage = { ...storedPackage.data };
  validFields.forEach((field) => {
    if (field === 'tags') persistedPackage.tags = merged.tags;
    else {
      const value = merged[field];
      if (typeof value === 'string') persistedPackage[field] = value;
    }
  });
  const seoFieldStates = markSeoFieldsValid(currentStates, validFields, draftRevision);
  const publicationPackageStatus = resolveStatusFromSeoFields(seoFieldStates, true);
  await updatePublicationIfRevisionCurrent({
    logId: log.id,
    expectedRevision: draftRevision,
    data: {
      metadata: {
        ...metadata,
        generatedMetadata: persistedPackage,
        publicationPackageStatus,
        _system: {
          ...system,
          publicationPackageStatus,
          seoFieldStates,
          seoReviewState: publicationPackageStatus === 'current' ? 'valid' : 'stale',
          seoPartiallyRefreshedAt: new Date().toISOString(),
          draftRevision,
        },
      } as unknown as Prisma.InputJsonValue,
    },
  });
  ctx.sendEvent('seo_metadata', persistedPackage);
  ctx.sendEvent('seo_field_states', seoFieldStates);
  ctx.sendEvent('publication_package_status', publicationPackageStatus);
  ctx.sendEvent('revision_identity', draftRevision);
  ctx.sendEvent('complete', {});
}
