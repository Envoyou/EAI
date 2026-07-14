import { Router, Request, Response, NextFunction } from 'express';
import { gemini, getNativeGeminiConfig } from '@/lib/ai/provider-runtime';
import { composeWorkspaceContext } from '@/lib/ai/workspace-context';
import { getWorkspaceState } from '@/lib/user-workspace';
import { resolveEditorialProfileForUser } from '@/lib/editorial-profile-server';
import { ENVOYOU_EDITORIAL_PROFILE } from '@eai/shared/server';
import { StrategistChatComposer } from '@/lib/ai/prompt-engine/composer/strategist-chat-composer';
import { StrategistBlueprintComposer } from '@/lib/ai/prompt-engine/composer/strategist-blueprint-composer';
import { DraftFromNotesComposer } from '@/lib/ai/prompt-engine/composer/draft-from-notes-composer';
import { StrategistFastModeInstructionNode } from '@/lib/ai/prompt-engine/core/strategist';
import { parseJsonResponse } from '@eai/shared';
import { verifyToken } from '@clerk/backend';
import { checkCreditsRemaining, deductCredits } from '@/lib/chat-billing';
import { prisma } from '@/lib/db';
import { requireAuth } from '../../middleware/auth';

async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}): Promise<globalThis.Response> {
  const { timeout = 3000, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Resolve the internal Prisma Organization UUID for billing purposes.
 *
 * Strategy:
 *  1. If the Clerk JWT includes `org_id`, resolve it via clerkOrganizationId → UUID.
 *  2. Otherwise fall back to the `organizationId` stored on the User row.
 *     (Clerk only embeds org_id in the JWT when the user has an active org session;
 *      subscriptions and credits are always stored against the org UUID, never userId.)
 */
async function resolveInternalOrgId(
  clerkOrgId: string | null | undefined,
  userId: string
): Promise<string | null> {
  // 1. JWT org_id present — resolve to internal UUID
  if (clerkOrgId) {
    const org = await prisma.organization.findUnique({
      where: { clerkOrganizationId: clerkOrgId },
      select: { id: true },
    });
    if (org) return org.id;
  }

  // 2. Fallback: look up the org the user belongs to in the DB
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });
  return user?.organizationId ?? null;
}

/**
 * Scrapes and cleans text content from a public URL.
 * Uses Jina Reader API (https://r.jina.ai) as the primary engine to parse CSR (Client-Side Rendered)
 * and SSR sites into clean markdown. Falls back to a local basic HTML tag parser if Jina fails.
 */
async function scrapeUrlContent(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 6000); // 6-second timeout
    
    // 1. Try Jina Reader API (free, returns clean markdown for modern JS/CSR sites)
    const jinaUrl = `https://r.jina.ai/${url}`;
    const jinaRes = await fetch(jinaUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/plain',
      },
    });
    clearTimeout(id);

    if (jinaRes.ok) {
      const text = await jinaRes.text();
      if (text && text.trim().length > 50) {
        console.log(`[SCRAPER] Successfully scraped via Jina Reader: ${url} (${text.length} chars)`);
        return text.slice(0, 15000);
      }
    }
  } catch (jinaErr) {
    console.warn('[SCRAPER] Jina Reader failed, falling back to basic fetch:', jinaErr);
  }

  // 2. Fallback: Direct basic fetch & clean HTML regex parser
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
      },
    });
    clearTimeout(id);

    if (!res.ok) return '';
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return '';
    }

    const html = await res.text();
    const clean = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    // Matches paragraph and heading tags, tolerating spaces/attributes
    const tagRegex = /<(p|h1|h2|h3|h4|h5|h6)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    const matches: string[] = [];
    let match;

    while ((match = tagRegex.exec(clean)) !== null) {
      const tag = match[1].toLowerCase();
      let content = match[2]
        .replace(/<[^>]+>/g, '')
        .trim();

      content = content
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&rsquo;/g, "'")
        .replace(/&ldquo;/g, '"')
        .replace(/&rdquo;/g, '"')
        .replace(/\s+/g, ' ');

      if (content.length > 10) {
        if (tag.startsWith('h')) {
          matches.push(`\n## ${content}\n`);
        } else {
          matches.push(content);
        }
      }
    }

    const basicText = matches.join('\n');
    console.log(`[SCRAPER] Successfully scraped via basic parser fallback: ${url} (${basicText.length} chars)`);
    return basicText.slice(0, 15000);
  } catch (error) {
    console.error(`[SCRAPER] Fallback scrape also failed for ${url}:`, error);
    return '';
  }
}

const router = Router();

interface RateLimitBucket {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitBucket>();

function rateLimiter(options: { windowMs: number; max: number; message: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const xffHeader = req.headers['x-forwarded-for'];
    const xff = Array.isArray(xffHeader) ? xffHeader[0] : xffHeader;
    const key = req.auth?.userId || req.ip || xff || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let bucket = rateLimitStore.get(key);
    
    if (!bucket || now > bucket.resetTime) {
      bucket = {
        count: 1,
        resetTime: now + options.windowMs,
      };
      rateLimitStore.set(key, bucket);
      return next();
    }
    
    if (bucket.count >= options.max) {
      return res.status(429).json({ error: options.message });
    }
    
    bucket.count++;
    next();
  };
}

async function softAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      if (token) {
        const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
        req.auth = {
          userId: payload.sub,
          orgId: (payload.org_id as string) || null,
          orgSlug: (payload.org_slug as string) || null,
          orgRole: (payload.org_role as string) || null,
        };
      }
    } catch (err) {
      console.warn('[Strategist Soft Auth] Token verification failed:', err);
    }
  }
  next();
}

function truncateAtParagraphBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const snippet = text.slice(0, maxChars);
  const lastParagraph = snippet.lastIndexOf('\n\n');
  if (lastParagraph > maxChars * 0.6) {
    return text.slice(0, lastParagraph) + '\n\n...[truncated for context]';
  }
  const lastLine = snippet.lastIndexOf('\n');
  if (lastLine > maxChars * 0.7) {
    return text.slice(0, lastLine) + '\n...[truncated for context]';
  }
  const lastWord = snippet.lastIndexOf(' ');
  if (lastWord > maxChars * 0.8) {
    return text.slice(0, lastWord) + '...[truncated for context]';
  }
  return snippet + '...[truncated for context]';
}

// Configure the model to use for the Content Strategist Wizard
const resolveModel = (modelName: string): string => {
  if (modelName.startsWith('gemini-2.') || modelName.startsWith('gemini-1.5') || modelName.startsWith('gemini-2.0')) {
    return 'gemini-3.5-flash';
  }
  return modelName;
};
const MODEL = resolveModel(process.env.GEMINI_COPILOT_MODEL || 'gemini-3.1-flash-lite');
const RESEARCH_MODEL = resolveModel(process.env.GEMINI_RESEARCH_MODEL || 'gemini-3.5-flash');

// Fast-mode output control: higher limit for structured research material
const FAST_MODE_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_COPILOT_FAST_MAX_TOKENS) || 2048;

// Base fast-mode instruction rendered from core node — version-controlled and testable.
const FAST_MODE_INSTRUCTION = new StrategistFastModeInstructionNode().render({ format: 'xml' });

// ─── URL / Document override helper constants ────────────────────────────────
// These are appended to FAST_MODE_INSTRUCTION at request-time based on context.
// Kept as functions/constants (not nodes) because they embed dynamic values (url).

const buildUrlOverrideWithContent = (url: string): string => `
<url_mode_override>
The system has fetched the URL content at ${url} and placed it inside <scraped_url_content>.
Prioritize analyzing this content. Length restrictions are relaxed and you are encouraged to write
a beautifully structured, comprehensive Markdown analysis.
Do NOT use web search unless additional external details are needed.
</url_mode_override>
`.trim();

const URL_OVERRIDE_NO_CONTENT = `
<url_mode_override>
The user provided a URL. Use the url_context tool to fetch and read that page directly.
If you cannot fetch it or the tool fails, politely ask the user to copy and paste the content manually.
</url_mode_override>
`.trim();

const DOCUMENT_MODE_OVERRIDE = `
<document_mode_override>
A file is attached to this request.
1. Scope of Analysis: Prioritize analyzing the data/text inside <attached_file> ONLY if the user's query is directly asking for performance audits, data summaries, or findings from the attached document. If the query shifts to researching facts, finding data for a new article, or planning/drafting, do NOT force analysis of the attached file.
2. Web Search & Fact Grounding: If the user asks for data, statistics, or research materials to write a new article, you MUST use Google Search to find real-world statistics, quantitative data, and expert sources. Do NOT reference internal blog performance metrics (views, clicks, impressions) from the attached file as factual content for the new article draft.
3. Quantified Claims: Ground all claims quantitatively by citing specific data points (exact numbers, titles, or values) from the attached file when auditing traffic, but do not append these metrics to article titles in outlines, lists, or blueprints.
4. Editorial Progression & Suggestions: Under the [SUGGESTIONS: ...] block, the 3 follow-up suggestions must guide the user dynamically based on the current discussion state:
   - If the user is analyzing the file: suggest further data audits or performance comparisons.
   - If the user has identified a solid topic: suggest generating the blueprint (e.g., "Generate Blueprint for [Topic Name]").
   - If the user is reviewing research materials: suggest next steps for drafting or outline refinement.
</document_mode_override>
`.trim();


/**
 * 1. Analyze Data (Import Stage)
 */
router.post('/analyze-data', async (req, res) => {
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
      input: inputPrompt + "\n\n<instructions>\nKeep your responses concise, insightful, and engaging.\n</instructions>",
      system_instruction: new StrategistChatComposer().compose('xml'),
    });

    res.json({ reply: interaction.output_text });
  } catch (error) {
    console.error('Error analyzing data:', error);
    res.status(500).json({ error: 'Failed to analyze data' });
  }
});

/**
 * 1.5 Dynamic Greet
 */
router.post('/greet', async (req, res) => {
  try {
    const chatSchema = {
      type: "object",
      properties: {
        reply: { type: "string" },
        suggestions: { type: "array", items: { type: "string" } }
      },
      required: ["reply", "suggestions"]
    };

    const interaction = await gemini.interactions.create({
      model: MODEL,
      input: "<task>\nGreet the user to EAI Research Strategist. Introduce yourself as a Thinking Partner. Be concise, friendly, and offer to analyze their blog data, research trends, or brainstorm content.\n</task>\n\n<instructions>\nAlways provide 3-4 dynamic, clickable suggestion options.\n</instructions>",
      system_instruction: new StrategistChatComposer().compose('xml'),
      response_format: { type: "text", mime_type: "application/json", schema: chatSchema }
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

/**
 * 2. Insight Conversation (Chat)
 */
router.post('/chat', softAuth, rateLimiter({ windowMs: 60000, max: 20, message: 'Too many requests. Please try again later.' }), async (req, res) => {
  let heartbeatInterval: NodeJS.Timeout | undefined;
  try {
    const { messages, mode, notesSummary, attachments, enableSearch, activeHistoryId, sessionId } = req.body;
    
    const isSearchEnabled = mode !== 'deep' && enableSearch !== false;
    const requiredCredits = mode === 'deep' ? 5 : (isSearchEnabled ? 1 : 0);

    if (requiredCredits > 0) {
      if (!req.auth || !req.auth.userId) {
        return res.status(403).json({
          code: 'AUTH_REQUIRED',
          error: 'Authentication Required',
          message: 'You must be signed in to use this premium feature.'
        });
      }

      // req.auth.orgId is a Clerk org ID ("org_xxx"), not the internal Prisma UUID.
      // We must resolve it to the internal org ID before billing lookups.
      // Falls back to User.organizationId when org_id is absent from the JWT.
      const internalOrgId = await resolveInternalOrgId(req.auth.orgId, req.auth.userId);

      const balance = await checkCreditsRemaining(req.auth.userId, internalOrgId);
      if (balance < requiredCredits) {
        return res.status(403).json({
          code: 'INSUFFICIENT_CREDITS',
          error: 'Insufficient Credits',
          message: 'You have run out of credits. Please refill your balance or upgrade your plan to continue using this feature.'
        });
      }

      // Store resolved org ID on the request for downstream billing use.
      (req as Request & { resolvedOrgId?: string | null }).resolvedOrgId = internalOrgId;
    }

    const chatInput = messages[messages.length - 1].content;

    // Resolve brand editorial profile for tenant context
    let profile = null;
    if (req.auth && req.auth.userId) {
      try {
        const internalOrgId = await resolveInternalOrgId(req.auth.orgId, req.auth.userId);
        profile = await resolveEditorialProfileForUser(req.auth.userId, internalOrgId);
      } catch (err) {
        console.warn('[CHAT_WARNING] Failed to resolve brand profile:', err);
      }
    }

    // Resilient Session & Message Creation for Authenticated Users
    let dbSessionId = sessionId;
    if (req.auth && req.auth.userId) {
      if (!dbSessionId || dbSessionId === 'new') {
        const firstMsg = chatInput.slice(0, 40).trim() || 'Percakapan Baru';
        const title = firstMsg.length >= 40 ? `${firstMsg}...` : firstMsg;
        const internalOrgId = await resolveInternalOrgId(req.auth.orgId, req.auth.userId);

        try {
          const newSession = await prisma.chatSession.create({
            data: {
              userId: req.auth.userId,
              organizationId: internalOrgId,
              title,
            }
          });
          dbSessionId = newSession.id;
        } catch (dbErr) {
          console.error('[CHAT_DB_ERROR] Failed to create chat session:', dbErr);
        }
      } else {
        try {
          await prisma.chatSession.update({
            where: { id: dbSessionId },
            data: { updatedAt: new Date() }
          });
        } catch (dbErr) {
          console.warn('[CHAT_DB_WARNING] Failed to touch session updated date:', dbErr);
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
            }
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
      console.log('[chat] Client closed connection.');
    });

    heartbeatInterval = setInterval(() => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`);
      }
    }, 5000);

    // Send the initialized/resolved session ID immediately to the frontend
    if (dbSessionId) {
      res.write(`data: ${JSON.stringify({ type: "session_init", sessionId: dbSessionId })}\n\n`);
    }

    // Detect if the user's message contains a URL and scrape it server-side
    const URL_REGEX = /https?:\/\/[^\s"'<>]+/i;
    const urlMatch = chatInput.match(URL_REGEX);
    let scrapedContent = '';
    let urlToScrape = '';
    if (urlMatch) {
      urlToScrape = urlMatch[0];
      scrapedContent = await scrapeUrlContent(urlToScrape);
    }

    // Truncate history to last 6 messages to prevent context bloat.
    // Long assistant research outputs are further capped to avoid token spikes.
    const CHAT_HISTORY_WINDOW = 6;
    const ASSISTANT_MSG_MAX_CHARS = 1500;
    const rawHistory = messages.slice(0, -1);
    const windowedHistory = rawHistory.length > CHAT_HISTORY_WINDOW
      ? rawHistory.slice(-CHAT_HISTORY_WINDOW)
      : rawHistory;

    const history = windowedHistory.map((m: { role: string, content: string }) => {
      const text = m.role === 'assistant'
        ? truncateAtParagraphBoundary(m.content, ASSISTANT_MSG_MAX_CHARS)
        : m.content;
      return { role: m.role, content: [{ type: 'text', text }] };
    });

    const timezone = 'Asia/Jakarta';
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const currentYear = parts.find((part) => part.type === 'year')?.value || new Date().getFullYear().toString();
    const month = parts.find((part) => part.type === 'month')?.value || '01';
    const day = parts.find((part) => part.type === 'day')?.value || '01';
    const currentDate = `${currentYear}-${month}-${day}`;

    const { xml: workspaceXml, agentInstruction } = composeWorkspaceContext({
      today: currentDate,
      timezone,
      profileConfig: profile?.config ?? null,
      notesSummary,
      attachment: (attachments && Array.isArray(attachments) && attachments[0]?.extractedText) ? {
        filename: attachments[0].filename,
        contentType: attachments[0].contentType,
        content: attachments[0].extractedText,
      } : null,
      scrapedUrl: scrapedContent ? {
        url: urlToScrape,
        content: scrapedContent,
      } : null,
      history: history.map((m: { role: string, content: { text: string }[] }) => ({
        role: m.role,
        text: m.content[0].text
      }))
    });

    const contextPrompt = `${workspaceXml}\n\n<task>\nuser: ${chatInput}\nassistant:\n</task>`;

    if (mode === 'deep') {
      const resolvedOrgId = (req as Request & { resolvedOrgId?: string | null }).resolvedOrgId ?? null;
      await deductCredits(
        req.auth!.userId,
        resolvedOrgId,
        requiredCredits,
        'deep_research',
        `Deep Research session started (Query: ${chatInput.slice(0, 60)})`,
        activeHistoryId || undefined
      );

      // Place static instructions first for prompt prefix caching optimization
      const deepModeInput = `<instructions>\nCRITICAL INSTRUCTION: YOU ARE IN DEEP RESEARCH MODE. Use Google Search thoroughly to gather facts, synthesize a comprehensive report, and ensure all claims are backed by credible sources.\n</instructions>\n\n${agentInstruction}\n\n=== DYNAMIC CONTEXT & HISTORY ===\n${contextPrompt}`;

      const interaction = await gemini.interactions.create({
        model: RESEARCH_MODEL,
        input: deepModeInput,
        system_instruction: new StrategistChatComposer(profile?.config).compose('xml'),
        tools: [{ type: "google_search" }],
        background: true
      });
      
      console.log(`[BILLING] Deep Research started. Interaction ID: ${interaction.id}. Token usage will be billed upon completion.`);

      res.write(`data: ${JSON.stringify({ type: "deep_research_started", interaction_id: interaction.id })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
      return;
    }

    // FAST MODE — build input from node + agent instruction + dynamic overrides
    let finalFastModeInstruction = `${FAST_MODE_INSTRUCTION}\n\n${agentInstruction}`;
    const hasAttachments = attachments && Array.isArray(attachments) && attachments.length > 0;

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

    // Build tools list: google_search if enabled, url_context if message has a URL
    const fastTools: ({ type: 'google_search' } | { type: 'url_context' })[] = [];
    if (isSearchEnabled) fastTools.push({ type: 'google_search' });
    if (hasUrlInMessage) fastTools.push({ type: 'url_context' });

    // Place static instructions first for prompt prefix caching optimization
    const cacheFriendlyInput = `${finalFastModeInstruction}\n\n=== DYNAMIC CONTEXT & HISTORY ===\n${contextPrompt}`;

    const stream = await gemini.interactions.create({
      model: MODEL,
      input: cacheFriendlyInput,
      tools: fastTools.length > 0 ? fastTools : undefined,
      system_instruction: new StrategistChatComposer(profile?.config).compose('xml'),
      stream: true,
      generation_config: {
        max_output_tokens: FAST_MODE_MAX_OUTPUT_TOKENS,
        ...getNativeGeminiConfig(),
      },
    });

    let finalOutputText = "";
    const sources: string[] = [];
    const globalAnnotations: { type?: string; url?: string; title?: string; start_index?: number; end_index?: number }[] = [];

    for await (const event of stream) {
        if (isDisconnected) {
            console.log('[chat] Aborting stream loop due to client disconnect.');
            break;
        }
        if (event.event_type === "step.start") {
            if (event.step?.type === "google_search_call") {
                const queries = (event.step as { arguments?: { queries?: string[] } }).arguments?.queries;
                if (queries && queries.length > 0) {
                    res.write(`data: ${JSON.stringify({ type: "status", message: `Searching: "${queries[0]}"...` })}\n\n`);
                } else {
                    res.write(`data: ${JSON.stringify({ type: "status", message: "Searching the internet for real-time data..." })}\n\n`);
                }
            } else if (event.step?.type === "code_execution_call") {
                res.write(`data: ${JSON.stringify({ type: "status", message: "Executing data analysis script..." })}\n\n`);
            } else if (event.step?.type === "url_context_result" || event.step?.type === "url_context_call") {
                res.write(`data: ${JSON.stringify({ type: "status", message: "Retrieving content from provided URL..." })}\n\n`);
            }
        } else if (event.event_type === "step.delta") {
            if (event.delta?.type === "text" && event.delta.text) {
                // Gemini 3.x native thinking flows as separate `thought_summary` deltas, not
                // inline <thinking> tags. Simply forward text deltas directly.
                finalOutputText += event.delta.text;
                res.write(`data: ${JSON.stringify({ type: "text", chunk: event.delta.text })}\n\n`);
            } else if (event.delta?.type === "thought_summary" && (event.delta as { text?: string }).text) {
                // Forward native thinking summaries to the client for UI "Thinking..." indicators.
                // The frontend decides whether to display or discard this stream.
                res.write(`data: ${JSON.stringify({ type: "thinking", chunk: (event.delta as { text: string }).text })}\n\n`);
            } else if (event.delta?.type === "text_annotation_delta" && event.delta.annotations) {
                globalAnnotations.push(...event.delta.annotations);
            }
        } else if (event.event_type === "interaction.completed") {
            // [ENVOYOU BILLING] Token Tracker Implementation
            const eventWithInteraction = event as { interaction?: { usage?: { total_input_tokens?: number; total_output_tokens?: number; total_tokens?: number } } };
            const usage = eventWithInteraction.interaction?.usage;
            if (usage) {
                console.log("\n[ENVOYOU INTERNAL BILLING] Fast Mode Execution Complete:");
                console.log(`- Input Tokens: ${usage.total_input_tokens || 0}`);
                console.log(`- Output Tokens: ${usage.total_output_tokens || 0}`);
                console.log(`- Total Tokens Billed: ${usage.total_tokens || 0}`);
            }

            if (requiredCredits > 0 && req.auth?.userId) {
                try {
                    const resolvedOrgId = (req as Request & { resolvedOrgId?: string | null }).resolvedOrgId ?? null;
                    await deductCredits(
                        req.auth.userId,
                        resolvedOrgId,
                        requiredCredits,
                        'copilot_chat',
                        `Fast Chat with Search (Query: ${chatInput.slice(0, 60)})`,
                        activeHistoryId || undefined
                    );
                } catch (billErr) {
                    console.error('[CHAT_BILLING_ERROR] Failed to deduct credits:', billErr);
                }
            }

            // Map to keep track of unique URLs and their footnote index
            const urlToIndex = new Map<string, number>();
            const uniqueSourcesData: { url: string; domain: string }[] = [];
            
            // Unfurl Google Vertex AI Grounding redirect URLs
            const resolvedUrls = new Map<string, string>();
            const urlsToResolve = [...new Set(globalAnnotations.map(a => a.url).filter(Boolean))] as string[];
            
            await Promise.all(urlsToResolve.map(async (u) => {
                if (u.includes('vertexaisearch.cloud.google.com/grounding-api-redirect')) {
                    try {
                        const res = await fetchWithTimeout(u, { method: 'HEAD', redirect: 'manual', timeout: 3000 });
                        const loc = res.headers.get('location');
                        resolvedUrls.set(u, loc || u);
                    } catch (_e) {
                        resolvedUrls.set(u, u);
                    }
                } else {
                    resolvedUrls.set(u, u);
                }
            }));
            
            // Pre-populate unique sources from globalAnnotations directly
            for (const annotation of globalAnnotations) {
                if (annotation.type === "url_citation" && annotation.url) {
                    const realUrl = resolvedUrls.get(annotation.url) || annotation.url;
                    if (!urlToIndex.has(realUrl)) {
                        urlToIndex.set(realUrl, urlToIndex.size + 1);
                        let domain = annotation.title;
                        if (!domain || domain.trim() === "") {
                            try {
                                domain = new URL(realUrl).hostname.replace('www.', '');
                            } catch (_e) { domain = "Source"; }
                        }
                        const cleanDomain = domain.replace(/[[\]()*_`]/g, '').trim();
                        uniqueSourcesData.push({ url: realUrl, domain: cleanDomain });
                    }
                }
            }
            
            // Replace [cite: X] placeholders directly in their original order using globalAnnotations
            let annotationIndex = 0;
            const citeRegex = /\[cite:\s*[^\]]+\]/gi;
            
            const finalOutputTextProcessed = finalOutputText.replace(citeRegex, (_match) => {
                if (annotationIndex < globalAnnotations.length) {
                    const annotation = globalAnnotations[annotationIndex++];
                    if (annotation.type === "url_citation" && annotation.url) {
                        const realUrl = resolvedUrls.get(annotation.url) || annotation.url;
                        sources.push(realUrl);
                        const sourceIndex = urlToIndex.get(realUrl) || 1;
                        return `[${sourceIndex}](${realUrl})`;
                    }
                }
                // Strip the placeholder if we run out of annotations or it's not a URL citation
                return "";
            });
            
            // Clean up any trailing unmatched brackets and trim
            const outputToSend = finalOutputTextProcessed
                .replace(/\s*\[\s*$/g, '')
                .trim();
            
            if (outputToSend) {
                res.write(`data: ${JSON.stringify({ type: "replace_text", text: outputToSend })}\n\n`);
            }
            if (uniqueSourcesData.length > 0) {
                res.write(`data: ${JSON.stringify({ type: "sources", sources: uniqueSourcesData })}\n\n`);
            }
            res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);

            // Resilient DB write for the Assistant response
            if (dbSessionId && outputToSend) {
                try {
                    await prisma.chatMessage.create({
                        data: {
                            sessionId: dbSessionId,
                            role: 'assistant',
                            type: 'text',
                            content: outputToSend,
                            payload: uniqueSourcesData.length > 0 ? { sources: uniqueSourcesData } : undefined
                        }
                    });
                } catch (dbErr) {
                    console.error('[CHAT_DB_ERROR] Failed to save assistant message:', dbErr);
                }
            }
        }
    }

    res.end();
  } catch (error) {
    console.error('Error in chat stream:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to chat' });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: "Stream failed" })}\n\n`);
      res.end();
    }
  } finally {
    clearInterval(heartbeatInterval);
  }
});

/**
 * 3. Deep Research Status Polling
 */
router.get('/chat/status/:id', async (req, res) => {
  try {
    const interactionId = req.params.id;
    const interaction = await gemini.interactions.get(interactionId);
    
    res.json({
      state: interaction.status ? interaction.status.toUpperCase() : 'UNKNOWN',
      output: (interaction as { output_text?: string }).output_text || ''
    });
  } catch (error) {
    console.error('Error getting interaction status:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

/**
 * 4. Generate Pre-Editor Plan
 */
router.post('/generate-plan', softAuth, rateLimiter({ windowMs: 60000, max: 10, message: 'Too many requests. Please try again later.' }), async (req, res) => {
  try {
    const { recommendation, history, sessionId } = req.body;

    let chatHistory = "";
    if (history && Array.isArray(history)) {
      // Pertimbangkan untuk menambah limit ini jika sesi brainstorming biasanya panjang
      const HISTORY_WINDOW = 12; 
      const trimmed = history.length > HISTORY_WINDOW
        ? history.slice(-HISTORY_WINDOW)
        : history;
      const truncationNote = history.length > HISTORY_WINDOW
        ? `[Note: showing last ${HISTORY_WINDOW} of ${history.length} messages]\n`
        : '';
      chatHistory = truncationNote + trimmed
        .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
        .join('\n');
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
        const internalOrgId = await resolveInternalOrgId(req.auth.orgId, req.auth.userId);
        profile = await resolveEditorialProfileForUser(req.auth.userId, internalOrgId);
      } catch (err) {
        console.warn('[GENERATE_PLAN_WARNING] Failed to resolve brand profile:', err);
      }
    }

    // Schema definition for Structured Outputs
    const strategistPlanSchema = {
      type: "object",
      properties: {
        reply: {
          type: "string",
          description: "A friendly opening message to start a discussion or summarize the plan."
        },
        suggestions: {
          type: "array",
          items: { type: "string" },
          description: "Exactly three action-oriented suggestions."
        },
        plan: {
          type: "object",
          properties: {
            angle: { type: "string", description: "The unique angle or perspective of the article." },
            audience: { type: "string", description: "The target audience." },
            hook: { type: "string", description: "A compelling hook for the introduction." },
            outline: { type: "string", description: "A detailed markdown outline." },
            seoIntent: { type: "string", description: "The primary search intent target." },
            sources: {
              type: "array",
              items: { type: "string" },
              description: "Verified domains or full URLs to cite."
            },
            draft: {
              type: "string",
              description: "Cohesive 400-600 word draft synthesizing the outline and sources."
            }
          },
          required: ["angle", "audience", "hook", "outline", "seoIntent", "sources", "draft"]
        }
      },
      required: ["reply", "suggestions", "plan"]
    };

    let interaction;
    try {
      interaction = await gemini.interactions.create({
        model: MODEL,
        input: prompt,
        system_instruction: new StrategistBlueprintComposer(profile?.config).compose('xml'),
        tools: [{ type: "google_search" }],
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: strategistPlanSchema
        }
      });
    } catch (apiError) {
      console.warn('[STRATEGIST] Structured Output API call failed. Retrying without schema constraint:', apiError);
      // Fallback: retry without strict response_format in case of schema validation refusal
      interaction = await gemini.interactions.create({
        model: MODEL,
        input: prompt,
        system_instruction: new StrategistBlueprintComposer(profile?.config).compose('xml'),
        tools: [{ type: "google_search" }]
      });
    }
    
    if (!interaction.output_text) {
        throw new Error("No output from model");
    }

    const defaultPlan = {
      angle: "custom output",
      audience: "audience",
      hook: "hook",
      outline: "outline",
      seoIntent: "seoIntent",
      sources: [] as string[],
      draft: ""
    };
    const defaultSuggestions = ["Proceed to Editor", "Save to Notes", "Revise Blueprint"];

    let data: {
      reply?: string;
      suggestions?: string[];
      plan?: {
        angle?: string;
        audience?: string;
        hook?: string;
        outline?: string;
        seoIntent?: string;
        sources?: string[];
        draft?: string;
      };
    } = {};

    try {
      const parsed = parseJsonResponse(interaction.output_text) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        const planObj = (parsed.plan || {}) as Record<string, unknown>;
        data = {
          reply: typeof parsed.reply === 'string' ? parsed.reply : "Here is the draft.",
          suggestions: Array.isArray(parsed.suggestions) ? (parsed.suggestions as string[]) : defaultSuggestions,
          plan: {
            angle: typeof planObj.angle === 'string' ? planObj.angle : defaultPlan.angle,
            audience: typeof planObj.audience === 'string' ? planObj.audience : defaultPlan.audience,
            hook: typeof planObj.hook === 'string' ? planObj.hook : defaultPlan.hook,
            outline: typeof planObj.outline === 'string' ? planObj.outline : defaultPlan.outline,
            seoIntent: typeof planObj.seoIntent === 'string' ? planObj.seoIntent : defaultPlan.seoIntent,
            sources: Array.isArray(planObj.sources) ? (planObj.sources as string[]) : defaultPlan.sources,
            draft: typeof planObj.draft === 'string' ? planObj.draft : (typeof parsed.reply === 'string' ? parsed.reply : interaction.output_text)
          }
        };
      } else {
        throw new Error("Parsed output is not an object");
      }
    } catch (parseError) {
      console.warn('[STRATEGIST] Structured parse failed, wrapping raw output:', parseError);
      // Fallback: If AI fails to generate valid JSON, wrap raw text in the expected structure so the frontend doesn't crash
      data = {
        reply: "The system received unstructured output from the AI. Here is the raw output.",
        suggestions: defaultSuggestions,
        plan: {
          ...defaultPlan,
          draft: interaction.output_text
        }
      };
    }
    
    interface GroundingAnnotation {
      type: string;
      url: string;
      title?: string;
    }

    // Option B: Extract actual, verified grounding URLs from the interaction steps metadata in order of appearance
    const extractedAnnotations: GroundingAnnotation[] = [];
    if (interaction.steps && Array.isArray(interaction.steps)) {
      const modelOutputStep = interaction.steps.find(s => s.type === 'model_output');
      if (modelOutputStep && Array.isArray(modelOutputStep.content)) {
        for (const c of modelOutputStep.content) {
          const cObj = c as Record<string, unknown>;
          if (cObj && Array.isArray(cObj.annotations)) {
            for (const annotation of cObj.annotations as Record<string, unknown>[]) {
              if (annotation && annotation.type === 'url_citation' && typeof annotation.url === 'string') {
                extractedAnnotations.push({
                  type: annotation.type,
                  url: annotation.url,
                  title: typeof annotation.title === 'string' ? annotation.title : undefined,
                });
              }
            }
          }
        }
      }
    }

    const resolvedUrls = new Map<string, string>();
    const uniqueUrlsToResolve = [...new Set(extractedAnnotations.map(a => a.url).filter(Boolean))] as string[];
    
    // Resolve any Google Vertex AI Search grounding redirect URLs
    for (const u of uniqueUrlsToResolve) {
      if (u.includes('vertexaisearch.cloud.google.com/grounding-api-redirect')) {
        try {
          const res = await fetchWithTimeout(u, { method: 'HEAD', redirect: 'manual', timeout: 3000 });
          const loc = res.headers.get('location');
          resolvedUrls.set(u, loc || u);
        } catch (_e) {
          resolvedUrls.set(u, u);
        }
      } else {
        resolvedUrls.set(u, u);
      }
    }

    const uniqueSourcesList: string[] = [];
    const urlToIndex = new Map<string, number>();
    for (const annotation of extractedAnnotations) {
      if (annotation.url) {
        const realUrl = resolvedUrls.get(annotation.url) || annotation.url;
        if (!urlToIndex.has(realUrl)) {
          uniqueSourcesList.push(realUrl);
          urlToIndex.set(realUrl, uniqueSourcesList.length);
        }
      }
    }

    if (uniqueSourcesList.length > 0) {
      if (data.plan) {
        data.plan.sources = uniqueSourcesList;
      }
      
      let annotationIndex = 0;
      const replaceCiteSequential = (text: string) => {
        if (typeof text !== 'string') return text;
        const citeRegex = /\[cite:\s*[^\]]+\]/gi;
        return text.replace(citeRegex, (match) => {
          if (annotationIndex < extractedAnnotations.length) {
            const annotation = extractedAnnotations[annotationIndex++];
            if (annotation.url) {
              const realUrl = resolvedUrls.get(annotation.url) || annotation.url;
              const sourceIndex = urlToIndex.get(realUrl) || 1;
              return `[${sourceIndex}](${realUrl})`;
            }
          }
          return match;
        });
      };

      if (typeof data.reply === 'string') {
        data.reply = replaceCiteSequential(data.reply);
      }
      if (data.plan && typeof data.plan.draft === 'string') {
        data.plan.draft = replaceCiteSequential(data.plan.draft);
      }
    } else {
      // Fallback: Resolve and replace using the model-generated sources if any
      if (data.plan && Array.isArray(data.plan.sources)) {
        const resolvedSources: string[] = [];
        for (const u of data.plan.sources) {
          if (typeof u === 'string' && u.includes('vertexaisearch.cloud.google.com/grounding-api-redirect')) {
            try {
              const res = await fetchWithTimeout(u, { method: 'HEAD', redirect: 'manual', timeout: 3000 });
              const loc = res.headers.get('location');
              resolvedSources.push(loc || u);
            } catch (_e) {
              resolvedSources.push(u);
            }
          } else {
            resolvedSources.push(u);
          }
        }
        data.plan.sources = resolvedSources;

        const replaceCiteFallback = (text: string) => {
          if (typeof text !== 'string') return text;
          const citeRegex = /\[cite:\s*([^\]]+)\]/gi;
          return text.replace(citeRegex, (match, citeVal) => {
            const firstPart = citeVal.split(/[.,\s]/)[0];
            const sourceIndex = parseInt(firstPart, 10) - 1;
            if (sourceIndex >= 0 && sourceIndex < resolvedSources.length) {
              return `[${citeVal}](${resolvedSources[sourceIndex]})`;
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
    }

    // Save to database if authenticated
    let dbSessionId = sessionId;
    if (req.auth && req.auth.userId) {
      if (!dbSessionId || dbSessionId === 'new') {
        const firstMsg = recommendation.slice(0, 40).trim() || 'Blueprint Recommendation';
        const title = firstMsg.length >= 40 ? `${firstMsg}...` : firstMsg;
        const internalOrgId = await resolveInternalOrgId(req.auth.orgId, req.auth.userId);

        try {
          const newSession = await prisma.chatSession.create({
            data: {
              userId: req.auth.userId,
              organizationId: internalOrgId,
              title,
            }
          });
          dbSessionId = newSession.id;
        } catch (dbErr) {
          console.error('[CHAT_DB_ERROR] Failed to create chat session in generate-plan:', dbErr);
        }
      } else {
        try {
          await prisma.chatSession.update({
            where: { id: dbSessionId },
            data: { updatedAt: new Date() }
          });
        } catch (dbErr) {
          console.warn('[CHAT_DB_WARNING] Failed to touch session updated date:', dbErr);
        }
      }

      if (dbSessionId) {
        try {
          // 1. Save user message
          await prisma.chatMessage.create({
            data: {
              sessionId: dbSessionId,
              role: 'user',
              type: 'text',
              content: recommendation,
            }
          });

          // 2. Reconstruct displayContent to match frontend representation
          let displayContent = data.reply || "";
          if (data.plan) {
            const plan = data.plan;
            displayContent += `\n\n### **Blueprint Preview**\n`;
            displayContent += `* **Angle**: ${plan.angle || 'N/A'}\n`;
            displayContent += `* **Audience**: ${plan.audience || 'N/A'}\n`;
            if (plan.hook) {
              displayContent += `* **Hook**: *"${plan.hook}"*\n`;
            }
            displayContent += `\n`;
            
            if (plan.outline) {
              displayContent += `### **Proposed Outline**\n${plan.outline}\n\n`;
            }
            
            if (plan.sources && plan.sources.length > 0) {
              displayContent += `### **Sources**\n`;
              plan.sources.forEach((src: string, index: number) => {
                let domain = 'Source';
                try { domain = new URL(src).hostname.replace('www.', ''); } catch { /* ignore invalid URL */ }
                displayContent += `${index + 1}. [${domain}](${src})\n`;
              });
              displayContent += `\n`;
            }

            if (plan.draft) {
              displayContent += `### **Draft Preview**\n${plan.draft}\n`;
            }
          }

          // 3. Save assistant message
          await prisma.chatMessage.create({
            data: {
              sessionId: dbSessionId,
              role: 'assistant',
              type: 'text',
              content: displayContent,
              payload: data.suggestions ? { suggestions: data.suggestions } : undefined,
            }
          });
        } catch (dbErr) {
          console.error('[CHAT_DB_ERROR] Failed to save generate-plan messages:', dbErr);
        }
      }
    }

    res.json({
      ...data,
      sessionId: dbSessionId === 'new' ? null : dbSessionId
    });
  } catch (error) {
    console.error('Error in generate-plan:', error);
    res.status(500).json({ error: 'Failed to generate plan' });
  }
});

/**
 * 5. Generate Draft from Notes
 */
router.post('/generate-draft-from-notes', async (req, res) => {
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
          const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
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
      console.log('[generate-draft-from-notes] Client closed connection.');
    });

    heartbeatInterval = setInterval(() => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`);
      }
    }, 5000);

    if (!notes || notes.length === 0) {
      res.write(`data: ${JSON.stringify({ type: "error", message: "No notes provided" })}\n\n`);
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
        profile = await resolveEditorialProfileForUser(userId, workspace?.organizationId);
      }
    } catch (profileError) {
      console.warn('[Editorial Profile] Profile resolution failed, falling back to Envoyou v1:', profileError);
    }

    const notesText = notes.map((n: { content: string; sources?: { url: string; domain?: string }[] }, i: number) => {
      const sourcesText = n.sources && n.sources.length > 0 
        ? `Sources: ${n.sources.map(s => s.url).join(', ')}`
        : '';
      const cleanContent = n.content.replace(/\s*\[\d+\]\([^)]+\)/g, '');
      return `NOTE ${i + 1}:\n${cleanContent}\n${sourcesText}`;
    }).join('\n\n---\n\n');

    // --- Preprocessing: detect if input contains multiple topic briefs (blueprint) ---
    const briefMatches = notesText.match(/(?:###\s*\d+\.\s*Topic Brief|Rekomendasi Judul|Topic Brief:|##\s*Topic Brief)/gi);
    const hasMultipleBriefs = briefMatches && briefMatches.length > 1;
    const isBlueprint = /Blueprint Editorial|Audit Performa|Matriks Kontribusi|Strategi SEO|Hub-and-Spoke|Pipeline Konten/i.test(notesText);

    if (hasMultipleBriefs || isBlueprint) {
      // Send a hint event so the frontend can prompt the user to select a topic
      res.write(`data: ${JSON.stringify({
        type: "blueprint_detected",
        message: "Multiple article topics detected in notes. The AI will pick the first complete topic brief to generate the draft.",
        topicCount: briefMatches?.length || 0,
      })}\n\n`);
    }

    const systemInstruction = new DraftFromNotesComposer(profile?.config).compose('xml');

    // The <instruction> block that was previously appended here is fully covered by
    // DraftFromNotesConstraintsNode (cognitive_framework + absolute_prohibitions).
    // Keeping it caused instruction duplication and potential model confusion.
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
        console.log('[generate-draft-from-notes] Aborting stream loop due to client disconnect.');
        break;
      }
      if (event.event_type === "step.delta" && event.delta?.type === "text" && event.delta.text) {
        res.write(`data: ${JSON.stringify({ type: "text", chunk: event.delta.text })}\n\n`);
      } else if (event.event_type === "interaction.completed") {
        const eventWithInteraction = event as { interaction?: { usage?: { total_tokens?: number } } };
        const usage = eventWithInteraction.interaction?.usage;
        if (usage) {
          console.log(`\n[ENVOYOU INTERNAL BILLING] Generate Draft from Notes Complete. Total Tokens: ${usage.total_tokens || 0}`);
        }
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      }
    }
    
    res.end();
  } catch (error) {
    console.error('Error generating draft from notes:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate draft' });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: "Stream failed" })}\n\n`);
      res.end();
    }
  } finally {
    clearInterval(heartbeatInterval);
  }
});

/**
 * 5. Chat History & Session Management
 */
router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const sessions = await prisma.chatSession.findMany({
      where: { userId },
      take: limit,
      skip: offset,
      orderBy: [
        { isPinned: 'desc' },
        { updatedAt: 'desc' }
      ],
      select: {
        id: true,
        title: true,
        isPinned: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { content: true }
        }
      }
    });

    res.json({ sessions });
  } catch (error) {
    console.error('Error fetching chat sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

router.get('/sessions/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const sessionId = req.params.id;

    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    res.json({ session });
  } catch (error) {
    console.error('Error fetching chat session details:', error);
    res.status(500).json({ error: 'Failed to fetch session details' });
  }
});

router.patch('/sessions/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const sessionId = req.params.id;
    const { title, isPinned } = req.body;

    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId }
    });

    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    const updated = await prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        title: typeof title === 'string' ? title.trim() : undefined,
        isPinned: typeof isPinned === 'boolean' ? isPinned : undefined
      }
    });

    res.json({ session: updated });
  } catch (error) {
    console.error('Error updating chat session:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

router.delete('/sessions/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const sessionId = req.params.id;

    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId }
    });

    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    await prisma.chatSession.delete({
      where: { id: sessionId }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting chat session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

export default router;
