import { Router, Request, Response } from 'express';
import { prisma } from '@/lib/db';
import { checkCreditsRemaining, deductCredits } from '@/lib/chat-billing';
import { gemini } from '@/lib/ai/provider-runtime';
import { StrategistChatComposer } from '@/lib/ai/prompt-engine/composer/strategist-chat-composer';
import { composeWorkspaceContext } from '@/lib/ai/workspace-context';
import { resolveEditorialProfileForUser } from '@/lib/editorial-profile-server';
import {
  resolveInternalOrgId,
  scrapeUrlContent,
  softAuth,
  truncateAtParagraphBoundary,
  MODEL,
  RESEARCH_MODEL,
  FAST_MODE_MAX_OUTPUT_TOKENS,
  FAST_MODE_INSTRUCTION,
  buildUrlOverrideWithContent,
  URL_OVERRIDE_NO_CONTENT,
  DOCUMENT_MODE_OVERRIDE,
} from '../utils/helpers';
import { redisRateLimiter } from '@/middleware/rate-limit';
import { resolveGroundingUrl } from '../utils/grounding';
import { ChatInputSchema, type GroundingAnnotation, type UniqueSource } from '../types';

const router = Router();

// POST /api/strategist/analyze-data
router.post('/analyze-data', async (req: Request, res: Response) => {
  try {
    const { type, data } = req.body;
    let inputPrompt = '';

    if (type === 'csv' || type === 'url') {
      inputPrompt = `<context>\nThe user has uploaded their analytics data from: ${data}\n</context>\n\n<task>\nPlease analyze the top performing topics, traffic patterns, and user engagement, and propose a friendly opening message to start a discussion on their next content strategy.\n</task>`;
    } else {
      inputPrompt = `<context>\nThe user provided the following manual performance metrics: "${data}"\n</context>\n\n<task>\nPlease analyze this and propose a friendly opening message to start a discussion on their next content strategy.\n</task>`;
    }

    const interaction = await gemini.interactions.create({
      model: MODEL,
      input:
        inputPrompt +
        '\n\n<instructions>\nKeep your responses concise, insightful, and engaging.\n</instructions>',
      system_instruction: new StrategistChatComposer().compose('xml'),
    });

    res.json({ reply: interaction.output_text });
  } catch (error) {
    console.error('Error analyzing data:', error);
    res.status(500).json({ error: 'Failed to analyze data' });
  }
});

// POST /api/strategist/greet
router.post('/greet', async (req: Request, res: Response) => {
  try {
    const chatSchema = {
      type: 'object',
      properties: {
        reply: { type: 'string' },
        suggestions: { type: 'array', items: { type: 'string' } },
      },
      required: ['reply', 'suggestions'],
    };

    const interaction = await gemini.interactions.create({
      model: MODEL,
      input:
        '<task>\nGreet the user to EAI Research Strategist. Introduce yourself as a Thinking Partner. Be concise, friendly, and offer to analyze their blog data, research trends, or brainstorm content.\n</task>\n\n<instructions>\nAlways provide 3-4 dynamic, clickable suggestion options.\n</instructions>',
      system_instruction: new StrategistChatComposer().compose('xml'),
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: chatSchema,
      },
    });

    let output;
    try {
      output = JSON.parse(interaction.output_text || '{}');
    } catch (_e) {
      output = { reply: interaction.output_text, suggestions: [] };
    }
    res.json({ reply: output.reply, suggestions: output.suggestions });
  } catch (error) {
    console.error('Error in greet:', error);
    res.status(500).json({ error: 'Failed to greet' });
  }
});

// GET /api/strategist/chat/status/:id
router.get('/chat/status/:id', async (req: Request, res: Response) => {
  try {
    const interactionId = req.params.id;
    const interaction = await gemini.interactions.get(interactionId);

    res.json({
      state: interaction.status ? interaction.status.toUpperCase() : 'UNKNOWN',
      output: (interaction as { output_text?: string }).output_text || '',
    });
  } catch (error) {
    console.error('Error getting interaction status:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// POST /api/strategist/chat
router.post(
  '/chat',
  softAuth,
  redisRateLimiter({
    namespace: 'strategist:chat',
    windowMs: 60000,
    max: 20,
    message: 'Too many requests. Please try again later.',
  }),
  async (req: Request, res: Response) => {
    let heartbeatInterval: NodeJS.Timeout | undefined;
    try {
      const parsedInput = ChatInputSchema.safeParse(req.body);
      if (!parsedInput.success) {
        return res.status(400).json({
          error: 'Invalid chat request',
          issues: parsedInput.error.issues,
        });
      }
      const {
        messages,
        mode,
        notesSummary,
        attachments,
        enableSearch,
        activeHistoryId,
        sessionId,
      } = parsedInput.data;
      const chatInput = messages[messages.length - 1]?.content || '';

      if (req.auth?.userId && sessionId && sessionId !== 'new') {
        const ownedSession = await prisma.chatSession.findFirst({
          where: { id: sessionId, userId: req.auth.userId },
          select: { id: true },
        });
        if (!ownedSession) {
          return res.status(404).json({ error: 'Chat session not found' });
        }
      }

      const GREETING_WORDS = new Set([
        'halo',
        'hi',
        'hey',
        'hello',
        'p',
        'tes',
        'test',
        'pagi',
        'siang',
        'sore',
        'malam',
        'apa kabar',
        'assalamualaikum',
        'ask',
      ]);
      const isSimpleGreeting = (text: string): boolean => {
        const clean = text.trim().toLowerCase().replace(/[^\w\s]/g, '');
        if (clean.length < 3) return true;
        if (clean.split(/\s+/).length > 3) return false;
        return (
          GREETING_WORDS.has(clean) ||
          clean.split(/\s+/).every((word) => GREETING_WORDS.has(word))
        );
      };

      const isSearchEnabled =
        mode !== 'deep' && enableSearch !== false && !isSimpleGreeting(chatInput);
      const requiredCredits = mode === 'deep' ? 5 : isSearchEnabled ? 1 : 0;

      if (requiredCredits > 0) {
        if (!req.auth || !req.auth.userId) {
          return res.status(403).json({
            code: 'AUTH_REQUIRED',
            error: 'Authentication Required',
            message: 'You must be signed in to use this premium feature.',
          });
        }

        const internalOrgId = await resolveInternalOrgId(
          req.auth.orgId,
          req.auth.userId
        );

        const balance = await checkCreditsRemaining(req.auth.userId, internalOrgId);
        if (balance < requiredCredits) {
          return res.status(403).json({
            code: 'INSUFFICIENT_CREDITS',
            error: 'Insufficient Credits',
            message:
              'You have run out of credits. Please refill your balance or upgrade your plan to continue using this feature.',
          });
        }

        (req as Request & { resolvedOrgId?: string | null }).resolvedOrgId =
          internalOrgId;
      }

      let profile = null;
      if (req.auth && req.auth.userId) {
        try {
          const internalOrgId = await resolveInternalOrgId(
            req.auth.orgId,
            req.auth.userId
          );
          profile = await resolveEditorialProfileForUser(
            req.auth.userId,
            internalOrgId
          );
        } catch (err) {
          console.warn('[CHAT_WARNING] Failed to resolve brand profile:', err);
        }
      }

      let dbSessionId = req.auth?.userId ? sessionId : undefined;
      if (req.auth && req.auth.userId) {
        if (!dbSessionId || dbSessionId === 'new') {
          const firstMsg = chatInput.slice(0, 40).trim() || 'Percakapan Baru';
          const title = firstMsg.length >= 40 ? `${firstMsg}...` : firstMsg;
          const internalOrgId = await resolveInternalOrgId(
            req.auth.orgId,
            req.auth.userId
          );

          try {
            const newSession = await prisma.chatSession.create({
              data: {
                userId: req.auth.userId,
                organizationId: internalOrgId,
                title,
              },
            });
            dbSessionId = newSession.id;
          } catch (dbErr) {
            console.error('[CHAT_DB_ERROR] Failed to create chat session:', dbErr);
          }
        } else {
          try {
            await prisma.chatSession.update({
              where: { id: dbSessionId },
              data: { updatedAt: new Date() },
            });
          } catch (dbErr) {
            console.warn(
              '[CHAT_DB_WARNING] Failed to touch session updated date:',
              dbErr
            );
          }
        }

        if (dbSessionId) {
          try {
            await prisma.chatMessage.create({
              data: {
                sessionId: dbSessionId,
                role: 'user',
                type: 'text',
                content: chatInput,
              },
            });
          } catch (dbErr) {
            console.error('[CHAT_DB_ERROR] Failed to save user message:', dbErr);
          }
        }
      }

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
        console.log('[chat] Client closed connection.');
      });

      heartbeatInterval = setInterval(() => {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`);
        }
      }, 5000);

      if (dbSessionId) {
        res.write(
          `data: ${JSON.stringify({
            type: 'session_init',
            sessionId: dbSessionId,
          })}\n\n`
        );
      }

      const URL_REGEX = /https?:\/\/[^\s"'<>]+/i;
      const urlMatch = chatInput.match(URL_REGEX);
      let scrapedContent = '';
      let urlToScrape = '';
      if (urlMatch) {
        urlToScrape = urlMatch[0];
        scrapedContent = await scrapeUrlContent(urlToScrape);
      }

      const CHAT_HISTORY_WINDOW = 6;
      const ASSISTANT_MSG_MAX_CHARS = 1500;
      const rawHistory = messages.slice(0, -1);
      const windowedHistory =
        rawHistory.length > CHAT_HISTORY_WINDOW
          ? rawHistory.slice(-CHAT_HISTORY_WINDOW)
          : rawHistory;

      const history = windowedHistory.map(
        (m: { role: string; content: string }) => {
          const text =
            m.role === 'assistant'
              ? truncateAtParagraphBoundary(m.content, ASSISTANT_MSG_MAX_CHARS)
              : m.content;
          return { role: m.role, content: [{ type: 'text', text }] };
        }
      );

      const timezone = 'Asia/Jakarta';
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());

      const currentYear =
        parts.find((part) => part.type === 'year')?.value ||
        new Date().getFullYear().toString();
      const month = parts.find((part) => part.type === 'month')?.value || '01';
      const day = parts.find((part) => part.type === 'day')?.value || '01';
      const currentDate = `${currentYear}-${month}-${day}`;

      const { xml: workspaceXml, agentInstruction } = composeWorkspaceContext({
        today: currentDate,
        timezone,
        profileConfig: profile?.config ?? null,
        notesSummary,
        attachment:
          attachments &&
          Array.isArray(attachments) &&
          attachments[0]?.extractedText
            ? {
                filename: attachments[0].filename,
                contentType: attachments[0].contentType,
                content: attachments[0].extractedText,
              }
            : null,
        scrapedUrl: scrapedContent
          ? {
              url: urlToScrape,
              content: scrapedContent,
            }
          : null,
        history: history.map(
          (m: { role: string; content: { text: string }[] }) => ({
            role: m.role,
            text: m.content[0].text,
          })
        ),
      });

      const contextPrompt = `${workspaceXml}\n\n<task>\nuser: ${chatInput}\nassistant:\n</task>`;

      if (mode === 'deep') {
        const resolvedOrgId =
          (req as Request & { resolvedOrgId?: string | null }).resolvedOrgId ?? null;
        await deductCredits(
          req.auth!.userId,
          resolvedOrgId,
          requiredCredits,
          'deep_research',
          `Deep Research session started (Query: ${chatInput.slice(0, 60)})`,
          activeHistoryId || undefined
        );

        const deepModeInput = `<instructions>\nCRITICAL INSTRUCTION: YOU ARE IN DEEP RESEARCH MODE. Use Google Search thoroughly to gather facts, synthesize a comprehensive report, and ensure all claims are backed by credible sources.\n</instructions>\n\n${agentInstruction}\n\n=== DYNAMIC CONTEXT & HISTORY ===\n${contextPrompt}`;

        const interaction = await gemini.interactions.create({
          model: RESEARCH_MODEL,
          input: deepModeInput,
          system_instruction: new StrategistChatComposer(profile?.config).compose(
            'xml'
          ),
          tools: [{ type: 'google_search' }],
          background: true,
        });

        console.log(
          `[BILLING] Deep Research started. Interaction ID: ${interaction.id}. Token usage will be billed upon completion.`
        );

        res.write(
          `data: ${JSON.stringify({
            type: 'deep_research_started',
            interaction_id: interaction.id,
          })}\n\n`
        );
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
        return;
      }

      let finalFastModeInstruction = `${FAST_MODE_INSTRUCTION}\n\n${agentInstruction}`;
      const hasAttachments =
        attachments && Array.isArray(attachments) && attachments.length > 0;
      const hasUrlInMessage = !!urlMatch;

      if (hasUrlInMessage) {
        if (scrapedContent) {
          finalFastModeInstruction += `\n\n${buildUrlOverrideWithContent(urlToScrape)}`;
        } else {
          finalFastModeInstruction += `\n\n${URL_OVERRIDE_NO_CONTENT}`;
        }
      }

      if (hasAttachments) {
        finalFastModeInstruction += `\n\n${DOCUMENT_MODE_OVERRIDE}`;
      }

      const stream = await gemini.interactions.create({
        model: MODEL,
        input: contextPrompt,
        system_instruction: finalFastModeInstruction,
        tools: isSearchEnabled ? [{ type: 'google_search' }] : undefined,
        generation_config: {
          max_output_tokens: FAST_MODE_MAX_OUTPUT_TOKENS,
        },
        stream: true,
      });

      let finalOutputText = '';
      const globalAnnotations: GroundingAnnotation[] = [];

      for await (const rawEvent of stream) {
        if (isDisconnected) break;
        const event = rawEvent as unknown as {
          event_type?: string;
          delta?: {
            type?: string;
            text?: string;
            annotations?: GroundingAnnotation[];
          };
        };

        if (
          (event.event_type === 'step.delta' || event.event_type === 'content.delta') &&
          event.delta
        ) {
          if (event.delta.text) {
            finalOutputText += event.delta.text;
          }
          if (
            event.delta.annotations &&
            Array.isArray(event.delta.annotations)
          ) {
            for (const annotation of event.delta.annotations) {
              globalAnnotations.push({
                type: annotation.type,
                url: annotation.url,
                title:
                  typeof annotation.title === 'string'
                    ? annotation.title
                    : undefined,
              });
            }
          }
        }
      }

      if (!isDisconnected) {
        if (requiredCredits > 0 && req.auth && req.auth.userId) {
          try {
            const resolvedOrgId =
              (req as Request & { resolvedOrgId?: string | null })
                .resolvedOrgId ?? null;
            await deductCredits(
              req.auth.userId,
              resolvedOrgId,
              requiredCredits,
              'copilot_chat',
              `Fast Chat with Search (Query: ${chatInput.slice(0, 60)})`,
              activeHistoryId || undefined
            );
          } catch (billErr) {
            console.error(
              '[CHAT_BILLING_ERROR] Failed to deduct credits:',
              billErr
            );
          }
        }

        const urlToIndex = new Map<string, number>();
        const uniqueSourcesData: UniqueSource[] = [];

        const resolvedUrls = new Map<string, string>();
        const urlsToResolve = [
          ...new Set(globalAnnotations.map((a) => a.url).filter(Boolean)),
        ] as string[];

        await Promise.all(
          urlsToResolve.map(async (u) => {
            const resolved = await resolveGroundingUrl(u);
            resolvedUrls.set(u, resolved);
          })
        );

        for (const annotation of globalAnnotations) {
          if (annotation.type === 'url_citation' && annotation.url) {
            const realUrl = resolvedUrls.get(annotation.url) || annotation.url;
            if (!urlToIndex.has(realUrl)) {
              urlToIndex.set(realUrl, urlToIndex.size + 1);
              let domain = annotation.title;
              if (!domain || domain.trim() === '') {
                try {
                  domain = new URL(realUrl).hostname.replace('www.', '');
                } catch (_e) {
                  domain = 'Source';
                }
              }
              const cleanDomain = domain.replace(/[[\]()*_`]/g, '').trim();
              uniqueSourcesData.push({ url: realUrl, domain: cleanDomain });
            }
          }
        }

        let annotationIndex = 0;
        const citeRegex = /\[cite:\s*[^\]]+\]/gi;
        const sources: string[] = [];

        const finalOutputTextProcessed = finalOutputText.replace(
          citeRegex,
          (_match) => {
            if (annotationIndex < globalAnnotations.length) {
              const annotation = globalAnnotations[annotationIndex++];
              if (annotation.type === 'url_citation' && annotation.url) {
                const realUrl =
                  resolvedUrls.get(annotation.url) || annotation.url;
                sources.push(realUrl);
                const sourceIndex = urlToIndex.get(realUrl);
                return `[${sourceIndex}](${realUrl})`;
              }
            }
            return '';
          }
        );

        const outputToSend = finalOutputTextProcessed
          .replace(/\s*\[\s*$/g, '')
          .trim();

        if (outputToSend) {
          res.write(
            `data: ${JSON.stringify({
              type: 'replace_text',
              text: outputToSend,
            })}\n\n`
          );
        }
        if (uniqueSourcesData.length > 0) {
          res.write(
            `data: ${JSON.stringify({
              type: 'sources',
              sources: uniqueSourcesData,
            })}\n\n`
          );
        }
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);

        if (dbSessionId && outputToSend) {
          try {
            await prisma.chatMessage.create({
              data: {
                sessionId: dbSessionId,
                role: 'assistant',
                type: 'text',
                content: outputToSend,
                payload:
                  uniqueSourcesData.length > 0
                    ? JSON.parse(JSON.stringify({ sources: uniqueSourcesData }))
                    : undefined,
              },
            });
          } catch (dbErr) {
            console.error(
              '[CHAT_DB_ERROR] Failed to save assistant message:',
              dbErr
            );
          }
        }
      }

      res.end();
    } catch (error) {
      console.error('Error in chat stream:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to chat' });
      } else {
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            message: 'Stream failed',
          })}\n\n`
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
