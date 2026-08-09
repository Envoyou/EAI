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
): Promise<void> {
  if (!isEditorialEvaluationCaptureEnabled()) return;

  await tx.editorialEvaluationRun.upsert({
    where: { analysisLogId: log.id },
    create: buildAnalysisEvaluationData(log, provenance),
    update: {},
  });
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
): Promise<void> {
  if (!isEditorialEvaluationCaptureEnabled()) return;
  await tx.editorialEvaluationRun.upsert({
    where: { chatMessageId: input.chatMessageId },
    create: buildChatEvaluationData(input),
    update: {},
  });
}

export async function backfillEditorialEvaluationRuns(): Promise<number> {
  if (!isEditorialEvaluationCaptureEnabled()) {
    throw new Error('Editorial evaluation capture is disabled for this environment');
  }

  const missingLogs = await prisma.analysisLog.findMany({
    where: { editorialEvaluationRun: null },
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
