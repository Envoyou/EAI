import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
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
  getStrategistFastChatModel,
  RESEARCH_MODEL,
  FAST_MODE_MAX_OUTPUT_TOKENS,
  FAST_MODE_INSTRUCTION,
  buildUrlOverrideWithContent,
  URL_OVERRIDE_NO_CONTENT,
  DOCUMENT_MODE_OVERRIDE,
} from '../utils/helpers';
import { redisRateLimiter } from '@/middleware/rate-limit';
import { resolveGroundingUrl } from '../utils/grounding';
import type { GroundingAnnotation, UniqueSource } from '../types';
import {
  ChatInputSchema,
  StrategistChatResultSchema,
  StrategistCancelRequestSchema,
  StrategistCancelResponseSchema,
  StrategistStatusResponseSchema,
  setStrategistSseHeaders,
  writeStrategistSseEvent,
} from '../chat-protocol';
import {
  getGeminiInteractionConfig,
  getGeminiInteractionRequestOptions,
  isGeminiGroundingDisabledForTests,
  withGeminiFlexRetry,
} from '@/lib/ai/gemini-request-policy';
import { bindResponseAbort } from '@/lib/request-abort';
import {
  buildStrategistChatGenerationConfig,
  isEmptyStrategistStreamError,
  readStrategistThinkingEvent,
  readStrategistStreamFailure,
  requireStrategistStreamOutput,
  type GeminiInteractionStreamEvent,
} from '../gemini-chat-stream';
import { classifyStrategistChatFailure } from '../chat-request-lifecycle';
import { Prisma } from '@prisma/client';

const router = Router();

const getDeepResearchCancelToken = (userId: string, interactionId: string) => {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error('CLERK_SECRET_KEY is required for Deep Research cancellation');
  return crypto
    .createHmac('sha256', secret)
    .update(`${userId}:${interactionId}`)
    .digest('hex');
};

const isValidDeepResearchCancelToken = (
  userId: string,
  interactionId: string,
  token: unknown
) => {
  if (typeof token !== 'string') return false;
  const expected = getDeepResearchCancelToken(userId, interactionId);
  const actualBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

// POST /api/strategist/analyze-data
router.post('/analyze-data', async (req: Request, res: Response) => {
  const requestAbort = bindResponseAbort(res, 'Strategist data analysis');
  try {
    const { type, data } = req.body;
    let inputPrompt = '';

    if (type === 'csv' || type === 'url') {
      inputPrompt = `<context>\nThe user has uploaded their analytics data from: ${data}\n</context>\n\n<task>\nPlease analyze the top performing topics, traffic patterns, and user engagement, and propose a friendly opening message to start a discussion on their next content strategy.\n</task>`;
    } else {
      inputPrompt = `<context>\nThe user provided the following manual performance metrics: "${data}"\n</context>\n\n<task>\nPlease analyze this and propose a friendly opening message to start a discussion on their next content strategy.\n</task>`;
    }

    const interaction = await withGeminiFlexRetry(() =>
      gemini.interactions.create({
        model: MODEL,
        input:
          inputPrompt +
          '\n\n<instructions>\nKeep your responses concise, insightful, and engaging.\n</instructions>',
        system_instruction: new StrategistChatComposer().compose('xml'),
        ...getGeminiInteractionConfig(),
      }, getGeminiInteractionRequestOptions(undefined, requestAbort.signal)),
      { signal: requestAbort.signal }
    );

    res.json({ reply: interaction.output_text });
  } catch (error) {
    if (requestAbort.signal.aborted) return;
    console.error('Error analyzing data:', error);
    res.status(500).json({ error: 'Failed to analyze data' });
  } finally {
    requestAbort.dispose();
  }
});

// POST /api/strategist/greet
router.post('/greet', async (req: Request, res: Response) => {
  const requestAbort = bindResponseAbort(res, 'Strategist greeting');
  try {
    const chatSchema = {
      type: 'object',
      properties: {
        reply: { type: 'string' },
        suggestions: { type: 'array', items: { type: 'string' } },
      },
      required: ['reply', 'suggestions'],
    };

    const interaction = await withGeminiFlexRetry(() =>
      gemini.interactions.create({
        model: MODEL,
        input:
          '<task>\nGreet the user to EAI Research Strategist. Introduce yourself as a Thinking Partner. Be concise, friendly, and offer to analyze their blog data, research trends, or brainstorm content.\n</task>\n\n<instructions>\nAlways provide 3-4 dynamic, clickable suggestion options.\n</instructions>',
        system_instruction: new StrategistChatComposer().compose('xml'),
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: chatSchema,
        },
        ...getGeminiInteractionConfig(),
      }, getGeminiInteractionRequestOptions(undefined, requestAbort.signal)),
      { signal: requestAbort.signal }
    );

    let output;
    try {
      output = JSON.parse(interaction.output_text || '{}');
    } catch (_e) {
      output = { reply: interaction.output_text, suggestions: [] };
    }
    res.json({ reply: output.reply, suggestions: output.suggestions });
  } catch (error) {
    if (requestAbort.signal.aborted) return;
    console.error('Error in greet:', error);
    res.status(500).json({ error: 'Failed to greet' });
  } finally {
    requestAbort.dispose();
  }
});

// GET /api/strategist/chat/status/:id
router.get('/chat/status/:id', async (req: Request, res: Response) => {
  const requestAbort = bindResponseAbort(res, 'Strategist status');
  try {
    const interactionId = req.params.id;
    const interaction = await gemini.interactions.get(
      interactionId,
      undefined,
      getGeminiInteractionRequestOptions(undefined, requestAbort.signal)
    );

    res.json(StrategistStatusResponseSchema.parse({
      state: interaction.status ? interaction.status.toUpperCase() : 'UNKNOWN',
      output: (interaction as { output_text?: string }).output_text || '',
    }));
  } catch (error) {
    if (requestAbort.signal.aborted) return;
    console.error('Error getting interaction status:', error);
    res.status(500).json({ error: 'Failed to get status' });
  } finally {
    requestAbort.dispose();
  }
});

router.post('/chat/status/:id/cancel', softAuth, async (req: Request, res: Response) => {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const interactionId = req.params.id;
  const parsedCancelRequest = StrategistCancelRequestSchema.safeParse(req.body);
  if (
    !parsedCancelRequest.success ||
    !isValidDeepResearchCancelToken(
      req.auth.userId,
      interactionId,
      parsedCancelRequest.data.cancelToken
    )
  ) {
    return res.status(403).json({ error: 'Invalid cancellation token' });
  }

  const requestAbort = bindResponseAbort(res, 'Deep Research cancellation');
  try {
    await gemini.interactions.cancel(
      interactionId,
      undefined,
      getGeminiInteractionRequestOptions(undefined, requestAbort.signal)
    );
    return res.json(StrategistCancelResponseSchema.parse({ success: true }));
  } catch (error) {
    if (requestAbort.signal.aborted) return;
    console.error('Error cancelling Deep Research:', error);
    return res.status(502).json({ error: 'Failed to cancel Deep Research' });
  } finally {
    requestAbort.dispose();
  }
});

// GET /api/strategist/chat/request/:requestId
router.get('/chat/request/:requestId', softAuth, async (req: Request, res: Response) => {
  try {
    if (!req.auth?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const chatRequest = await prisma.strategistChatRequest.findUnique({
      where: { id: req.params.requestId },
    });
    if (!chatRequest || chatRequest.userId !== req.auth.userId) {
      return res.status(404).json({ error: 'Chat request not found' });
    }

    if (chatRequest.status === 'completed' && chatRequest.response) {
      const parsedResult = StrategistChatResultSchema.safeParse(
        chatRequest.response
      );
      if (parsedResult.success) {
        return res.json({
          status: 'completed',
          result: parsedResult.data,
        });
      }
    }

    return res.json({
      status: chatRequest.status,
      error:
        chatRequest.status === 'failed'
          ? {
              code: chatRequest.errorCode || 'CHAT_FAILED',
              message:
                chatRequest.errorMessage ||
                'The strategist could not complete this response.',
            }
          : null,
    });
  } catch (error) {
    console.error('Error fetching strategist chat request:', error);
    return res.status(500).json({ error: 'Failed to fetch chat request status' });
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
    const requestAbort = bindResponseAbort(res, 'Strategist chat');
    let heartbeatInterval: NodeJS.Timeout | undefined;
    let chatRequestClaimed = false;
    let chatRequestCompleted = false;
    let claimedRequestId: string | null = null;
    try {
      const parsedInput = ChatInputSchema.safeParse(req.body);
      if (!parsedInput.success) {
        return res.status(400).json({
          error: 'Invalid chat request',
          issues: parsedInput.error.issues,
        });
      }
      const {
        requestId: clientRequestId,
        messages,
        mode,
        notesSummary,
        attachments,
        enableSearch,
        activeHistoryId,
        sessionId,
      } = parsedInput.data;
      const requestId = clientRequestId ?? crypto.randomUUID();
      claimedRequestId = requestId;
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

      let recoveredSessionId: string | undefined;
      if (req.auth?.userId && mode !== 'deep') {
        const claim = await prisma.strategistChatRequest.createMany({
          data: [{
            id: requestId,
            userId: req.auth.userId,
            sessionId:
              sessionId && sessionId !== 'new' ? sessionId : undefined,
          }],
          skipDuplicates: true,
        });

        if (claim.count === 1) {
          chatRequestClaimed = true;
        } else {
          const existingRequest =
            await prisma.strategistChatRequest.findUnique({
              where: { id: requestId },
            });
          if (!existingRequest || existingRequest.userId !== req.auth.userId) {
            return res.status(409).json({ error: 'Chat request conflict' });
          }

          if (
            existingRequest.status === 'completed' &&
            existingRequest.response
          ) {
            const replay = StrategistChatResultSchema.safeParse(
              existingRequest.response
            );
            if (!replay.success) {
              throw new Error('Stored strategist chat response is invalid');
            }
            setStrategistSseHeaders(res);
            writeStrategistSseEvent(res, {
              type: 'session_init',
              sessionId: replay.data.sessionId,
            });
            if (replay.data.text) {
              writeStrategistSseEvent(res, {
                type: 'replace_text',
                text: replay.data.text,
              });
            }
            if (replay.data.sources.length > 0) {
              writeStrategistSseEvent(res, {
                type: 'sources',
                sources: replay.data.sources,
              });
            }
            writeStrategistSseEvent(res, { type: 'done' });
            return res.end();
          }

          if (existingRequest.status === 'pending') {
            return res.status(202).json({
              status: 'pending',
              requestId,
            });
          }

          const reclaimed = await prisma.strategistChatRequest.updateMany({
            where: {
              id: requestId,
              userId: req.auth.userId,
              status: 'failed',
            },
            data: {
              status: 'pending',
              response: Prisma.DbNull,
              errorCode: null,
              errorMessage: null,
            },
          });
          if (reclaimed.count === 0) {
            return res.status(202).json({
              status: 'pending',
              requestId,
            });
          }
          recoveredSessionId = existingRequest.sessionId ?? undefined;
          chatRequestClaimed = true;
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
      const fastChatModel = getStrategistFastChatModel(isSearchEnabled);
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

      let dbSessionId = req.auth?.userId
        ? recoveredSessionId ?? sessionId
        : undefined;
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
            if (mode !== 'deep') {
              await prisma.strategistChatRequest.update({
                where: { id: requestId },
                data: { sessionId: dbSessionId },
              });
            }
          } catch (dbErr) {
            if (mode !== 'deep') throw dbErr;
            console.error('[CHAT_DB_ERROR] Failed to create chat session:', dbErr);
          }
        } else if (mode === 'deep') {
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

      }

      if (mode === 'deep' && dbSessionId) {
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
          console.error(
            '[CHAT_DB_ERROR] Failed to save Deep Research user message:',
            dbErr
          );
        }
      }

      setStrategistSseHeaders(res);

      heartbeatInterval = setInterval(() => {
        if (!res.writableEnded) {
          writeStrategistSseEvent(res, { type: 'heartbeat' });
        }
      }, 5000);

      if (dbSessionId) {
        writeStrategistSseEvent(res, {
          type: 'session_init',
          sessionId: dbSessionId,
        });
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
        if (isGeminiGroundingDisabledForTests()) {
          writeStrategistSseEvent(res, {
            type: 'error',
            error: 'Deep Research is disabled by the staging cost guard.',
          });
          res.end();
          return;
        }
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

        const interaction = await withGeminiFlexRetry(() =>
          gemini.interactions.create({
            model: RESEARCH_MODEL,
            input: deepModeInput,
            system_instruction: new StrategistChatComposer(profile?.config).compose(
              'xml'
            ),
            tools: [{ type: 'google_search' }],
            background: true,
            ...getGeminiInteractionConfig(),
          }, getGeminiInteractionRequestOptions(undefined, requestAbort.signal)),
          { signal: requestAbort.signal }
        );

        console.log(
          `[BILLING] Deep Research started. Interaction ID: ${interaction.id}. Token usage will be billed upon completion.`
        );

        writeStrategistSseEvent(res, {
          type: 'deep_research_started',
          interaction_id: interaction.id,
          cancel_token: getDeepResearchCancelToken(req.auth!.userId, interaction.id),
        });
        writeStrategistSseEvent(res, { type: 'done' });
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

      let lastStreamDiagnostic: {
        eventTypes: Record<string, number>;
        deltaTypes: Record<string, number>;
        terminalStatus?: string;
      } | null = null;

      const runFastStream = () =>
        withGeminiFlexRetry(async () => {
          const stream = await gemini.interactions.create({
            model: fastChatModel,
            input: contextPrompt,
            system_instruction: finalFastModeInstruction,
            tools: isSearchEnabled && !isGeminiGroundingDisabledForTests()
              ? [{ type: 'google_search' }]
              : undefined,
            generation_config: buildStrategistChatGenerationConfig(
              FAST_MODE_MAX_OUTPUT_TOKENS,
              isSearchEnabled
            ),
            stream: true,
            ...getGeminiInteractionConfig(),
          }, getGeminiInteractionRequestOptions(undefined, requestAbort.signal));

          let attemptOutputText = '';
          const attemptAnnotations: GroundingAnnotation[] = [];
          const eventTypes: Record<string, number> = {};
          const deltaTypes: Record<string, number> = {};
          let terminalStatus: string | undefined;

          for await (const rawEvent of stream) {
            if (requestAbort.isDisconnected()) break;
            const streamFailure = readStrategistStreamFailure(rawEvent);
            if (streamFailure) throw streamFailure;

            const event = rawEvent as unknown as GeminiInteractionStreamEvent;
            const eventType = event.event_type || 'unknown';
            eventTypes[eventType] = (eventTypes[eventType] || 0) + 1;
            if (event.delta?.type) {
              deltaTypes[event.delta.type] =
                (deltaTypes[event.delta.type] || 0) + 1;
            }
            terminalStatus =
              event.interaction?.status || event.status || terminalStatus;

            if (
              (
                event.event_type === 'step.delta' ||
                event.event_type === 'content.delta'
              ) &&
              event.delta
            ) {
              const thinkingEvent = readStrategistThinkingEvent(
                event,
                isSearchEnabled ? 'grounding' : 'reasoning'
              );
              if (thinkingEvent) {
                writeStrategistSseEvent(res, thinkingEvent);
              } else if (
                event.delta.type !== 'thought_summary' &&
                event.delta.text
              ) {
                attemptOutputText += event.delta.text;
              }

              if (
                event.delta.annotations &&
                Array.isArray(event.delta.annotations)
              ) {
                for (const annotation of event.delta.annotations) {
                  if (typeof annotation.type !== 'string') continue;
                  attemptAnnotations.push({
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

          lastStreamDiagnostic = {
            eventTypes,
            deltaTypes,
            terminalStatus,
          };

          return {
            finalOutputText: requireStrategistStreamOutput(attemptOutputText),
            globalAnnotations: attemptAnnotations,
          };
        }, { signal: requestAbort.signal });

      let finalOutputText: string;
      let globalAnnotations: GroundingAnnotation[];
      try {
        ({ finalOutputText, globalAnnotations } = await runFastStream());
      } catch (error) {
        if (!isEmptyStrategistStreamError(error)) throw error;

        console.warn('[STRATEGIST_EMPTY_STREAM]', {
          model: fastChatModel,
          searchEnabled: isSearchEnabled,
          diagnostic: lastStreamDiagnostic,
          fallback: 'non_streaming_low_thinking',
        });

        const fallbackInteraction = await withGeminiFlexRetry(() =>
          gemini.interactions.create({
            model: fastChatModel,
            input: contextPrompt,
            system_instruction: finalFastModeInstruction,
            tools: isSearchEnabled && !isGeminiGroundingDisabledForTests()
              ? [{ type: 'google_search' }]
              : undefined,
            generation_config: {
              ...buildStrategistChatGenerationConfig(
                FAST_MODE_MAX_OUTPUT_TOKENS,
                false
              ),
              thinking_summaries: 'none' as const,
            },
            ...getGeminiInteractionConfig(),
          }, getGeminiInteractionRequestOptions(undefined, requestAbort.signal)),
          { signal: requestAbort.signal }
        );

        finalOutputText = requireStrategistStreamOutput(
          fallbackInteraction.output_text || ''
        );
        globalAnnotations = [];
      }

      if (!requestAbort.isDisconnected()) {
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
              activeHistoryId || undefined,
              `strategist-chat:${requestId}`
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

        if (dbSessionId) {
          const responsePayload = StrategistChatResultSchema.parse({
            sessionId: dbSessionId,
            text: outputToSend,
            sources: uniqueSourcesData,
          });
          await prisma.$transaction([
            prisma.chatSession.update({
              where: { id: dbSessionId },
              data: { updatedAt: new Date() },
            }),
            prisma.chatMessage.create({
              data: {
                sessionId: dbSessionId,
                role: 'user',
                type: 'text',
                content: chatInput,
              },
            }),
            prisma.chatMessage.create({
              data: {
                sessionId: dbSessionId,
                role: 'assistant',
                type: 'text',
                content: outputToSend,
                payload:
                  uniqueSourcesData.length > 0
                    ? JSON.parse(
                        JSON.stringify({ sources: uniqueSourcesData })
                      ) as Prisma.InputJsonValue
                    : undefined,
              },
            }),
            prisma.strategistChatRequest.update({
              where: { id: requestId },
              data: {
                sessionId: dbSessionId,
                status: 'completed',
                response: responsePayload as Prisma.InputJsonValue,
                errorCode: null,
                errorMessage: null,
              },
            }),
          ]);
          chatRequestCompleted = true;
        }

        if (outputToSend) {
          writeStrategistSseEvent(res, {
            type: 'replace_text',
            text: outputToSend,
          });
        }
        if (uniqueSourcesData.length > 0) {
          writeStrategistSseEvent(res, {
            type: 'sources',
            sources: uniqueSourcesData,
          });
        }
        writeStrategistSseEvent(res, { type: 'done' });
      }

      res.end();
    } catch (error) {
      const failure = requestAbort.signal.aborted
        ? {
            code: 'REQUEST_CANCELLED' as const,
            message: 'Chat request was cancelled.',
          }
        : classifyStrategistChatFailure(error);
      if (chatRequestClaimed && !chatRequestCompleted && claimedRequestId) {
        await prisma.strategistChatRequest
          .updateMany({
            where: {
              id: claimedRequestId,
              status: 'pending',
            },
            data: {
              status: 'failed',
              errorCode: failure.code,
              errorMessage: failure.message,
            },
          })
          .catch((requestError) => {
            console.error(
              '[STRATEGIST_CHAT_REQUEST_ERROR] Failed to record chat failure:',
              requestError
            );
          });
      }
      if (requestAbort.signal.aborted) return;
      console.error('Error in chat stream:', error);
      if (!res.headersSent) {
        res.status(502).json({
          error: failure.message,
          code: failure.code,
        });
      } else {
        writeStrategistSseEvent(res, {
          type: 'error',
          code: failure.code,
          message: failure.message,
        });
        res.end();
      }
    } finally {
      if (chatRequestClaimed && !chatRequestCompleted && claimedRequestId) {
        await prisma.strategistChatRequest
          .updateMany({
            where: {
              id: claimedRequestId,
              status: 'pending',
            },
            data: {
              status: 'failed',
              errorCode: 'REQUEST_CANCELLED',
              errorMessage: 'Chat request was cancelled.',
            },
          })
          .catch((requestError) => {
            console.error(
              '[STRATEGIST_CHAT_REQUEST_ERROR] Failed to close pending chat request:',
              requestError
            );
          });
      }
      requestAbort.dispose();
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
    }
  }
);

export default router;
