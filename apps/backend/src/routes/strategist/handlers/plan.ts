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
  isGeminiGroundingDisabledForTests,
  isRetryableGeminiFlexError,
  withGeminiFlexRetry,
} from '@/lib/ai/gemini-request-policy';

const router = Router();

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
    try {
      const parsedInput = GeneratePlanSchema.safeParse(req.body);
      if (!parsedInput.success) {
        return res.status(400).json({
          error: 'Invalid plan request',
          issues: parsedInput.error.issues,
        });
      }
      const { recommendation, history, sessionId } = parsedInput.data;

      if (req.auth?.userId && sessionId && sessionId !== 'new') {
        const ownedSession = await prisma.chatSession.findFirst({
          where: { id: sessionId, userId: req.auth.userId },
          select: { id: true },
        });
        if (!ownedSession) {
          return res.status(404).json({ error: 'Chat session not found' });
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
          const internalOrgId = await resolveInternalOrgId(
            req.auth.orgId,
            req.auth.userId
          );
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
            model: MODEL,
            input: prompt,
            system_instruction: new StrategistBlueprintComposer(
              profile?.config
            ).compose('xml'),
            tools: isGeminiGroundingDisabledForTests()
              ? undefined
              : [{ type: 'google_search' }],
            response_format: {
              type: 'text',
              mime_type: 'application/json',
              schema: strategistPlanSchema,
            },
            ...getGeminiInteractionConfig(),
          }, getGeminiInteractionRequestOptions())
        );
      } catch (apiError) {
        // Removing the schema cannot repair exhausted Flex capacity.
        if (isRetryableGeminiFlexError(apiError)) throw apiError;
        console.warn(
          '[STRATEGIST] Structured Output API call failed. Retrying without schema constraint:',
          apiError
        );
        interaction = await withGeminiFlexRetry(() =>
          gemini.interactions.create({
            model: MODEL,
            input: prompt,
            system_instruction: new StrategistBlueprintComposer(
              profile?.config
            ).compose('xml'),
            tools: isGeminiGroundingDisabledForTests()
              ? undefined
              : [{ type: 'google_search' }],
            ...getGeminiInteractionConfig(),
          }, getGeminiInteractionRequestOptions())
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

      let dbSessionId = req.auth?.userId ? sessionId : undefined;
      if (req.auth && req.auth.userId) {
        if (!dbSessionId || dbSessionId === 'new') {
          const firstMsg =
            recommendation.slice(0, 40).trim() || 'Blueprint Recommendation';
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
            console.error(
              '[CHAT_DB_ERROR] Failed to create chat session in generate-plan:',
              dbErr
            );
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
                content: recommendation,
              },
            });

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

            await prisma.chatMessage.create({
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
            });
          } catch (dbErr) {
            console.error(
              '[CHAT_DB_ERROR] Failed to save generate-plan messages:',
              dbErr
            );
          }
        }
      }

      const sanitizedData = sanitizeGroundingLeaks(data);
      res.json({
        ...sanitizedData,
        sessionId: dbSessionId === 'new' ? null : dbSessionId,
      });
    } catch (error) {
      console.error('Error in generate-plan:', error);
      res.status(500).json({ error: 'Failed to generate plan' });
    }
  }
);

export default router;
