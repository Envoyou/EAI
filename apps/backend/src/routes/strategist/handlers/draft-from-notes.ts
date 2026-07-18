import { Router, Request, Response } from 'express';
import { verifyToken } from '@clerk/backend';
import { getWorkspaceState } from '@/lib/user-workspace';
import { resolveEditorialProfileForUser } from '@/lib/editorial-profile-server';
import { ENVOYOU_EDITORIAL_PROFILE } from '@eai/shared/server';
import { DraftFromNotesComposer } from '@/lib/ai/prompt-engine/composer/draft-from-notes-composer';
import { gemini, getNativeGeminiConfig } from '@/lib/ai/provider-runtime';
import { MODEL } from '../utils/helpers';

const router = Router();

// POST /api/strategist/generate-draft-from-notes
router.post('/generate-draft-from-notes', async (req: Request, res: Response) => {
  let heartbeatInterval: NodeJS.Timeout | undefined;
  try {
    let userId: string | null = null;
    let orgId: string | null = null;
    let orgSlug: string | null = null;
    let orgRole: string | null = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        if (token) {
          const payload = await verifyToken(token, {
            secretKey: process.env.CLERK_SECRET_KEY,
          });
          userId = payload.sub;
          orgId = (payload.org_id as string) || null;
          orgSlug = (payload.org_slug as string) || null;
          orgRole = (payload.org_role as string) || null;
        }
      } catch (authError) {
        console.warn('[Generate Draft Auth] Token verification failed:', authError);
      }
    }

    const { notes, metadata } = req.body;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let isDisconnected = false;
    req.on('close', () => {
      isDisconnected = true;
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      console.log('[generate-draft-from-notes] Client closed connection.');
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

    const stream = await gemini.interactions.create({
      model: MODEL,
      input: prompt,
      system_instruction: systemInstruction,
      stream: true,
      generation_config: {
        max_output_tokens: 6000,
        ...getNativeGeminiConfig(),
      },
    });

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
});

export default router;
