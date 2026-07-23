/**
 * Analyze route controller — orchestrates the request lifecycle.
 * Responsibilities: pre-flight, auth, workspace, SSE init, mode dispatch.
 * All AI calls and DB writes live in the handlers and domain service.
 * Extracted from analyze.ts L934–1075 + dispatch logic (zero logic change).
 */

import { Router, Request } from 'express';
import { PROMPT_VERSION } from '@/lib/prompts';
import { FeedbackItemSchema } from '@eai/shared';
import type { AnalyzeMode } from '@eai/shared';
import { AiTelemetryCollector } from '@/lib/ai-telemetry';
import { buildEditorialAuditContext, ENVOYOU_EDITORIAL_PROFILE, getAllFeatureFlags } from '@eai/shared/server';
import { resolveEditorialProfileForUser } from '@/lib/editorial-profile-server';
import { getWorkspaceState } from '@/lib/user-workspace';
import { resolveActiveAiConfig } from '@/lib/ai-provider-resolver';
import { ReviewPromptComposer } from '@/lib/ai/prompt-engine/composer/review-composer';
import { verifyToken } from '@clerk/backend';
import { z } from 'zod';

import type { AnalyzeState } from './types';
import { parseCookies } from './utils/text';
import { isMockMode, handleDevMock } from './handlers/dev-mock';
import { handleFixTargeted } from './handlers/fix-targeted';
import { handleRefine } from './handlers/refine';
import { handleAnalyze } from './handlers/analyze';

const router = Router();

const AnalyzeRequestSchema = z
  .object({
    text: z.string().max(100_000).optional(),
    role: z.enum(['polish', 'author', 'editor', 'seo', 'fact-checker']).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    mode: z.enum(['analyze', 'refine', 'fix_targeted']).optional(),
    userInstruction: z.string().max(5_000).optional(),
    previousFeedback: z.array(FeedbackItemSchema).max(20).optional(),
    analysisSpeed: z.enum(['fast', 'balanced', 'deep']).optional(),
    targetText: z.string().max(25_000).optional(),
    feedbackMessage: z.string().max(5_000).optional(),
    instruction: z.string().max(5_000).optional(),
  })
  .superRefine((value, ctx) => {
    const mode = value.mode ?? (value.targetText ? 'fix_targeted' : 'analyze');
    if (!value.text?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['text'], message: 'Text is required' });
    }
    if (mode === 'analyze' && !value.role) {
      ctx.addIssue({ code: 'custom', path: ['role'], message: 'Role is required' });
    }
    if (mode === 'refine' && !value.userInstruction?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['userInstruction'],
        message: 'Refinement instruction is required',
      });
    }
    if (mode === 'fix_targeted' && !value.targetText?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetText'],
        message: 'Target text is required',
      });
    }
  });

// POST /api/analyze
router.post('/', async (req: Request, res) => {
  // ── PRE-FLIGHT CHECKS (must happen before SSE headers are flushed) ──────────

  const featureFlags = await getAllFeatureFlags();
  if (featureFlags.maintenance_mode || !featureFlags.ai_processing_enabled) {
    res.status(503).json({
      error: featureFlags.maintenance_mode
        ? 'Editorial processing is temporarily paused for maintenance.'
        : 'AI processing is temporarily disabled.',
    });
    return;
  }

  const parsedRequest = AnalyzeRequestSchema.safeParse(req.body);
  if (!parsedRequest.success) {
    res.status(400).json({
      error: 'Invalid analyze request',
      issues: parsedRequest.error.issues,
    });
    return;
  }

  // Auth (optional — guests are allowed for demo)
  let userId: string | null = null;
  let orgId: string | null = null;
  let orgSlug: string | null = null;
  let orgRole: string | null = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
      userId = payload.sub;
      orgId = (payload.org_id as string) || null;
      orgSlug = (payload.org_slug as string) || null;
      orgRole = (payload.org_role as string) || null;
    } catch (authError) {
      console.warn('[Analyze Auth] Token verification failed:', authError);
    }
  }

  let workspace: NonNullable<Awaited<ReturnType<typeof getWorkspaceState>>>;
  let editorialProfile = ENVOYOU_EDITORIAL_PROFILE;

  if (!userId) {
    if (!featureFlags.demo_enabled) {
      res.status(403).json({ error: 'Demo access is currently unavailable. Please log in.' });
      return;
    }

    // Guest / Demo Mode rate limiting — check AND set cookie BEFORE SSE opens
    const cookies = parseCookies(req.headers.cookie);
    const demoCountStr = cookies['eai_demo_count'];
    const demoCount = demoCountStr ? parseInt(demoCountStr, 10) : 0;

    if (demoCount >= 2) {
      res
        .status(429)
        .json({ error: 'Create a free account to continue. Get 10 free Editorial Credits.' });
      return;
    }

    const nextCount = demoCount + 1;
    // Set cookie BEFORE flushHeaders so the header can still be written
    res.cookie('eai_demo_count', nextCount.toString(), {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });

    workspace = {
      role: 'guest',
      organizationId: null,
      organization: {
        id: 'demo',
        clerkOrganizationId: null,
        slug: 'demo',
        name: 'Demo Workspace',
        publicationName: 'Demo Publication',
        domain: null,
        isActive: true,
        onboardingStatus: 'completed',
        profiles: [],
      },
      isAdmin: false,
      needsOnboarding: false,
      plan: {
        maxTextLength: 5000,
        creditsRemaining: 10,
        activePlan: 'free',
        subscriptionStatus: 'none',
      },
    } as unknown as NonNullable<Awaited<ReturnType<typeof getWorkspaceState>>>;
  } else {
    const fetchedWorkspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    if (!fetchedWorkspace || fetchedWorkspace.needsOnboarding) {
      res
        .status(403)
        .json({ error: 'Workspace onboarding must be completed before analysis.' });
      return;
    }
    workspace = fetchedWorkspace;

    if (
      workspace.plan &&
      typeof workspace.plan.creditsRemaining === 'number' &&
      workspace.plan.creditsRemaining <= 0
    ) {
      res.status(402).json({
        error:
          'You do not have enough credits. Purchase additional credits or upgrade your plan to continue.',
      });
      return;
    }

    try {
      editorialProfile = await resolveEditorialProfileForUser(userId, workspace.organizationId);
    } catch (profileError) {
      if (workspace.organization?.slug !== 'envoyou') {
        console.error('[Editorial Profile] Tenant profile resolution failed:', profileError);
        res.status(500).json({ error: 'Active editorial profile could not be resolved.' });
        return;
      }
      console.warn('[Editorial Profile] Falling back to Envoyou v1:', profileError);
    }
  }

  // ── All pre-flight checks passed — now open SSE stream ──────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (type: string, data: unknown) => {
    if (!state.isDisconnected && !res.writableEnded) {
      res.write(JSON.stringify({ type, data }) + '\n');
    }
  };

  // Shared mutable state — passed to handlers by reference so they can update
  // usedModels, executedModelName, etc. for logging and error recovery.
  const requestController = new AbortController();
  const state: AnalyzeState = {
    isDisconnected: false,
    signal: requestController.signal,
    usedModels: [],
    executedModelName: 'unknown-model',
    textToLog: '',
    roleToLog: 'unknown',
    metadataToLog: undefined,
    responseMode: 'standard',
  };

  res.on('close', () => {
    if (!res.writableEnded) {
      state.isDisconnected = true;
      requestController.abort(new Error('Analyze client disconnected'));
      console.log('[analyze] Client closed connection.');
    }
  });

  // Start keep-alive heartbeat interval to prevent stream idle timeout
  const keepAliveInterval = setInterval(() => {
    sendEvent('ping', Date.now());
  }, 5000);

  const clearKeepAlive = () => {
    clearInterval(keepAliveInterval);
  };

  res.on('finish', clearKeepAlive);
  res.on('close', clearKeepAlive);

  const editorialAudit = buildEditorialAuditContext(editorialProfile, PROMPT_VERSION);
  const editorialLogFields = {
    editorialProfileVersionId: editorialAudit.editorialProfileVersionId ?? null,
    editorialProfileKey: editorialAudit.editorialProfileKey ?? null,
    editorialProfileVersionNo: editorialAudit.editorialProfileVersion ?? null,
    coreGuardrailsVersion: editorialAudit.coreGuardrailsVersion ?? null,
    promptConfigurationHash: editorialAudit.promptConfigurationHash ?? null,
  };

  const telemetry = new AiTelemetryCollector();

  try {
    const {
      text,
      role,
      metadata,
      mode,
      userInstruction,
      previousFeedback,
      analysisSpeed: requestedAnalysisSpeed,
      targetText,
      feedbackMessage,
      instruction,
    } = parsedRequest.data;

    const analysisSpeed = userId ? (requestedAnalysisSpeed ?? 'deep') : 'fast';
    const looksLikeTargetedFix = Boolean(
      targetText?.trim() && (feedbackMessage?.trim() || instruction?.trim())
    );
    const effectiveMode: AnalyzeMode = mode ?? (looksLikeTargetedFix ? 'fix_targeted' : 'analyze');
    let modelOverride: string | null = null;
    let resolvedAiProvider: 'gemini' | 'groq' | 'openrouter' = 'gemini';

    if (userId) {
      const config = await resolveActiveAiConfig(userId, workspace?.organizationId);
      resolvedAiProvider = config.provider;
      modelOverride = config.modelOverride;
    } else {
      resolvedAiProvider = (process.env.ACTIVE_AI_PROVIDER || 'gemini') as
        | 'gemini'
        | 'groq'
        | 'openrouter';
    }

    const effectiveProvider: 'gemini' | 'groq' | 'openrouter' = resolvedAiProvider;

    // Populate shared logging state
    state.textToLog = text || '';
    state.roleToLog =
      effectiveMode === 'refine' ? 'refine' : (role || 'unknown');
    state.metadataToLog = metadata;

    // ── TARGETED FIX ──────────────────────────────────────────────────────────
    if (effectiveMode === 'fix_targeted') {
      await handleFixTargeted({
        sendEvent,
        state,
        text: text ?? '',
        metadata,
        targetText: targetText ?? '',
        feedbackMessage,
        instruction,
        analysisSpeed,
        effectiveProvider,
        userId,
        workspace,
        editorialProfile,
        editorialAudit,
        editorialLogFields,
        telemetry,
        modelOverride,
      });
      res.end();
      return;
    }

    if (!text) {
      sendEvent('error', 'Text is required');
      res.end();
      return;
    }
    if (effectiveMode === 'analyze' && !role) {
      sendEvent('error', 'Role is required for analyze mode');
      res.end();
      return;
    }

    const maxLength = workspace?.plan?.maxTextLength ?? 15000;
    if (text.length > maxLength) {
      sendEvent('error', `Draft is too long. Maximum ${maxLength} characters.`);
      res.end();
      return;
    }

    const isPolishMode = effectiveMode === 'analyze' && role === 'polish';
    const systemPrompt =
      effectiveMode === 'refine'
        ? ''
        : new ReviewPromptComposer(isPolishMode ? 'polish' : role!, editorialProfile.config, {
            includeTextSchema: effectiveProvider !== 'gemini',
          }).compose('xml');

    // ── DEV MOCK (missing API key) ─────────────────────────────────────────────
    if (isMockMode(effectiveProvider)) {
      await handleDevMock({
        sendEvent,
        state,
        mode: effectiveMode,
        text,
        metadata,
        role,
        isPolishMode,
        analysisSpeed,
        effectiveProvider,
        userId,
        workspace,
        editorialProfile,
        editorialAudit,
        editorialLogFields,
        telemetry,
        modelOverride,
      });
      res.end();
      return;
    }

    // ── REFINE MODE ───────────────────────────────────────────────────────────
    if (effectiveMode === 'refine') {
      await handleRefine({
        sendEvent,
        state,
        text,
        metadata,
        userInstruction: userInstruction ?? '',
        previousFeedback: previousFeedback ?? [],
        analysisSpeed,
        effectiveProvider,
        userId,
        workspace,
        editorialProfile,
        editorialAudit,
        editorialLogFields,
        telemetry,
        modelOverride,
      });
      res.end();
      return;
    }

    // ── ANALYZE / POLISH MODE ─────────────────────────────────────────────────
    await handleAnalyze({
      sendEvent,
      state,
      text,
      metadata,
      role: role!,
      isPolishMode,
      systemPrompt,
      analysisSpeed,
      effectiveProvider,
      userId,
      workspace,
      editorialProfile,
      editorialAudit,
      editorialLogFields,
      telemetry,
      modelOverride,
    });
  } catch (error: unknown) {
    if (state.isDisconnected || state.signal.aborted) return;
    console.error('[ANALYZE_POST_ERROR]', error);
    sendEvent(
      'error',
      error instanceof Error ? error.message : 'An unexpected error occurred during analysis.'
    );
  } finally {
    res.end();
  }
});

export default router;
