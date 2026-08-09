/**
 * Domain service for creating an AnalysisLog and debiting a credit in a single
 * Prisma transaction. Isolated here so route handlers and future consumers
 * (analytics, admin, etc.) can reuse it without coupling to the analyze route.
 *
 * Extracted from analyze.ts L810–921 (zero logic change).
 */

import { prisma, type Prisma } from '@/lib/db';
import type { Role } from '@eai/shared';
import type { AiTelemetrySnapshot } from '@/lib/ai-telemetry';
import { InsufficientCreditsError } from '@/lib/chat-billing';
import { runSerializableTransaction } from '@/lib/serializable-transaction';
import {
  type AnalysisLog,
  ContentArtifactStage,
  ContentArtifactType,
  ContentSourceType,
} from '@prisma/client';
import {
  resolveLifecycleRootArtifactId,
  upsertContentArtifact,
} from '@/lib/content-memory';
import { createEvaluationRunForAnalysisLog } from '@/lib/editorial-evaluation';

export type CreateAnalysisLogInput = {
  userId: string;
  requestId?: string;
  organizationId: string | null;
  role: Role | 'unknown' | 'refine';
  content: string;
  metadata: unknown;
  promptVersion: string;
  modelName: string;
  score: number | undefined;
  verdict: string;
  summary: string;
  feedback: unknown;
  inputFeedback?: unknown;
  flags: unknown;
  status: Prisma.AnalysisLogUncheckedCreateInput['status'];
  editorStatus: string;
  editorialProfileVersionId: string | null;
  editorialProfileKey: string | null;
  editorialProfileVersionNo: number | null;
  coreGuardrailsVersion: string | null;
  promptConfigurationHash: string | null;
  telemetrySnapshot: AiTelemetrySnapshot;
};

/**
 * Creates an AnalysisLog, selects the appropriate credit bucket, debits one
 * credit, and records a CreditUsage entry — all within a single transaction.
 */
export async function createAnalysisLogAndDebitCredit(data: CreateAnalysisLogInput) {
  let savedLog: AnalysisLog;
  try {
    savedLog = await runSerializableTransaction(async (tx) => {
      const savedLog = await tx.analysisLog.create({
        data: {
          userId: data.userId,
          requestId: data.requestId,
          organizationId: data.organizationId,
          role: data.role,
          content: data.content,
          metadata: data.metadata as Prisma.InputJsonValue,
          promptVersion: data.promptVersion,
          modelName: data.modelName,
          score: data.score,
          verdict: data.verdict,
          summary: data.summary,
          feedback: data.feedback as Prisma.InputJsonValue,
          flags: data.flags as Prisma.InputJsonValue,
          status: data.status,
          editorStatus: data.editorStatus,
          editorialProfileVersionId: data.editorialProfileVersionId,
          editorialProfileKey: data.editorialProfileKey,
          editorialProfileVersionNo: data.editorialProfileVersionNo,
          coreGuardrailsVersion: data.coreGuardrailsVersion,
          promptConfigurationHash: data.promptConfigurationHash,
        },
      });

      const activeSub = await tx.subscription.findFirst({
        where: {
          userId: data.organizationId ? undefined : data.userId,
          organizationId: data.organizationId || undefined,
          status: { in: ['active', 'cancels_at_period_end'] },
          currentPeriodEnd: { gt: new Date() },
        },
      });

      const transactions = await tx.creditTransaction.groupBy({
        by: ['bucket'],
        where: {
          userId: data.organizationId ? undefined : data.userId,
          organizationId: data.organizationId || undefined,
        },
        _sum: {
          amount: true,
        },
      });

      const trialBalance = transactions.find((t) => t.bucket === 'trial')?._sum.amount ?? 0;
      const subBalance = transactions.find((t) => t.bucket === 'subscription')?._sum.amount ?? 0;
      const addonBalance = transactions.find((t) => t.bucket === 'addon')?._sum.amount ?? 0;

      let chosenBucket: 'trial' | 'subscription' | 'addon';
      if (trialBalance >= 1) {
        chosenBucket = 'trial';
      } else if (activeSub && subBalance >= 1) {
        chosenBucket = 'subscription';
      } else if (addonBalance >= 1) {
        chosenBucket = 'addon';
      } else {
        throw new InsufficientCreditsError();
      }

      await tx.creditTransaction.create({
        data: {
          userId: data.userId,
          organizationId: data.organizationId,
          type: 'article_refine',
          bucket: chosenBucket,
          amount: -1,
          analysisLogId: savedLog.id,
          idempotencyKey: data.requestId
            ? `analysis:${data.userId}:${data.requestId}`
            : `usage:${savedLog.id}`,
          description: `Refined draft for article (Log ID: ${savedLog.id})`,
        },
      });

      const inputTokens = data.telemetrySnapshot.inputTokens;
      const outputTokens = data.telemetrySnapshot.outputTokens;
      const costEstimate = (inputTokens * 0.00000015) + (outputTokens * 0.00000060);

      await tx.creditUsage.create({
        data: {
          userId: data.userId,
          organizationId: data.organizationId,
          analysisLogId: savedLog.id,
          creditsConsumed: 1,
          costEstimate: Number(costEstimate.toFixed(6)),
        },
      });

      await createEvaluationRunForAnalysisLog(tx, savedLog, 'captured', {
        inputFeedback: data.inputFeedback,
        outputFeedback: data.feedback,
      });

      return savedLog;
    });
  } catch (error) {
    if (data.requestId) {
      const existingLog = await prisma.analysisLog.findFirst({
        where: {
          userId: data.userId,
          requestId: data.requestId,
        },
      });
      if (existingLog) return existingLog;
    }
    throw error;
  }

  if (data.organizationId) {
    const metadata =
      data.metadata &&
      typeof data.metadata === 'object' &&
      !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {};
    const publicationPackage =
      metadata.publicationPackage &&
      typeof metadata.publicationPackage === 'object' &&
      !Array.isArray(metadata.publicationPackage)
        ? (metadata.publicationPackage as Record<string, unknown>)
        : {};
    const polishedDraft =
      typeof metadata.polishedDraft === 'string'
        ? metadata.polishedDraft
        : typeof metadata.finalDraft === 'string'
          ? metadata.finalDraft
          : data.content;
    const title =
      typeof metadata.workingTitle === 'string'
        ? metadata.workingTitle
        : typeof publicationPackage.title === 'string'
          ? publicationPackage.title
          : undefined;
    const lifecycleSourceId =
      typeof metadata.sourceRef === 'string' && metadata.sourceRef.trim()
        ? metadata.sourceRef
        : savedLog.id;
    const rootArtifactId = await resolveLifecycleRootArtifactId({
      organizationId: data.organizationId,
      sourceRef: lifecycleSourceId,
    });

    await upsertContentArtifact({
      organizationId: data.organizationId,
      createdByUserId: data.userId,
      artifactType: ContentArtifactType.DRAFT,
      sourceType: ContentSourceType.ANALYSIS,
      sourceId: lifecycleSourceId,
      rootArtifactId,
      currentStage:
        data.editorStatus === 'ready' || data.verdict === 'ready'
          ? ContentArtifactStage.READY
          : ContentArtifactStage.REFINED,
      title,
      topic:
        typeof metadata.topic === 'string' ? metadata.topic : title,
      angle:
        typeof metadata.angle === 'string' ? metadata.angle : undefined,
      audience:
        typeof metadata.targetAudience === 'string'
          ? metadata.targetAudience
          : undefined,
      primaryKeyword:
        typeof metadata.primaryKeyword === 'string'
          ? metadata.primaryKeyword
          : undefined,
      searchIntent:
        typeof metadata.searchIntent === 'string'
          ? metadata.searchIntent
          : undefined,
      summary: data.summary,
      content: polishedDraft,
      language:
        typeof metadata.outputLanguage === 'string'
          ? metadata.outputLanguage
          : undefined,
    }).catch((artifactError) => {
      console.error(
        '[CONTENT_MEMORY] Failed to index analyzed draft:',
        artifactError
      );
    });
  }

  return savedLog;
}
