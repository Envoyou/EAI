import { Router, Request, Response } from 'express';
import { getWorkspaceState } from '@/lib/user-workspace';
import { resolveEditorialProfileForUser } from '@/lib/editorial-profile-server';
import { ENVOYOU_EDITORIAL_PROFILE } from '@eai/shared/server';
import { DraftFromNotesComposer } from '@/lib/ai/prompt-engine/composer/draft-from-notes-composer';
import { gemini } from '@/lib/ai/provider-runtime';
import { MODEL } from '../utils/helpers';
import { resolveInternalOrgId, softAuth } from '../utils/helpers';
import { checkCreditsRemaining, deductCredits } from '@/lib/chat-billing';
import { prisma } from '@/lib/db';
import { PROMPT_VERSION } from '@/lib/prompts';
import { GenerateDraftFromNotesSchema } from '../types';
import { redisRateLimiter } from '@/middleware/rate-limit';
import {
  getGeminiInteractionConfig,
  getGeminiInteractionRequestOptions,
  withGeminiFlexRetry,
} from '@/lib/ai/gemini-request-policy';

const router = Router();

// POST /api/strategist/generate-draft-from-notes
router.post(
  '/generate-draft-from-notes',
  softAuth,
  redisRateLimiter({
    namespace: 'strategist:draft-from-notes',
    windowMs: 60_000,
    max: 5,
    message: 'Too many draft requests. Please try again later.',
  }),
  async (req: Request, res: Response) => {
  let heartbeatInterval: NodeJS.Timeout | undefined;
  try {
    let userId: string | null = null;
    let orgId: string | null = null;
    let orgSlug: string | null = null;
    let orgRole: string | null = null;

    if (req.auth) {
      userId = req.auth.userId;
      orgId = req.auth.orgId;
      orgSlug = req.auth.orgSlug;
      orgRole = req.auth.orgRole;
    }

    const parsedInput = GenerateDraftFromNotesSchema.safeParse(req.body);
    if (!parsedInput.success) {
      return res.status(400).json({
        error: 'Invalid draft request',
        issues: parsedInput.error.issues,
      });
    }
    const { notes, metadata } = parsedInput.data;

    if (!userId) {
      const cookies = Object.fromEntries(
        (req.headers.cookie ?? '')
          .split(';')
          .map((cookie) => cookie.trim().split('='))
          .filter(([key, value]) => Boolean(key && value))
      );
      const currentDemoCount = Number.parseInt(cookies.eai_demo_count ?? '0', 10) || 0;
      if (currentDemoCount >= 2) {
        return res.status(429).json({
          error: 'Create a free account to continue. Get 10 free Editorial Credits.',
        });
      }
      res.cookie('eai_demo_count', String(currentDemoCount + 1), {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
      });
    }

    let billingOrgId: string | null = null;
    if (userId) {
      billingOrgId = await resolveInternalOrgId(orgId, userId);
      const remainingCredits = await checkCreditsRemaining(userId, billingOrgId);
      if (remainingCredits < 1) {
        return res.status(402).json({ error: 'Insufficient credits' });
      }
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let isDisconnected = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        isDisconnected = true;
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
        }
        console.log('[generate-draft-from-notes] Client closed connection.');
      }
    });

    heartbeatInterval = setInterval(() => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`);
      }
    }, 5000);

    if (!notes || notes.length === 0) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', message: 'No notes provided' })}\n\n`
      );
      res.end();
      return;
    }

    let workspace = null;
    if (userId) {
      workspace = await getWorkspaceState(userId, {
        clerkOrganizationId: orgId,
        clerkOrganizationSlug: orgSlug,
        clerkOrganizationRole: orgRole,
      });
    }

    let profile = ENVOYOU_EDITORIAL_PROFILE;
    try {
      if (userId) {
        profile = await resolveEditorialProfileForUser(
          userId,
          workspace?.organizationId
        );
      }
    } catch (profileError) {
      console.warn(
        '[Editorial Profile] Profile resolution failed, falling back to Envoyou v1:',
        profileError
      );
    }

    const notesText = notes
      .map(
        (
          n: { content: string; sources?: { url: string; domain?: string }[] },
          i: number
        ) => {
          const sourcesText =
            n.sources && n.sources.length > 0
              ? `Sources: ${n.sources.map((s) => s.url).join(', ')}`
              : '';
          const cleanContent = n.content.replace(/\s*\[\d+\]\([^)]+\)/g, '');
          return `NOTE ${i + 1}:\n${cleanContent}\n${sourcesText}`;
        }
      )
      .join('\n\n---\n\n');

    const briefMatches = notesText.match(
      /(?:###\s*\d+\.\s*Topic Brief|Rekomendasi Judul|Topic Brief:|##\s*Topic Brief)/gi
    );
    const hasMultipleBriefs = briefMatches && briefMatches.length > 1;
    const isBlueprint =
      /Blueprint Editorial|Audit Performa|Matriks Kontribusi|Strategi SEO|Hub-and-Spoke|Pipeline Konten/i.test(
        notesText
      );

    if (hasMultipleBriefs || isBlueprint) {
      res.write(
        `data: ${JSON.stringify({
          type: 'blueprint_detected',
          message:
            'Multiple article topics detected in notes. The AI will pick the first complete topic brief to generate the draft.',
          topicCount: briefMatches?.length || 0,
        })}\n\n`
      );
    }

    const systemInstruction = new DraftFromNotesComposer(profile?.config).compose(
      'xml'
    );

    const prompt = `
<input_material>
${notesText}
</input_material>

<metadata>
Category: ${metadata?.category || 'General'}
Type: ${metadata?.type || 'Article'}
Target Audience: ${metadata?.targetAudience || 'General Audience'}
Output Language: ${metadata?.outputLanguage || 'Follow the language of the input material.'}
Writing Instructions: ${metadata?.brief || 'Write in a clear, professional, and engaging tone.'}
</metadata>
`.trim();

    const stream = await withGeminiFlexRetry(() =>
      gemini.interactions.create({
        model: MODEL,
        input: prompt,
        system_instruction: systemInstruction,
        stream: true,
        generation_config: {
          max_output_tokens: 6000,
        },
        ...getGeminiInteractionConfig(),
      }, getGeminiInteractionRequestOptions())
    );

    let generatedText = '';
    for await (const event of stream) {
      if (isDisconnected) {
        console.log(
          '[generate-draft-from-notes] Aborting stream loop due to client disconnect.'
        );
        break;
      }
      if (
        event.event_type === 'step.delta' &&
        event.delta?.type === 'text' &&
        event.delta.text
      ) {
        generatedText += event.delta.text;
        res.write(
          `data: ${JSON.stringify({ type: 'text', chunk: event.delta.text })}\n\n`
        );
      } else if (event.event_type === 'interaction.completed') {
        const eventWithInteraction = event as {
          interaction?: { usage?: { total_tokens?: number } };
        };
        const usage = eventWithInteraction.interaction?.usage;
        if (usage) {
          console.log(
            `\n[ENVOYOU INTERNAL BILLING] Generate Draft from Notes Complete. Total Tokens: ${
              usage.total_tokens || 0
            }`
          );
        }
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      }
    }

    if (isDisconnected) return;

    if (userId && generatedText.trim()) {
      const savedLog = await prisma.analysisLog.create({
        data: {
          userId,
          organizationId: billingOrgId,
          role: 'draft_generation',
          content: generatedText,
          metadata: { source: 'strategist_notes' },
          promptVersion: PROMPT_VERSION,
          modelName: MODEL,
          status: 'success',
        },
      });
      await deductCredits(
        userId,
        billingOrgId,
        1,
        'article_refine',
        'Draft generation from strategist notes',
        savedLog.id
      );
    }

    res.end();
  } catch (error) {
    console.error('Error generating draft from notes:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate draft' });
    } else {
      res.write(
        `data: ${JSON.stringify({ type: 'error', message: 'Stream failed' })}\n\n`
      );
      res.end();
    }
  } finally {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
  }
  }
);

export default router;
