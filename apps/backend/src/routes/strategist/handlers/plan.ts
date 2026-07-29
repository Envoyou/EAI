import { Router, Request, Response } from 'express';
import { gemini } from '@/lib/ai/provider-runtime';
import { StrategistBlueprintComposer } from '@/lib/ai/prompt-engine/composer/strategist-blueprint-composer';
import { resolveEditorialProfileForUser } from '@/lib/editorial-profile-server';
import { parseJsonResponse } from '@eai/shared';
import { prisma } from '@/lib/db';
import {
  resolveInternalOrgId,
  softAuth,
  MODEL,
} from '../utils/helpers';
import { redisRateLimiter } from '@/middleware/rate-limit';
import { resolveGroundingUrl, sanitizeGroundingLeaks } from '../utils/grounding';
import { normalizeStrategistPlanResponse } from '../utils/plan';
import { GeneratePlanSchema, type GroundingAnnotation } from '../types';
import {
  getGeminiInteractionConfig,
  getGeminiInteractionRequestOptions,
  isGeminiGroundingDisabled,
  isRetryableGeminiFlexError,
  withGeminiFlexRetry,
} from '@/lib/ai/gemini-request-policy';
import { bindResponseAbort } from '@/lib/request-abort';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { resolveActiveAiFunctionConfig } from '@/lib/ai-provider-resolver';

const router = Router();

// GET /api/strategist/generate-plan/:requestId
router.get(
  '/generate-plan/:requestId',
  softAuth,
  async (req: Request, res: Response) => {
    try {
      if (!req.auth?.userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const requestId = req.params.requestId;
      const organizationId = await resolveInternalOrgId(
        req.auth.orgId,
        req.auth.userId
      );
      const planRequest = await prisma.strategistPlanRequest.findFirst({
        where: {
          id: requestId,
          userId: req.auth.userId,
          organizationId,
        },
      });

      if (!planRequest) {
        return res.status(404).json({ error: 'Blueprint request not found' });
      }

      if (planRequest.status === 'completed' && planRequest.response) {
        return res.json({
          status: 'completed',
          result: planRequest.response,
        });
      }

      return res.json({
        status: planRequest.status,
        error:
          planRequest.status === 'failed'
            ? 'Blueprint generation failed'
            : null,
      });
    } catch (error) {
      console.error('Error fetching strategist plan request:', error);
      return res.status(500).json({
        error: 'Failed to fetch blueprint request status',
      });
    }
  }
);

// POST /api/strategist/generate-plan
router.post(
  '/generate-plan',
  softAuth,
  redisRateLimiter({
    namespace: 'strategist:plan',
    windowMs: 60000,
    max: 10,
    message: 'Too many requests. Please try again later.',
  }),
  async (req: Request, res: Response) => {
    const requestAbort = bindResponseAbort(res, 'Strategist plan');
    let planRequestClaimed = false;
    let planRequestCompleted = false;
    let claimedRequestId: string | null = null;
    let claimedOrganizationId: string | null | undefined;
    try {
      const parsedInput = GeneratePlanSchema.safeParse(req.body);
      if (!parsedInput.success) {
        return res.status(400).json({
          error: 'Invalid plan request',
          issues: parsedInput.error.issues,
        });
      }
      const {
        requestId: clientRequestId,
        recommendation,
        history,
        sessionId,
      } = parsedInput.data;
      const requestId = clientRequestId ?? randomUUID();
      let recoveredSessionId: string | undefined;
      claimedRequestId = requestId;
      const internalOrgId = req.auth?.userId
        ? await resolveInternalOrgId(req.auth.orgId, req.auth.userId)
        : null;
      claimedOrganizationId = internalOrgId;

      if (req.auth?.userId && sessionId && sessionId !== 'new') {
        const ownedSession = await prisma.chatSession.findFirst({
          where: {
            id: sessionId,
            userId: req.auth.userId,
            organizationId: internalOrgId,
          },
          select: { id: true },
        });
        if (!ownedSession) {
          return res.status(404).json({ error: 'Chat session not found' });
        }
      }

      if (req.auth?.userId) {
        const claim = await prisma.strategistPlanRequest.createMany({
          data: [{
              id: requestId,
              userId: req.auth.userId,
              organizationId: internalOrgId,
              sessionId:
                sessionId && sessionId !== 'new' ? sessionId : undefined,
          }],
          skipDuplicates: true,
        });
        if (claim.count === 1) {
          planRequestClaimed = true;
        } else {
          const existingRequest =
            await prisma.strategistPlanRequest.findUnique({
              where: { id: requestId },
            });

          if (
            !existingRequest ||
            existingRequest.userId !== req.auth.userId ||
            existingRequest.organizationId !== internalOrgId
          ) {
            return res.status(409).json({ error: 'Blueprint request conflict' });
          }

          if (
            existingRequest.status === 'completed' &&
            existingRequest.response
          ) {
            return res.json(existingRequest.response);
          }

          if (existingRequest.status === 'pending') {
            return res.status(202).json({
              status: 'pending',
              requestId,
            });
          }

          const reclaimed = await prisma.strategistPlanRequest.updateMany({
            where: {
              id: requestId,
              userId: req.auth.userId,
              organizationId: internalOrgId,
              status: 'failed',
            },
            data: {
              status: 'pending',
              error: null,
              response: Prisma.DbNull,
            },
          });

          if (reclaimed.count === 0) {
            return res.status(202).json({
              status: 'pending',
              requestId,
            });
          }
          recoveredSessionId = existingRequest.sessionId ?? undefined;
          planRequestClaimed = true;
        }
      }

      const chatHistoryUrls: string[] = [];
      let chatHistory = '';
      if (history && Array.isArray(history)) {
        for (const m of history) {
          if (m.payload?.sources && Array.isArray(m.payload.sources)) {
            for (const s of m.payload.sources) {
              if (s.url && typeof s.url === 'string') {
                chatHistoryUrls.push(s.url);
              }
            }
          }
        }

        const HISTORY_WINDOW = 12;
        const trimmed =
          history.length > HISTORY_WINDOW
            ? history.slice(-HISTORY_WINDOW)
            : history;
        const truncationNote =
          history.length > HISTORY_WINDOW
            ? `[Note: showing last ${HISTORY_WINDOW} of ${history.length} messages]\n`
            : '';
        chatHistory =
          truncationNote +
          trimmed
            .map(
              (m: {
                role: string;
                content: string;
                payload?: { sources?: { url: string; domain: string }[] };
              }) => {
                let text = `${m.role}: ${m.content}`;
                if (m.payload?.sources && m.payload.sources.length > 0) {
                  const sourcesList = m.payload.sources
                    .map((s) => `- [${s.domain}](${s.url})`)
                    .join('\n');
                  text += `\n\n[Sources cited in this message]:\n${sourcesList}`;
                }
                return text;
              }
            )
            .join('\n\n---\n\n');
      }

      const prompt = `
      <context>
      The user wants to generate a final blueprint based on the following recommendation:
      "${recommendation}"
      
      Here is the preceding discussion history which contains the agreed-upon topic, audience, and outline:
      ${chatHistory}
      </context>
    `.trim();

      let profile = null;
      if (req.auth && req.auth.userId) {
        try {
          profile = await resolveEditorialProfileForUser(
            req.auth.userId,
            internalOrgId
          );
        } catch (err) {
          console.warn(
            '[GENERATE_PLAN_WARNING] Failed to resolve brand profile:',
            err
          );
        }
      }
      const blueprintConfig = req.auth?.userId
        ? await resolveActiveAiFunctionConfig(
            req.auth.userId,
            internalOrgId,
            'strategist_blueprint'
          )
        : { provider: 'gemini' as const, model: null };
      const blueprintModel = blueprintConfig.model || MODEL;

      const strategistPlanSchema = {
        type: 'object',
        properties: {
          reply: {
            type: 'string',
            description:
              'A friendly opening message to start a discussion or summarize the plan.',
          },
          suggestions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Exactly three action-oriented suggestions.',
          },
          plan: {
            type: 'object',
            properties: {
              angle: {
                type: 'string',
                description: 'The unique angle or perspective of the article.',
              },
              audience: {
                type: 'string',
                description: 'The target audience.',
              },
              hook: {
                type: 'string',
                description: 'A compelling hook for the introduction.',
              },
              outline: {
                type: 'string',
                description: 'A detailed markdown outline.',
              },
              seoIntent: {
                type: 'string',
                description: 'The primary search intent target.',
              },
              sources: {
                type: 'array',
                items: { type: 'string' },
                description: 'Verified domains or full URLs to cite.',
              },
              draft: {
                type: 'string',
                description:
                  'Cohesive 400-800 word draft synthesizing the outline and sources.',
              },
            },
            required: [
              'angle',
              'audience',
              'hook',
              'outline',
              'seoIntent',
              'sources',
              'draft',
            ],
          },
        },
        required: ['reply', 'suggestions', 'plan'],
      };

      let interaction;
      try {
        interaction = await withGeminiFlexRetry(() =>
          gemini.interactions.create({
            model: blueprintModel,
            input: prompt,
            system_instruction: new StrategistBlueprintComposer(
              profile?.config
            ).compose('xml'),
            tools: isGeminiGroundingDisabled()
              ? undefined
              : [{ type: 'google_search' }],
            response_format: {
              type: 'text',
              mime_type: 'application/json',
              schema: strategistPlanSchema,
            },
            ...getGeminiInteractionConfig(),
          }, getGeminiInteractionRequestOptions(undefined, requestAbort.signal)),
          { signal: requestAbort.signal }
        );
      } catch (apiError) {
        requestAbort.signal.throwIfAborted();
        // Removing the schema cannot repair exhausted Flex capacity.
        if (isRetryableGeminiFlexError(apiError)) throw apiError;
        console.warn(
          '[STRATEGIST] Structured Output API call failed. Retrying without schema constraint:',
          apiError
        );
        interaction = await withGeminiFlexRetry(() =>
          gemini.interactions.create({
            model: blueprintModel,
            input: prompt,
            system_instruction: new StrategistBlueprintComposer(
              profile?.config
            ).compose('xml'),
            tools: isGeminiGroundingDisabled()
              ? undefined
              : [{ type: 'google_search' }],
            ...getGeminiInteractionConfig(),
          }, getGeminiInteractionRequestOptions(undefined, requestAbort.signal)),
          { signal: requestAbort.signal }
        );
      }

      if (!interaction.output_text) {
        throw new Error('No output from model');
      }

      const parsed = parseJsonResponse(interaction.output_text) as Record<string, unknown> | null;
      const data = normalizeStrategistPlanResponse(parsed);
      if (!data) {
        throw new Error('Model returned an incomplete strategist plan');
      }

      const extractedAnnotations: GroundingAnnotation[] = [];

      const steps = (
        interaction as unknown as {
          steps?: {
            steps?: {
              action?: { type?: string };
              observation?: {
                type?: string;
                annotations?: GroundingAnnotation[];
              };
            }[];
          }[];
        }
      ).steps;

      if (steps && Array.isArray(steps)) {
        for (const stepObj of steps) {
          if (stepObj?.steps && Array.isArray(stepObj.steps)) {
            for (const subStep of stepObj.steps) {
              if (
                subStep.observation?.type === 'google_search_response' &&
                Array.isArray(subStep.observation.annotations)
              ) {
                for (const annotation of subStep.observation.annotations) {
                  extractedAnnotations.push({
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
        }
      }

      const VERTEX_URL_REGEX =
        /https:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\/[^\s"')]+/g;
      const matchedVertexUrlsInText = Array.from(
        (interaction.output_text || '').matchAll(VERTEX_URL_REGEX),
        (m) => m[0]
      );

      const rawPlanSources =
        data.plan && Array.isArray(data.plan.sources)
          ? (data.plan.sources as string[]).filter(
              (s) => typeof s === 'string' && s.length > 0
            )
          : [];

      const rawUrlsToResolve = [
        ...extractedAnnotations.map((a) => a.url).filter(Boolean),
        ...matchedVertexUrlsInText,
        ...rawPlanSources.filter((s) =>
          s.includes('vertexaisearch.cloud.google.com')
        ),
      ] as string[];

      const resolvedUrls = new Map<string, string>();
      const uniqueUrlsToResolve = [...new Set(rawUrlsToResolve)];

      await Promise.all(
        uniqueUrlsToResolve.map(async (u) => {
          const resolved = await resolveGroundingUrl(u);
          if (resolved && !resolved.includes('vertexaisearch.cloud.google.com')) {
            resolvedUrls.set(u, resolved);
          }
        })
      );

      const uniqueSourcesList: string[] = [];
      const urlToIndex = new Map<string, number>();

      for (const annotation of extractedAnnotations) {
        if (annotation.url) {
          const realUrl = resolvedUrls.get(annotation.url) || annotation.url;
          if (
            realUrl &&
            !realUrl.includes('vertexaisearch.cloud.google.com') &&
            !urlToIndex.has(realUrl)
          ) {
            uniqueSourcesList.push(realUrl);
            urlToIndex.set(realUrl, uniqueSourcesList.length);
          }
        }
      }

      for (const u of matchedVertexUrlsInText) {
        const realUrl = resolvedUrls.get(u);
        if (
          realUrl &&
          !realUrl.includes('vertexaisearch.cloud.google.com') &&
          !urlToIndex.has(realUrl)
        ) {
          uniqueSourcesList.push(realUrl);
          urlToIndex.set(realUrl, uniqueSourcesList.length);
        }
      }

      const rawRegistry = [
        ...new Set([...chatHistoryUrls, ...uniqueSourcesList]),
      ];
      const validUrlsRegistry: string[] = [];

      await Promise.all(
        rawRegistry.map(async (u) => {
          if (typeof u === 'string') {
            const resolved = await resolveGroundingUrl(u);
            if (resolved && !resolved.includes('vertexaisearch.cloud.google.com')) {
              validUrlsRegistry.push(resolved);
            }
          }
        })
      );

      const resolveToFullVerifiedUrl = (
        sourceInput: string,
        registry: string[]
      ): string => {
        if (!sourceInput || typeof sourceInput !== 'string') return sourceInput;

        const cleanInput = sourceInput
          .trim()
          .replace(/^https?:\/\/(www\.)?/, '')
          .toLowerCase();

        const exactMatch = registry.find(
          (u) => u.toLowerCase() === sourceInput.toLowerCase()
        );
        if (exactMatch) return exactMatch;

        for (const verifiedUrl of registry) {
          try {
            const verifiedUrlObj = new URL(verifiedUrl);
            const verifiedHost = verifiedUrlObj.hostname
              .replace('www.', '')
              .toLowerCase();

            if (
              cleanInput === verifiedHost ||
              cleanInput ===
                verifiedHost + verifiedUrlObj.pathname.toLowerCase()
            ) {
              return verifiedUrl;
            }

            if (
              verifiedHost.includes(cleanInput) ||
              cleanInput.includes(verifiedHost)
            ) {
              return verifiedUrl;
            }
          } catch {
            // Skip invalid URL
          }
        }

        return sourceInput;
      };

      if (data.plan) {
        const unfurledSources: string[] = [];
        for (const src of rawPlanSources) {
          let resolved = resolvedUrls.get(src) || (await resolveGroundingUrl(src));
          resolved = resolveToFullVerifiedUrl(resolved, validUrlsRegistry);
          if (!resolved.includes('vertexaisearch.cloud.google.com')) {
            unfurledSources.push(resolved);
          }
        }

        if (unfurledSources.length === 0 && validUrlsRegistry.length > 0) {
          const cleanRegistry = validUrlsRegistry.filter(
            (u) => !u.includes('vertexaisearch.cloud.google.com')
          );
          unfurledSources.push(...cleanRegistry);
        }

        data.plan.sources = [...new Set(unfurledSources)];
      }

      if (
        data.plan &&
        Array.isArray(data.plan.sources) &&
        data.plan.sources.length > 0
      ) {
        const resolvedSources = data.plan.sources as string[];

        const replaceCiteFallback = (text: string) => {
          if (typeof text !== 'string') return text;
          const citeRegex = /\[cite:\s*([^\]]+)\]/gi;
          return text.replace(citeRegex, (match, citeVal) => {
            const firstPart = citeVal.split(/[.,\s]/)[0];
            const sourceIndex = parseInt(firstPart, 10) - 1;
            if (sourceIndex >= 0 && sourceIndex < resolvedSources.length) {
              return `[${citeVal}](${resolvedSources[sourceIndex]})`;
            }

            const cleanCite = citeVal.trim().toLowerCase();
            const foundIdx = resolvedSources.findIndex((url: string) => {
              try {
                return new URL(url).hostname
                  .replace('www.', '')
                  .toLowerCase()
                  .includes(cleanCite);
              } catch {
                return false;
              }
            });
            if (foundIdx !== -1) {
              return `[${citeVal}](${resolvedSources[foundIdx]})`;
            }

            return match;
          });
        };

        if (typeof data.reply === 'string') {
          data.reply = replaceCiteFallback(data.reply);
        }
        if (data.plan && typeof data.plan.draft === 'string') {
          data.plan.draft = replaceCiteFallback(data.plan.draft);
        }
      }

      let dbSessionId = req.auth?.userId
        ? recoveredSessionId ?? sessionId
        : undefined;
      if (req.auth && req.auth.userId) {
        if (!dbSessionId || dbSessionId === 'new') {
          const firstMsg =
            recommendation.slice(0, 40).trim() || 'Blueprint Recommendation';
          const title = firstMsg.length >= 40 ? `${firstMsg}...` : firstMsg;

          const newSession = await prisma.chatSession.create({
            data: {
              userId: req.auth.userId,
              organizationId: internalOrgId,
              title,
            },
          });
          dbSessionId = newSession.id;
          await prisma.strategistPlanRequest.update({
            where: { id: requestId },
            data: { sessionId: dbSessionId },
          });
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
          let displayContent = data.reply || '';
          if (data.plan) {
            const plan = data.plan;
            displayContent += `\n\n### **Blueprint Preview**\n`;
            displayContent += `* **Angle**: ${plan.angle || 'N/A'}\n`;
            displayContent += `* **Audience**: ${plan.audience || 'N/A'}\n`;
            if (plan.hook) {
              displayContent += `* **Hook**: ${plan.hook}\n`;
            }
            if (plan.outline) {
              displayContent += `\n**Outline Overview**:\n${plan.outline}\n`;
            }
            if (plan.draft) {
              displayContent += `\n**Generated Article Draft**:\n${plan.draft}\n`;
            }
          }

          const formattedSources =
            data.plan && Array.isArray(data.plan.sources)
              ? data.plan.sources.map((s: string) => {
                  try {
                    return {
                      url: s,
                      domain: new URL(s).hostname.replace('www.', ''),
                    };
                  } catch {
                    return { url: s, domain: 'Source' };
                  }
                })
              : undefined;

          const sanitizedData = sanitizeGroundingLeaks(data);
          const responsePayload = {
            ...sanitizedData,
            sessionId: dbSessionId,
          };

          await prisma.$transaction([
            prisma.chatMessage.create({
              data: {
                sessionId: dbSessionId,
                role: 'user',
                type: 'text',
                content: recommendation,
              },
            }),
            prisma.chatMessage.create({
              data: {
                sessionId: dbSessionId,
                role: 'assistant',
                type: 'text',
                content: displayContent,
                payload:
                  formattedSources && formattedSources.length > 0
                    ? { sources: formattedSources }
                    : undefined,
              },
            }),
            prisma.strategistPlanRequest.update({
              where: { id: requestId },
              data: {
                sessionId: dbSessionId,
                status: 'completed',
                response: responsePayload as unknown as Prisma.InputJsonValue,
                error: null,
              },
            }),
          ]);
          planRequestCompleted = true;

          return res.json(responsePayload);
        }
      }

      const sanitizedData = sanitizeGroundingLeaks(data);
      res.json({
        ...sanitizedData,
        sessionId: dbSessionId === 'new' ? null : dbSessionId,
      });
    } catch (error) {
      if (
        planRequestClaimed &&
        !planRequestCompleted &&
        claimedRequestId
      ) {
        await prisma.strategistPlanRequest
          .updateMany({
            where: {
              id: claimedRequestId,
              userId: req.auth?.userId,
              organizationId: claimedOrganizationId,
              status: 'pending',
            },
            data: {
              status: 'failed',
              error:
                error instanceof Error
                  ? error.message.slice(0, 500)
                  : 'Blueprint generation failed',
            },
          })
          .catch((requestError) => {
            console.error(
              '[STRATEGIST_PLAN_REQUEST_ERROR] Failed to mark request as failed:',
              requestError
            );
          });
      }
      if (requestAbort.signal.aborted) return;
      console.error('Error in generate-plan:', error);
      res.status(500).json({ error: 'Failed to generate plan' });
    } finally {
      requestAbort.dispose();
    }
  }
);

export default router;
