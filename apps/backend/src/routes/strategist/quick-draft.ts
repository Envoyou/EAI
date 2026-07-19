import { Router } from 'express';
import { ThinkingLevel } from '@google/genai';
import { PROMPT_VERSION } from '@/lib/prompts';
import { StrategistPromptComposer } from '@/lib/ai/prompt-engine/composer/strategist-composer';
import { prisma } from '@/lib/db';
import { verifyToken } from '@clerk/backend';
import {
  extractGeminiText,
  extractOpenRouterText,
  gemini,
  getNativeGeminiConfig,
  getOpenRouterModelForRole,
  GROQ_MODEL,
  groq,
  openrouter,
} from '@/lib/ai/provider-runtime';
import { buildEditorialAuditContext, ENVOYOU_EDITORIAL_PROFILE } from '@eai/shared/server';
import { resolveEditorialProfileForUser } from '@/lib/editorial-profile-server';
import { getWorkspaceState } from '@/lib/user-workspace';
import { getAllFeatureFlags } from '@eai/shared/server';
import { checkCreditsRemaining, deductCredits } from '@/lib/chat-billing';
import { redisRateLimiter } from '@/middleware/rate-limit';
import { QuickDraftSchema } from './types';
import { withGeminiFlexRetry } from '@/lib/ai/gemini-request-policy';
import { bindResponseAbort } from '@/lib/request-abort';

const router = Router();

const parseCookies = (cookieHeader: string | undefined): Record<string, string> => {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.split('=').map((c) => c.trim());
    if (key && value) {
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {} as Record<string, string>);
};

// POST /api/strategist/quick-draft
router.post(
  '/',
  redisRateLimiter({
    namespace: 'strategist:quick-draft',
    windowMs: 60_000,
    max: 6,
    message: 'Too many draft requests. Please try again later.',
  }),
  async (req, res) => {
  const featureFlags = await getAllFeatureFlags();
  if (featureFlags.maintenance_mode || !featureFlags.ai_processing_enabled) {
    return res.status(503).json({
      error: featureFlags.maintenance_mode
        ? 'Editorial processing is temporarily paused for maintenance.'
        : 'AI processing is temporarily disabled.',
    });
  }

  const parsedInput = QuickDraftSchema.safeParse(req.body);
  if (!parsedInput.success) {
    return res.status(400).json({
      error: 'Invalid quick draft request',
      issues: parsedInput.error.issues,
    });
  }

  let authPayload: Record<string, unknown> | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      authPayload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      }) as Record<string, unknown>;
    } catch (err) {
      console.warn('Failed to verify Clerk token in /api/strategist/quick-draft:', err);
    }
  }

  const userId = authPayload?.sub as string | undefined;
  const orgId = (authPayload?.org_id as string | undefined) || null;
  const orgSlug = (authPayload?.org_slug as string | undefined) || null;
  const orgRole = (authPayload?.org_role as string | undefined) || null;

  let workspace: Record<string, unknown>;
  let editorialProfile = ENVOYOU_EDITORIAL_PROFILE;

  if (!userId) {
    if (!featureFlags.demo_enabled) {
      return res.status(403).json({ error: 'Demo access is currently unavailable. Please log in.' });
    }

    const cookiesObj = parseCookies(req.headers.cookie);
    const demoCountStr = cookiesObj['eai_demo_count'];
    const demoCount = demoCountStr ? parseInt(demoCountStr, 10) : 0;

    if (demoCount >= 2) {
      return res.status(403).json({ error: 'Create a free account to continue. Get 10 free Editorial Credits.' });
    }

    const nextCount = demoCount + 1;
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
        creditsRemaining: 2 - nextCount,
        activePlan: 'guest',
        subscriptionStatus: 'none',
      },
    };
  } else {
    const fetchedWorkspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    if (!fetchedWorkspace || fetchedWorkspace.needsOnboarding) {
      return res.status(409).json({ error: 'Workspace onboarding must be completed before drafting.' });
    }
    workspace = fetchedWorkspace;

    const remainingCredits = await checkCreditsRemaining(
      userId,
      fetchedWorkspace.organizationId
    );
    if (remainingCredits < 1) {
      return res.status(402).json({ error: 'Insufficient credits' });
    }

    try {
      editorialProfile = await resolveEditorialProfileForUser(userId, workspace.organizationId as string | null);
    } catch (profileError) {
      console.warn('[Editorial Profile] Falling back to Envoyou default:', profileError);
    }
  }

  const workspaceOrganizationId = workspace.organizationId as string | null;
  const editorialAudit = buildEditorialAuditContext(editorialProfile, PROMPT_VERSION);
  const editorialLogFields = {
    editorialProfileVersionId: editorialAudit.editorialProfileVersionId,
    editorialProfileKey: editorialAudit.editorialProfileKey,
    editorialProfileVersionNo: editorialAudit.editorialProfileVersion,
    coreGuardrailsVersion: editorialAudit.coreGuardrailsVersion,
    promptConfigurationHash: editorialAudit.promptConfigurationHash,
  };

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const requestAbort = bindResponseAbort(res, 'Quick draft');

  const sendEvent = (type: string, data: unknown) => {
    res.write(JSON.stringify({ type, data }) + '\n');
  };

  const heartbeatInterval = setInterval(() => {
    if (!res.writableEnded) {
      sendEvent('heartbeat', { timestamp: Date.now() });
    }
  }, 5000);

  try {
    const {
      topic,
      outline,
      referenceText,
      metadata,
      draftMode = 'topic',
      mode = 'draft',
    } = parsedInput.data;

    const configuredProvider = process.env.ACTIVE_AI_PROVIDER;
    const provider: 'gemini' | 'groq' | 'openrouter' =
      configuredProvider === 'groq' || configuredProvider === 'openrouter'
        ? configuredProvider
        : 'gemini';

    if (!topic || !topic.trim()) {
      sendEvent('error', 'Topic is required');
      res.end();
      return;
    }

    const systemPrompt = mode === 'outline'
      ? new StrategistPromptComposer('outline', metadata, editorialProfile.config).compose('xml')
      : new StrategistPromptComposer('draft', metadata, editorialProfile.config, { draftMode }).compose('xml');

    const isGeminiMock = provider === 'gemini' && (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'empty');
    const isGroqMock = provider === 'groq' && (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'empty');
    const isOpenRouterMock = provider === 'openrouter' && (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'empty');

    if (isGeminiMock || isGroqMock || isOpenRouterMock) {
      sendEvent('status', 'generating');

      let mockContent = '';
      if (mode === 'outline') {
        mockContent = `## Introduction to ${topic}\n`;
        mockContent += `- Overview and significance of the topic.\n`;
        mockContent += `- Defining key concepts and core questions.\n\n`;
        mockContent += `## Key Pillars and Analysis\n`;
        mockContent += `- Critical analysis of key themes.\n`;
        mockContent += `- Industry benchmarks, practical data points, and context.\n`;
        mockContent += `- Challenges and common pitfalls.\n\n`;
        mockContent += `## Strategic Implications and Conclusion\n`;
        mockContent += `- Future outlook and strategic recommendations.\n`;
        mockContent += `- Actionable takeaways for decision makers.\n`;
      } else {
        let mockDraft = `## introduction to ${topic}\n\n`;
        mockDraft += `This is a mock draft generated for the topic: **${topic}**. In development mode, EAI streams this placeholder text to simulate the drafting process. EAI Drafting Assistant generates a structured draft based on user inputs.\n\n`;

        if (outline) {
          mockDraft += `## key outlines\n\n`;
          const lines = outline.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              mockDraft += `- Explored aspect: **${line.trim()}**\n`;
            }
          }
          mockDraft += `\n`;
        }

        if (referenceText) {
          mockDraft += `## data reference details\n\n`;
          mockDraft += `Based on reference notes: ${referenceText.slice(0, 150)}...\n\n`;
        }

        mockDraft += `## conclusion\n\n`;
        mockDraft += `This represents the end of the mock draft. You can now edit this text in the editor, customize it, and then click **Refine Draft** to start the staged AI editorial polishing, keyword checking, and final quality gate audit.\n`;

        mockContent = mockDraft;
      }

      const chunks = mockContent.split(' ');
      for (const chunk of chunks) {
        if (requestAbort.isDisconnected()) return;
        sendEvent('draft_chunk', chunk + ' ');
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      let savedLogId: string | undefined;
      if (userId) {
        try {
          const savedLog = await prisma.analysisLog.create({
            data: {
              userId,
              organizationId: workspaceOrganizationId,
              role: mode === 'outline' ? 'outline_generation' : 'draft_generation',
              content: mockContent,
              metadata: JSON.parse(JSON.stringify({
                topic,
                outline,
                referenceText,
                draftMode,
                metadataInput: metadata,
                provider,
                mode,
              })),
              promptVersion: PROMPT_VERSION,
              modelName: 'dev-mock-model',
              status: 'success',
              ...editorialLogFields,
            }
          });
          savedLogId = savedLog.id;
          await deductCredits(
            userId,
            workspaceOrganizationId,
            1,
            'article_refine',
            `${mode === 'outline' ? 'Outline' : 'Draft'} generation`,
            savedLog.id
          );
        } catch (dbError) {
          console.error('Failed to log mock draft/outline to database:', dbError);
        }
      }

      sendEvent('complete', { analysisLogId: savedLogId });
      res.end();
      return;
    }

    sendEvent('status', 'generating');
    const userPrompt = mode === 'outline'
      ? `Generate a structured outline for this topic:\nTOPIC: ${topic}`
      : `Generate a structured rough draft based on this topic:\nTOPIC: ${topic}\n\n${outline ? `OUTLINE / KEY POINTS:\n${outline}` : ''}\n${referenceText ? `REFERENCE MATERIAL / SOURCE NOTES:\n${referenceText}` : ''}\n`;

    let draftText = '';
    let modelName = 'unknown-model';

    if (provider === 'gemini') {
      modelName = 'gemini-3.5-flash';
      const draftStream = await withGeminiFlexRetry(() =>
        gemini.models.generateContentStream({
          model: modelName,
          contents: userPrompt,
          config: {
            abortSignal: requestAbort.signal,
            systemInstruction: systemPrompt,
            ...getNativeGeminiConfig(),
            candidateCount: 1,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          }
        }),
        { signal: requestAbort.signal }
      );

      for await (const chunk of draftStream) {
        if (requestAbort.isDisconnected()) break;
        const partText = extractGeminiText(chunk);
        draftText += partText;
        sendEvent('draft_chunk', partText);
      }
    } else if (provider === 'openrouter') {
      modelName = getOpenRouterModelForRole('author', 'balanced');
      const openRouterStream = await openrouter.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: true,
        temperature: 0.45,
      }, { signal: requestAbort.signal });

      for await (const chunk of openRouterStream) {
        if (requestAbort.isDisconnected()) break;
        const partText = extractOpenRouterText(chunk);
        draftText += partText;
        sendEvent('draft_chunk', partText);
      }
    } else {
      modelName = GROQ_MODEL;
      const groqStream = await groq.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: true,
        temperature: 0.45,
      }, { signal: requestAbort.signal });

      for await (const chunk of groqStream) {
        if (requestAbort.isDisconnected()) break;
        const partText = chunk.choices[0]?.delta?.content || '';
        draftText += partText;
        sendEvent('draft_chunk', partText);
      }
    }

    if (requestAbort.isDisconnected()) return;

    let savedLogId: string | undefined;
    if (userId) {
      try {
        const savedLog = await prisma.analysisLog.create({
          data: {
            userId,
            organizationId: workspaceOrganizationId,
            role: mode === 'outline' ? 'outline_generation' : 'draft_generation',
            content: draftText,
            metadata: JSON.parse(JSON.stringify({
              topic,
              outline,
              referenceText,
              draftMode,
              metadataInput: metadata,
              provider,
              mode,
            })),
            promptVersion: PROMPT_VERSION,
            modelName,
            status: 'success',
            ...editorialLogFields,
          }
        });
        savedLogId = savedLog.id;
        await deductCredits(
          userId,
          workspaceOrganizationId,
          1,
          'article_refine',
          `${mode === 'outline' ? 'Outline' : 'Draft'} generation`,
          savedLog.id
        );
      } catch (dbError) {
        console.error('Failed to log live draft/outline to database:', dbError);
      }
    }

    sendEvent('complete', { analysisLogId: savedLogId });
    res.end();
  } catch (error) {
    if (requestAbort.signal.aborted) return;
    console.error('Quick draft generation error:', error);
    sendEvent('error', error instanceof Error ? error.message : String(error));
    res.end();
  } finally {
    requestAbort.dispose();
    clearInterval(heartbeatInterval);
  }
  }
);

export default router;
