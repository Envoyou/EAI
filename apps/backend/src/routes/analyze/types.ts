/**
 * Shared types and constants for the analyze route.
 * Extracted from analyze.ts during the Sprint 1 refactor (zero logic change).
 */

import type { FeedbackOutput, PolishDiagnosisOutput, ArticleMetadata, ResponseMode, Role, FeedbackItem } from '@eai/shared';
import type { EditorialAuditContext, EditorialProfileSnapshot } from '@eai/shared/server';
import type { AiTelemetryCollector } from '@/lib/ai-telemetry';
import type { getWorkspaceState } from '@/lib/user-workspace';

// ── SSE ─────────────────────────────────────────────────────────────────────

export type SendEvent = (type: string, data: unknown) => void;

// ── Feedback ─────────────────────────────────────────────────────────────────

export type StructuredFeedbackItem = FeedbackOutput['feedback'][number];
export type ReviewOutput = FeedbackOutput | PolishDiagnosisOutput;

// ── Domain ───────────────────────────────────────────────────────────────────

export type SourceProvenanceLevel = 'none' | 'weak' | 'moderate' | 'strong';
export type DraftRiskProfile = 'general' | 'low_stakes_consumer';

// ── Constants ────────────────────────────────────────────────────────────────

export const MAX_SUMMARY_LENGTH = 280;

// ── OpenAI-compatible provider types ─────────────────────────────────────────

export type OpenAiCompatibleChunk = {
  choices: Array<{
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number } | null;
    completion_tokens_details?: { reasoning_tokens?: number } | null;
  } | null;
  x_groq?: {
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number } | null;
      completion_tokens_details?: { reasoning_tokens?: number } | null;
    } | null;
  };
};

export type OpenAiCompatibleClient = {
  chat: {
    completions: {
      create: (params: Record<string, unknown>) => Promise<AsyncIterable<OpenAiCompatibleChunk>>;
    };
  };
};

// ── Handler shared state ─────────────────────────────────────────────────────

/**
 * Mutable state shared across all handlers — set/updated by each handler
 * and read by the controller for logging and error recovery.
 */
export type AnalyzeState = {
  isDisconnected: boolean;
  signal: AbortSignal;
  usedModels: string[];
  executedModelName: string;
  textToLog: string;
  roleToLog: Role | 'unknown' | 'refine';
  metadataToLog: ArticleMetadata | undefined;
  responseMode: ResponseMode;
};

// ── Resolved dependencies ─────────────────────────────────────────────────────

export type WorkspaceState = NonNullable<Awaited<ReturnType<typeof getWorkspaceState>>>;
export type ResolvedEditorialProfile = EditorialProfileSnapshot;

export type EditorialLogFields = {
  editorialProfileVersionId: string | null;
  editorialProfileKey: string | null;
  editorialProfileVersionNo: number | null;
  coreGuardrailsVersion: string | null;
  promptConfigurationHash: string | null;
};

// ── Handler contexts ──────────────────────────────────────────────────────────

/**
 * Common context passed to every handler. Controller resolves these fields
 * during pre-flight and passes them down — handlers must not re-fetch them.
 */
export type BaseHandlerContext = {
  sendEvent: SendEvent;
  state: AnalyzeState;
  analysisSpeed: 'fast' | 'balanced' | 'deep';
  effectiveProvider: 'gemini' | 'groq' | 'openrouter';
  text: string;
  metadata: ArticleMetadata | undefined;
  userId: string | null;
  workspace: WorkspaceState;
  editorialProfile: ResolvedEditorialProfile;
  editorialAudit: EditorialAuditContext;
  editorialLogFields: EditorialLogFields;
  telemetry: AiTelemetryCollector;
  modelOverride: string | null;
};

export type FixTargetedContext = BaseHandlerContext & {
  targetText: string;
  feedbackMessage?: string;
  instruction?: string;
};

export type RefineContext = BaseHandlerContext & {
  userInstruction: string;
  previousFeedback: FeedbackItem[];
};

export type AnalyzeContext = BaseHandlerContext & {
  role: Role;
  isPolishMode: boolean;
  /** Pre-composed ReviewPromptComposer output for the non-polish, non-gemini path. */
  systemPrompt: string;
};

export type DevMockContext = BaseHandlerContext & {
  mode: AnalyzeMode;
  role?: Role;
  isPolishMode: boolean;
};
