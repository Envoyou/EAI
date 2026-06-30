import { Router, Request, Response, NextFunction } from 'express';
import { gemini, getGeminiSamplingConfig } from '@/lib/ai/provider-runtime';
import { getWorkspaceState } from '@/lib/user-workspace';
import { resolveEditorialProfileForUser } from '@/lib/editorial-profile-server';
import { composeEditorialPrompt, ENVOYOU_EDITORIAL_PROFILE } from '@eai/shared/server';
import { parseJsonResponse } from '@eai/shared';
import { verifyToken } from '@clerk/backend';
import { checkCreditsRemaining, deductCredits } from '@/lib/chat-billing';
import { prisma } from '@/lib/db';

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
const MODEL = resolveModel(process.env.GEMINI_COPILOT_MODEL || 'gemini-3.5-flash');
const RESEARCH_MODEL = resolveModel(process.env.GEMINI_RESEARCH_MODEL || 'gemini-3.5-flash');

// Fast-mode output control: higher limit for structured research material
const FAST_MODE_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_COPILOT_FAST_MAX_TOKENS) || 2048;
const FAST_MODE_TEMPERATURE = Number(process.env.GEMINI_COPILOT_FAST_TEMPERATURE) || 0.35;

const getStrategistSystemPrompt = () => {
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

  return `
<role>
You are a Senior Content Strategist and SEO Editorial Specialist. You possess deep expertise in blending high-quality journalism with data-driven SEO optimization (leveraging GA4, GSC, Ahrefs, and Semrush).
Your role is to analyze data, identify trends, and propose actionable editorial strategies.
</role>

<constraints>
- Output style: concise, data-driven, and highly structured. Avoid fluff or generic introductory text.
- Never write full articles — only provide research notes, content brief outlines, and strategic recommendations.
- Focus on practical, actionable advice that bridges editorial quality with search visibility.
- For time-sensitive user queries that require up-to-date information, the current time context is: ${currentDate} (${timezone}) (${currentYear}).
</constraints>
`.trim();
};


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
      input: inputPrompt,
      system_instruction: getStrategistSystemPrompt() + "\n\n<instructions>\nKeep your responses concise, insightful, and engaging.\n</instructions>",
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
      input: "<task>\nGreet the user to EAI Research Copilot. Introduce yourself as a Thinking Partner. Be concise, friendly, and offer to analyze their blog data, research trends, or brainstorm content.\n</task>",
      system_instruction: getStrategistSystemPrompt() + "\n\n<instructions>\nAlways provide 3-4 dynamic, clickable suggestion options.\n</instructions>",
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
  try {
    const { messages, mode, notesSummary, attachments, enableSearch, activeHistoryId } = req.body;
    
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

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const chatInput = messages[messages.length - 1].content;

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

    let contextPrompt = `<context>\n`;
    if (notesSummary) {
      contextPrompt += `${notesSummary}\n`;
    }

    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      const attachment = attachments[0];
      if (attachment && attachment.extractedText) {
        const textLimit = 15000;
        const text = attachment.extractedText;
        const truncatedText = text.slice(0, textLimit);
        const truncationNotice = text.length > textLimit ? '\n[... content truncated at 15,000 characters ...]' : '';

        contextPrompt += `<attached_file>\n<filename>${attachment.filename}</filename>\n<type>${attachment.contentType}</type>\n<content>\n${truncatedText}${truncationNotice}\n</content>\n</attached_file>\n`;
      }
    }

    if (scrapedContent) {
      contextPrompt += `<scraped_url_content url="${urlToScrape}">\n${scrapedContent}\n</scraped_url_content>\n`;
    }

    contextPrompt += `${history.map((m: { role: string, content: { text: string }[] }) => `${m.role}: ${m.content[0].text}`).join('\n')}\n</context>\n\n<task>\nuser: ${chatInput}\nassistant:\n</task>`;

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

      const interaction = await gemini.interactions.create({
        model: RESEARCH_MODEL,
        input: contextPrompt + "\n\n<instructions>\nCRITICAL INSTRUCTION: YOU ARE IN DEEP RESEARCH MODE. Use Google Search thoroughly to gather facts, synthesize a comprehensive report, and ensure all claims are backed by credible sources.\n</instructions>",
        system_instruction: getStrategistSystemPrompt(),
        tools: [{ type: "google_search" }],
        background: true
      });
      
      console.log(`[BILLING] Deep Research started. Interaction ID: ${interaction.id}. Token usage will be billed upon completion.`);

      res.write(`data: ${JSON.stringify({ type: "deep_research_started", interaction_id: interaction.id })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
      return;
    }

    // FAST MODE
    const FAST_MODE_INSTRUCTION = `
<instructions>
CRITICAL: You are in FAST MODE — a professional content strategist.
Your task: answer the user's question with focused, actionable insights. Use rich Markdown formatting (headings like ###, bold labels **Label**:, bullet points, and tables) to make your output visually beautiful, structured, and easy to read.
</instructions>

<constraints>
1. Length constraint: Be 2–4 paragraphs for research requests (e.g., "riset tren X untuk artikel"), and 2–4 sentences for simple factual queries (e.g., "apa itu X").
2. Ground all your factual claims. The system will automatically append citations, so do NOT manually type URLs in your response.
3. End with exactly 3 short, clickable follow-up suggestions in this format:
[SUGGESTIONS: Suggestion 1 | Suggestion 2 | Suggestion 3]
4. DO NOT write long lists, summaries, or multiple sections unless requested as part of a research request.
5. DO NOT repeat previous answers.
6. If the user asks for a broad topic, pick the most important angle and respond concisely.
</constraints>
`;

    let finalFastModeInstruction = FAST_MODE_INSTRUCTION;
    const hasAttachments = attachments && Array.isArray(attachments) && attachments.length > 0;

    const hasUrlInMessage = !!urlMatch;
    if (hasUrlInMessage) {
      if (scrapedContent) {
        finalFastModeInstruction += `
\n<url_mode_override>
CRITICAL: The system has successfully fetched the URL content at ${urlToScrape} and placed it inside <scraped_url_content>.
Prioritize analyzing the content inside <scraped_url_content> to answer the user's request. Treat the query as a research request: length restrictions are relaxed and you are encouraged to write a beautifully structured, comprehensive Markdown analysis of the page.
Do NOT use web search unless additional external details are needed. Do NOT ask the user to copy/paste the content.
</url_mode_override>
`;
      } else {
        finalFastModeInstruction += `
\n<url_mode_override>
CRITICAL: The user provided a URL. Use the url_context tool to fetch and read that page directly.
If you cannot fetch it or the tool fails, politely ask the user to copy and paste the content manually.
</url_mode_override>
`;
      }
    }
    if (hasAttachments) {
      finalFastModeInstruction += `
\n<document_mode_override>
CRITICAL: A file is attached to this request.
1. Prioritize analyzing the data/text inside <attached_file> over web search. Do NOT use Google Search unless the user asks for external information.
2. Treat the query as a research request regardless of phrasing: length constraints and short sentence restrictions are relaxed. Continue using rich Markdown formatting (headings like ###, bold labels, bullet points, and tables) to present your analysis cleanly and make it highly readable.
3. Ground all claims quantitatively: ALWAYS cite specific data points (exact numbers, titles, or values) from the attached file rather than generalizing into categories. Do not just say "topic X performed best" — say "Article Y had Z views, the highest among the dataset."
4. Under the [SUGGESTIONS: ...] block, the 3 follow-up suggestions MUST refer back to specific data points or invite deeper analysis of the attached file (e.g., comparing metrics, asking about outliers, or specific topics) rather than being generic follow-up questions.
</document_mode_override>
`;
    }

    // Build tools list: google_search if enabled, url_context if message has a URL
    const fastTools: ({ type: 'google_search' } | { type: 'url_context' })[] = [];
    if (isSearchEnabled) fastTools.push({ type: 'google_search' });
    if (hasUrlInMessage) fastTools.push({ type: 'url_context' });

    const stream = await gemini.interactions.create({
      model: MODEL,
      input: contextPrompt,
      tools: fastTools.length > 0 ? fastTools : undefined,
      system_instruction: getStrategistSystemPrompt() + finalFastModeInstruction,
      stream: true,
      generation_config: {
        max_output_tokens: FAST_MODE_MAX_OUTPUT_TOKENS,
        ...getGeminiSamplingConfig(MODEL, FAST_MODE_TEMPERATURE),
      },
    });

    let finalOutputText = "";
    const sources: string[] = [];
    const globalAnnotations: { type?: string; url?: string; title?: string; end_index?: number }[] = [];

    for await (const event of stream) {
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
                finalOutputText += event.delta.text;
                res.write(`data: ${JSON.stringify({ type: "text", chunk: event.delta.text })}\n\n`);
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

            const sortedAnnotations = [...globalAnnotations].sort((a: { end_index?: number }, b: { end_index?: number }) => {
                const endA = a.end_index || 0;
                const endB = b.end_index || 0;
                return endB - endA;
            });
            
            // Map to keep track of unique URLs and their footnote index
            const urlToIndex = new Map<string, number>();
            const uniqueSourcesData: { url: string; domain: string }[] = [];
            
            // Unfurl Google Vertex AI Grounding redirect URLs
            const resolvedUrls = new Map<string, string>();
            const urlsToResolve = [...new Set(sortedAnnotations.map(a => a.url).filter(Boolean))] as string[];
            
            await Promise.all(urlsToResolve.map(async (u) => {
                if (u.includes('vertexaisearch.cloud.google.com/grounding-api-redirect')) {
                    try {
                        const res = await fetch(u, { method: 'HEAD', redirect: 'manual' });
                        const loc = res.headers.get('location');
                        resolvedUrls.set(u, loc || u);
                    } catch (_e) {
                        resolvedUrls.set(u, u);
                    }
                } else {
                    resolvedUrls.set(u, u);
                }
            }));
            
            for (const annotation of sortedAnnotations) {
                if (annotation.type === "url_citation" && annotation.url) {
                    const realUrl = resolvedUrls.get(annotation.url) || annotation.url;
                    sources.push(realUrl);
                    
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
                    
                    const sourceIndex = urlToIndex.get(realUrl);
                    // Perplexity style inline numbered pill
                    const citationStr = ` [${sourceIndex}](${realUrl})`;
                    
                    // Interactions API returns UTF-16 character index directly — no conversion needed
                    const charIndex = Math.min(annotation.end_index || 0, finalOutputText.length);
                    finalOutputText = finalOutputText.slice(0, charIndex) + citationStr + finalOutputText.slice(charIndex);
                }
            }
            
            // (Markdown appending removed in favor of premium frontend favicon UI)

            // Output is sent as-is — structured prompt keeps length bounded without lossy summarization
            // Strip Gemini raw search grounding metadata [cite: ...] and trailing unmatched brackets
            const outputToSend = finalOutputText
                .replace(/\[cite:\s*[^\]]*\]/gi, '')
                .replace(/\s*\[\s*$/g, '')
                .trim();
            
            if (outputToSend) {
                res.write(`data: ${JSON.stringify({ type: "replace_text", text: outputToSend })}\n\n`);
            }
            if (uniqueSourcesData.length > 0) {
                res.write(`data: ${JSON.stringify({ type: "sources", sources: uniqueSourcesData })}\n\n`);
            }
            res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
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
    const { recommendation, history } = req.body;

    let chatHistory = "";
    if (history && Array.isArray(history)) {
      // Truncate to last 8 messages to avoid bloating the blueprint prompt
      const HISTORY_WINDOW = 8;
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
      ${getStrategistSystemPrompt()}

      <context>
      The user wants to generate a final blueprint based on the following recommendation:
      "${recommendation}"
      
      Here is the preceding discussion history which contains the agreed-upon topic, audience, and outline:
      ${chatHistory}
      </context>

      <instructions>
      Write a brief, conversational summary in the 'reply' field explaining the blueprint to the user.
      Provide exactly two suggestions in the 'suggestions' array: "Proceed to Editor" and "Revise Blueprint".
      Output the detailed blueprint in the 'plan' object.
      </instructions>

      <constraints>
      1. CRITICAL REQUIREMENT: You MUST use Google Search to find highly credible, real-world sources, data points, and factual references related to this topic. 
      2. The resulting "sources" array inside the plan MUST contain valid, real URLs to credible publications, reports, or data sources.
      3. The "draft" MUST include factual claims backed by the sources you found. 
      4. If you fail to provide real sources, the article will fail the final Editorial Fact-Checking stage.
      5. The 'draft' field must be a cohesive 400–600 word draft that synthesizes the outline and sources.
      6. Keep the draft focused on the agreed angle and audience.
      7. Do NOT include meta-commentary (e.g., "Here is your draft"). Just output the draft text.
      </constraints>

      <output_format>
      CRITICAL: You MUST output a raw, valid JSON object matching this schema exactly. DO NOT wrap it in markdown code blocks like \`\`\`json.
      Schema:
      {
        "reply": "string",
        "suggestions": ["Proceed to Editor", "Revise Blueprint"],
        "plan": {
          "angle": "string",
          "audience": "string",
          "hook": "string",
          "outline": "string",
          "seoIntent": "string",
          "sources": ["url1", "url2"],
          "draft": "string"
        }
      }
      </output_format>
    `;

    const planSchema = {
      type: "object",
      properties: {
        reply: { type: "string" },
        suggestions: { type: "array", items: { type: "string" } },
        plan: {
          type: "object",
          properties: {
            angle: { type: "string" },
            audience: { type: "string" },
            hook: { type: "string" },
            outline: { type: "string" },
            seoIntent: { type: "string" },
            sources: { type: "array", items: { type: "string" } },
            draft: { type: "string" }
          },
          required: ["angle", "audience", "hook", "outline", "seoIntent", "sources", "draft"]
        }
      },
      required: ["reply", "suggestions", "plan"]
    };

    const interaction = await gemini.interactions.create({
      model: MODEL,
      input: prompt,
      tools: [{ type: "google_search" }],
      response_format: { type: "text", mime_type: "application/json", schema: planSchema },
      generation_config: {
        max_output_tokens: 8192,
        thinking_level: "low",
        ...getGeminiSamplingConfig(MODEL, 0.5),
      }
    });
    
    if (!interaction.output_text) {
        throw new Error("No output from model");
    }

    const data = parseJsonResponse(interaction.output_text);
    res.json(data);
  } catch (error) {
    console.error('Error in generate-plan:', error);
    res.status(500).json({ error: 'Failed to generate plan' });
  }
});

/**
 * 5. Generate Draft from Notes
 */
router.post('/generate-draft-from-notes', async (req, res) => {
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

    const systemInstruction = `
You are an expert editorial writer. Your role is to synthesize raw research notes into a cohesive first draft of an article.
You must strictly follow the editorial brand guidelines and rules.
You are a strictly grounded assistant limited to the information provided in the RAW RESEARCH NOTES.
In your answers, rely ONLY on the facts that are directly mentioned in that context. You must not access or utilize your own knowledge or common sense to answer. Treat the provided context as the absolute limit of truth.

WRITING CONSTRAINTS:
1. Target length: approximately 600–800 words (around 4–6 paragraphs).
2. Synthesize the notes into a flowing narrative, not a bullet-point summary.
3. Maintain the requested tone, Target Audience, and Writing Instructions from the ARTICLE METADATA.
4. Do NOT output bullet points unless strictly necessary for a list.
5. Do NOT include any meta-commentary (e.g., "Here is your draft") or headings like "Draft:". Just output the draft content directly.
6. Output language: Follow the specific target language requested in the ARTICLE METADATA, or default to the language of the research notes.

CRITICAL CITATION RULES:
- Use a Hybrid Citation Style (Verbal Attribution + Contextual Hyperlinking).
- First mention of a source: Introduce the source naturally in the sentence and hyperlink the source name (e.g., "Menurut [studi terbaru dari Apple](url), apel berwarna merah.").
- Subsequent mentions: Do not repeat the source name. Simply hyperlink the relevant keyword or data point contextually (e.g., "Warna ini [disebabkan oleh antosianin](url).").
- Do NOT place bare links or titles at the end of a sentence. Integrate the markdown links seamlessly into the narrative text.
- Use ONLY the source URLs provided in the raw research notes. Do NOT invent URLs.
- Do NOT wrap the markdown link in any extra parentheses or brackets outside of the standard markdown syntax.
`.trim();

    const basePrompt = `
<context>
[ARTICLE METADATA]
Category: ${metadata?.category || 'General'}
Type: ${metadata?.type || 'Article'}
Target Audience: ${metadata?.targetAudience || 'General Audience'}
Output Language: ${metadata?.outputLanguage || 'Follow the language of the research notes.'}
Writing Instructions: ${metadata?.brief || 'Write in a clear, professional, and engaging tone.'}
[/ARTICLE METADATA]

[RAW RESEARCH NOTES]
${notesText}
[/RAW RESEARCH NOTES]
</context>

<task>
Write a cohesive, engaging initial draft for an article using ONLY the raw research notes as your factual basis.
</task>

<example>
EXAMPLE OF CORRECT HYBRID CITATION:
If the note says:
"NOTE 1:
Apples are red due to anthocyanins.
Sources: https://apple.com/color"

Your draft MUST output:
"Sebuah [studi dari Apple Color](https://apple.com/color) menunjukkan bahwa apel pada umumnya berwarna merah. Warna cerah ini secara biologis [disebabkan oleh keberadaan antosianin](https://apple.com/color) pada kulit buah."
</example>`;

    const prompt = composeEditorialPrompt(basePrompt, profile);

    const stream = await gemini.interactions.create({
      model: MODEL,
      input: prompt,
      system_instruction: systemInstruction,
      stream: true,
      generation_config: {
        max_output_tokens: 6000,
        ...getGeminiSamplingConfig(MODEL, 0.6),
      },
    });

    for await (const event of stream) {
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
  }
});

export default router;
