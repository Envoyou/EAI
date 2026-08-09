import { createHash } from 'node:crypto';
import type { AnalysisLog, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

const NON_PRODUCTION_ENV_PATTERN = /^(development|dev|test|testing|staging|stage|preview)$/u;

const recordOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

export const resolveEvaluationEnvironment = (): string =>
  (
    process.env.EDITORIAL_EVALUATION_ENVIRONMENT
    || process.env.RAILWAY_ENVIRONMENT_NAME
    || process.env.VERCEL_ENV
    || process.env.NODE_ENV
    || 'unknown'
  ).trim().toLowerCase();

export const isEditorialEvaluationCaptureEnabled = (): boolean => {
  if (process.env.EDITORIAL_EVALUATION_CAPTURE === 'true') return true;
  if (process.env.EDITORIAL_EVALUATION_CAPTURE === 'false') return false;
  return NON_PRODUCTION_ENV_PATTERN.test(resolveEvaluationEnvironment());
};

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const asJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const words = (value: string): string[] =>
  value.trim().split(/\s+/u).filter(Boolean);

const headings = (value: string): string[] =>
  value.split('\n').filter(line => /^#{1,6}\s+/u.test(line.trim())).map(line => line.trim());

const urls = (value: string): string[] =>
  [...new Set(value.match(/https?:\/\/[^\s)\]]+/gu) ?? [])];

export const classifyEditorialChanges = (before: string, after: string) => {
  const beforeWords = words(before);
  const afterWords = words(after);
  const beforeOpening = before.split(/\n\s*\n/u)[0]?.trim() ?? '';
  const afterOpening = after.split(/\n\s*\n/u)[0]?.trim() ?? '';
  const beforeHeadings = headings(before);
  const afterHeadings = headings(after);
  const beforeUrls = urls(before);
  const afterUrls = urls(after);
  return {
    beforeWordCount: beforeWords.length,
    afterWordCount: afterWords.length,
    wordCountDelta: afterWords.length - beforeWords.length,
    openingChanged: beforeOpening !== afterOpening,
    headingsChanged: JSON.stringify(beforeHeadings) !== JSON.stringify(afterHeadings),
    headingsBefore: beforeHeadings,
    headingsAfter: afterHeadings,
    sourcesAdded: afterUrls.filter(url => !beforeUrls.includes(url)),
    sourcesRemoved: beforeUrls.filter(url => !afterUrls.includes(url)),
  };
};

type AnalysisTransitionContext = {
  inputFeedback?: unknown;
  outputFeedback?: unknown;
};

const upsertTransition = async (
  tx: Prisma.TransactionClient,
  data: Prisma.EditorialEvaluationTransitionCreateInput,
) => tx.editorialEvaluationTransition.upsert({
  where: { transitionKey: data.transitionKey },
  create: data,
  update: {},
});

const hasTenantEditorialEvaluationConsent = async (
  tx: Prisma.TransactionClient,
  organizationId: string | null,
): Promise<boolean> => {
  if (!organizationId) return false;
  const organization = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { editorialEvaluationConsent: true },
  });
  return organization?.editorialEvaluationConsent === true;
};

const readEvaluationFields = (log: AnalysisLog) => {
  const metadata = recordOf(log.metadata);
  const system = recordOf(metadata._system);
  const telemetry = recordOf(system.telemetry);
  const stages = Array.isArray(telemetry.stages) ? telemetry.stages : [];
  const firstStage = recordOf(stages[0]);
  const output =
    typeof system.polishedDraft === 'string'
      ? system.polishedDraft
      : typeof metadata.polishedDraft === 'string'
        ? metadata.polishedDraft
        : typeof metadata.finalDraft === 'string'
          ? metadata.finalDraft
          : null;

  return {
    metadata,
    telemetry,
    provider: typeof firstStage.provider === 'string' ? firstStage.provider : null,
    output,
    sourceRef: typeof metadata.sourceRef === 'string' ? metadata.sourceRef : null,
  };
};

const resolveWorkflow = (log: Pick<AnalysisLog, 'role'>): string => {
  if (log.role === 'refine') return 'refine';
  if (log.role === 'editor') return 'manual_draft';
  return 'analyze';
};

const buildAnalysisEvaluationData = (
  log: AnalysisLog,
  provenance: 'captured' | 'backfilled_partial',
): Prisma.EditorialEvaluationRunCreateManyInput => {
  const fields = readEvaluationFields(log);
  return {
    analysisLogId: log.id,
    requestId: log.requestId,
    environment: resolveEvaluationEnvironment(),
    provenance,
    workflow: resolveWorkflow(log),
    stage: log.role,
    sourceRef: fields.sourceRef,
    organizationId: log.organizationId,
    userId: log.userId,
    input: log.content,
    inputHash: sha256(log.content),
    promptVersion: log.promptVersion,
    promptConfigurationHash: log.promptConfigurationHash,
    renderedPrompt: null,
    provider: fields.provider,
    modelName: log.modelName,
    output: fields.output,
    automatedReview: {
      score: log.score,
      verdict: log.verdict,
      summary: log.summary,
      feedback: log.feedback,
      flags: log.flags,
    } as Prisma.InputJsonValue,
    score: log.score,
    verdict: log.verdict,
    summary: log.summary,
    telemetry: Object.keys(fields.telemetry).length > 0
      ? fields.telemetry as Prisma.InputJsonValue
      : undefined,
    createdAt: log.createdAt,
  };
};

export async function createEvaluationRunForAnalysisLog(
  tx: Prisma.TransactionClient,
  log: AnalysisLog,
  provenance: 'captured' | 'backfilled_partial' = 'captured',
  context: AnalysisTransitionContext = {},
): Promise<{ id: string } | null> {
  if (!isEditorialEvaluationCaptureEnabled()) return null;
  if (!await hasTenantEditorialEvaluationConsent(tx, log.organizationId)) return null;

  const run = await tx.editorialEvaluationRun.upsert({
    where: { analysisLogId: log.id },
    create: buildAnalysisEvaluationData(log, provenance),
    update: {},
    select: { id: true },
  });
  const fields = readEvaluationFields(log);

  if (fields.output && fields.output !== log.content) {
    await upsertTransition(tx, {
      transitionKey: `raw_to_polished:${run.id}`,
      transitionType: 'raw_to_polished',
      organization: log.organizationId ? { connect: { id: log.organizationId } } : undefined,
      sourceRef: fields.sourceRef,
      outputRun: { connect: { id: run.id } },
      provenance,
      inputSnapshot: asJson({ rawDraft: log.content }),
      outputSnapshot: asJson({ polishedDraft: fields.output }),
      deterministicSignals: asJson(classifyEditorialChanges(log.content, fields.output)),
      createdAt: log.createdAt,
    });
  }

  const inputFeedback = Array.isArray(context.inputFeedback) ? context.inputFeedback : [];
  if (fields.output && inputFeedback.length > 0) {
    await upsertTransition(tx, {
      transitionKey: `feedback_to_polished:${run.id}`,
      transitionType: 'feedback_to_polished',
      organization: log.organizationId ? { connect: { id: log.organizationId } } : undefined,
      sourceRef: fields.sourceRef,
      outputRun: { connect: { id: run.id } },
      provenance,
      inputSnapshot: asJson({ rawDraft: log.content, feedbackItems: inputFeedback }),
      outputSnapshot: asJson({ polishedDraft: fields.output, feedbackItems: context.outputFeedback ?? [] }),
      deterministicSignals: asJson(classifyEditorialChanges(log.content, fields.output)),
      createdAt: log.createdAt,
    });
  }

  if (fields.sourceRef) {
    const blueprintTransition = await tx.editorialEvaluationTransition.findFirst({
      where: {
        transitionType: 'chat_to_blueprint',
        sourceRef: fields.sourceRef,
        organizationId: log.organizationId,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, outputRunId: true, outputSnapshot: true },
    });
    if (blueprintTransition) {
      await upsertTransition(tx, {
        transitionKey: `blueprint_to_raw_draft:${run.id}`,
        transitionType: 'blueprint_to_raw_draft',
        organization: log.organizationId ? { connect: { id: log.organizationId } } : undefined,
        sourceRef: fields.sourceRef,
        inputRun: blueprintTransition.outputRunId
          ? { connect: { id: blueprintTransition.outputRunId } }
          : undefined,
        outputRun: { connect: { id: run.id } },
        provenance,
        inputSnapshot: blueprintTransition.outputSnapshot as Prisma.InputJsonValue,
        outputSnapshot: asJson({ rawDraft: log.content }),
        createdAt: log.createdAt,
      });
    }
  }

  return run;
}

type ChatEvaluationInput = {
  chatMessageId: string;
  requestId?: string;
  organizationId: string | null;
  userId: string | null;
  sourceRef?: string | null;
  input: string;
  output: string;
  promptVersion: string;
  promptConfigurationHash?: string | null;
  renderedPrompt?: string | null;
  provider?: string | null;
  modelName: string;
  modelParameters?: Prisma.InputJsonValue;
  provenance?: 'captured' | 'backfilled_partial';
  createdAt?: Date;
  transition?: {
    type: 'chat_to_blueprint';
    inputSnapshot: unknown;
    outputSnapshot: unknown;
    contextSnapshot?: unknown;
  };
};

const buildChatEvaluationData = (
  input: ChatEvaluationInput,
): Prisma.EditorialEvaluationRunCreateManyInput => ({
  chatMessageId: input.chatMessageId,
  requestId: input.requestId,
  environment: resolveEvaluationEnvironment(),
  provenance: input.provenance ?? 'captured',
  workflow: 'chat',
  stage: 'strategist_chat',
  sourceRef: input.sourceRef,
  organizationId: input.organizationId,
  userId: input.userId,
  input: input.input,
  inputHash: sha256(input.input),
  promptVersion: input.promptVersion,
  promptConfigurationHash: input.promptConfigurationHash,
  renderedPrompt: input.renderedPrompt,
  provider: input.provider,
  modelName: input.modelName,
  modelParameters: input.modelParameters,
  output: input.output,
  createdAt: input.createdAt,
});

export async function createEvaluationRunForChatMessage(
  tx: Prisma.TransactionClient,
  input: ChatEvaluationInput,
): Promise<{ id: string } | null> {
  if (!isEditorialEvaluationCaptureEnabled()) return null;
  if (!await hasTenantEditorialEvaluationConsent(tx, input.organizationId)) return null;
  const run = await tx.editorialEvaluationRun.upsert({
    where: { chatMessageId: input.chatMessageId },
    create: buildChatEvaluationData(input),
    update: {},
    select: { id: true },
  });
  if (input.transition) {
    await upsertTransition(tx, {
      transitionKey: `${input.transition.type}:${run.id}`,
      transitionType: input.transition.type,
      organization: input.organizationId ? { connect: { id: input.organizationId } } : undefined,
      sourceRef: input.sourceRef,
      outputRun: { connect: { id: run.id } },
      provenance: input.provenance ?? 'captured',
      inputSnapshot: asJson(input.transition.inputSnapshot),
      outputSnapshot: asJson(input.transition.outputSnapshot),
      contextSnapshot: input.transition.contextSnapshot === undefined
        ? undefined
        : asJson(input.transition.contextSnapshot),
      createdAt: input.createdAt,
    });
    const transitionOutput = recordOf(input.transition.outputSnapshot);
    const blueprint = recordOf(transitionOutput.blueprint);
    if (input.transition.type === 'chat_to_blueprint' && typeof blueprint.draft === 'string') {
      await upsertTransition(tx, {
        transitionKey: `blueprint_to_raw_draft:${run.id}`,
        transitionType: 'blueprint_to_raw_draft',
        organization: input.organizationId ? { connect: { id: input.organizationId } } : undefined,
        sourceRef: input.sourceRef,
        inputRun: { connect: { id: run.id } },
        outputRun: { connect: { id: run.id } },
        provenance: input.provenance ?? 'captured',
        inputSnapshot: asJson({ blueprint: { ...blueprint, draft: undefined } }),
        outputSnapshot: asJson({ rawDraft: blueprint.draft }),
        createdAt: input.createdAt,
      });
    }
  }
  return run;
}

export async function createManualFinalTransition(
  tx: Prisma.TransactionClient,
  input: {
    revisionEventId: string;
    evaluationRunId: string;
    organizationId: string | null;
    sourceRef?: string | null;
    beforeText: string;
    afterText: string;
    changeSet?: unknown;
    publicationMetadataBefore?: unknown;
    publicationMetadataAfter?: unknown;
  },
): Promise<void> {
  if (!isEditorialEvaluationCaptureEnabled()) return;
  if (!await hasTenantEditorialEvaluationConsent(tx, input.organizationId)) return;
  await upsertTransition(tx, {
    transitionKey: `polished_to_manual_final:${input.revisionEventId}`,
    transitionType: 'polished_to_manual_final',
    organization: input.organizationId ? { connect: { id: input.organizationId } } : undefined,
    sourceRef: input.sourceRef,
    inputRun: { connect: { id: input.evaluationRunId } },
    outputRun: { connect: { id: input.evaluationRunId } },
    provenance: 'captured',
    inputSnapshot: asJson({
      polishedDraft: input.beforeText,
      publicationMetadata: input.publicationMetadataBefore ?? null,
    }),
    outputSnapshot: asJson({
      userEditedFinalDraft: input.afterText,
      publicationMetadata: input.publicationMetadataAfter ?? null,
    }),
    contextSnapshot: asJson({ changeSet: input.changeSet ?? null }),
    deterministicSignals: asJson(classifyEditorialChanges(input.beforeText, input.afterText)),
  });
}

export async function backfillEditorialEvaluationRuns(): Promise<number> {
  if (!isEditorialEvaluationCaptureEnabled()) {
    throw new Error('Editorial evaluation capture is disabled for this environment');
  }

  const missingLogs = await prisma.analysisLog.findMany({
    where: {
      editorialEvaluationRun: null,
      organization: { editorialEvaluationConsent: true },
    },
    orderBy: { createdAt: 'asc' },
  });

  for (let offset = 0; offset < missingLogs.length; offset += 100) {
    const batch = missingLogs.slice(offset, offset + 100);
    await prisma.editorialEvaluationRun.createMany({
      data: batch.map(log => buildAnalysisEvaluationData(log, 'backfilled_partial')),
      skipDuplicates: true,
    });
  }

  const missingChatOutputs = await prisma.chatMessage.findMany({
    where: {
      role: 'assistant',
      editorialEvaluationRun: null,
      session: { organization: { editorialEvaluationConsent: true } },
    },
    include: {
      session: {
        select: {
          userId: true,
          organizationId: true,
          messages: {
            where: { role: 'user' },
            orderBy: { createdAt: 'asc' },
            select: { content: true, createdAt: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  for (let offset = 0; offset < missingChatOutputs.length; offset += 100) {
    const batch = missingChatOutputs.slice(offset, offset + 100);
    await prisma.editorialEvaluationRun.createMany({
      data: batch.map(message => {
        const precedingInput = message.session.messages
          .filter(candidate => candidate.createdAt <= message.createdAt)
          .at(-1);
        return buildChatEvaluationData({
          chatMessageId: message.id,
          organizationId: message.session.organizationId,
          userId: message.session.userId,
          input: precedingInput?.content ?? '',
          output: message.content,
          promptVersion: 'unknown',
          modelName: 'unknown',
          provenance: 'backfilled_partial',
          createdAt: message.createdAt,
        });
      }),
      skipDuplicates: true,
    });
  }

  return missingLogs.length + missingChatOutputs.length;
}

export async function backfillEditorialEvaluationTransitions(): Promise<number> {
  if (!isEditorialEvaluationCaptureEnabled()) {
    throw new Error('Editorial evaluation capture is disabled for this environment');
  }
  const before = await prisma.editorialEvaluationTransition.count({
    where: { organization: { editorialEvaluationConsent: true } },
  });

  const blueprintMessages = await prisma.chatMessage.findMany({
    where: {
      role: 'assistant',
      editorialEvaluationRun: {
        is: { organization: { editorialEvaluationConsent: true } },
      },
    },
    include: {
      editorialEvaluationRun: { select: { id: true, sourceRef: true, organizationId: true } },
      session: {
        select: {
          messages: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, role: true, content: true, createdAt: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const message of blueprintMessages) {
    const payload = recordOf(message.payload);
    const blueprint = payload.plan;
    const run = message.editorialEvaluationRun;
    const sourceRef = run?.sourceRef
      ?? (typeof payload.sourceRef === 'string' ? payload.sourceRef : null);
    if (!blueprint || !run || !sourceRef) continue;
    const strategistMessages = message.session.messages
      .filter(candidate => candidate.id !== message.id && candidate.createdAt <= message.createdAt)
      .slice(-12)
      .map(candidate => ({ role: candidate.role, content: candidate.content }));
    await prisma.$transaction(async tx => {
      if (!run.sourceRef) {
        await tx.editorialEvaluationRun.update({
          where: { id: run.id },
          data: { sourceRef },
        });
      }
      await upsertTransition(tx, {
        transitionKey: `chat_to_blueprint:${run.id}`,
        transitionType: 'chat_to_blueprint',
        organization: run.organizationId ? { connect: { id: run.organizationId } } : undefined,
        sourceRef,
        outputRun: { connect: { id: run.id } },
        provenance: 'backfilled_partial',
        inputSnapshot: asJson({ strategistMessages }),
        outputSnapshot: asJson({
          blueprint,
          suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
          sources: Array.isArray(payload.sources) ? payload.sources : [],
        }),
        createdAt: message.createdAt,
      });
      await tx.editorialEvaluationTransition.update({
        where: { transitionKey: `chat_to_blueprint:${run.id}` },
        data: { inputSnapshot: asJson({ strategistMessages }) },
      });
      const blueprintRecord = recordOf(blueprint);
      if (typeof blueprintRecord.draft === 'string') {
        await upsertTransition(tx, {
          transitionKey: `blueprint_to_raw_draft:${run.id}`,
          transitionType: 'blueprint_to_raw_draft',
          organization: run.organizationId ? { connect: { id: run.organizationId } } : undefined,
          sourceRef,
          inputRun: { connect: { id: run.id } },
          outputRun: { connect: { id: run.id } },
          provenance: 'backfilled_partial',
          inputSnapshot: asJson({ blueprint: { ...blueprintRecord, draft: undefined } }),
          outputSnapshot: asJson({ rawDraft: blueprintRecord.draft }),
          createdAt: message.createdAt,
        });
      }
    });
  }

  const logs = await prisma.analysisLog.findMany({
    where: {
      editorialEvaluationRun: {
        is: { organization: { editorialEvaluationConsent: true } },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  for (const log of logs) {
    await prisma.$transaction(async tx => {
      await createEvaluationRunForAnalysisLog(tx, log, 'backfilled_partial');
    });
  }

  return (await prisma.editorialEvaluationTransition.count({
    where: { organization: { editorialEvaluationConsent: true } },
  })) - before;
}
