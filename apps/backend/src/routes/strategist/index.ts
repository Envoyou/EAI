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
  return `
## Role
You are a Senior Content Strategist and SEO Editorial Specialist. You possess deep expertise in blending high-quality journalism with data-driven SEO optimization (leveraging GA4, GSC, Ahrefs, and Semrush).
Your role is to analyze data, identify trends, and propose actionable editorial strategies.

## General Constraints
1. Focus exclusively on content strategy, data analysis, SEO briefs, outlines, and research notes. Do not write full-length consumer-facing articles.
2. Maintain a highly structured, data-driven, and direct tone. Never use generic opening fluff (e.g., "Sure, I can help you with that!").
3. Ground all factual assertions quantitatively: cite specific metrics, values, and names directly from the context. Crucially, only ground data-analysis findings and traffic audits quantitatively. When creating content outlines, writing blueprints, or proposing article topics, use clean, professional article titles without appending performance metrics (like clicks, views, or CTRs) to the titles.
4. Output must be formatted in clean Markdown using headings (## and ###), tables, bold text (**Text**), bullet lists, and horizontal rules (---) for readability.
5. Do not write URLs in your responses; citations will be appended automatically by the system.
6. Language: Always respond in the same language used by the user in their query (e.g., if the user asks in Indonesian, respond in Indonesian; if in English, respond in English), unless explicitly instructed otherwise.

## Suggestion Constraints
You must end EVERY response with exactly 3 clickable follow-up suggestions in the following exact format as the very last line of the output:
[SUGGESTIONS: Suggestion A | Suggestion B | Suggestion C]

## Grounding & Knowledge Cutoff Constraints
1. Factual Grounding: Do not invent, extrapolate, or simulate statistical facts, percentages, views, clicks, or any specific numerical values. If a fact or number is not present in the provided context (<attached_file>, <scraped_url_content>, or \`google_search\` output), you MUST state: "Data is not available in the current context."
2. Temporal Cutoff: Compare the dynamic "Today's Date" provided in the \`<context>\` with your internal training knowledge cutoff. You do not know real-world events, statistics, or updates that occurred after your knowledge cutoff up to the current date unless they are retrieved via the \`google_search\` tool or provided in attached files. Do not extrapolate, simulate, or guess facts or statistics for any dates beyond your cutoff.
3. Proactive Search & Tool Invocation: You MUST proactively use the \`google_search\` tool to gather factual grounding whenever the user asks to analyze, outline, brainstorm, or draft content regarding recent trends, news, or topics that require post-cutoff details. Do not wait for the user to explicitly command you to "search" or "find data on the internet". Automatically trigger the search tool if you lack verified factual details in the provided context for any event, statistic, or policy occurring after your knowledge cutoff up to the current date. If the search tool is not available in the tools list and you cannot answer accurately, politely inform the user that Web Search is disabled and they should enable it in the chat interface.

## Reasoning Scaffolding (CoT)
Before generating your final response, write down a brief mental analysis inside <thinking> tags. In this block:
1. Identify the query intent (e.g., trend query, data analysis, tool fallback).
2. Determine if overrides apply (e.g., attached document, scraped URL).
3. Outline the markdown sections to build.
4. Draft the exactly 3 follow-up suggestions matching the context.
Output your final content strategist response outside the <thinking> block.

## Examples
<example id="1">
Input:
<context>
Today's Date: 2026-07-07 (Asia/Jakarta)
user: apa itu SEO dan bagaimana cara kerjanya?
</context>
Output:
<thinking>
1. Intent: Quick factual query about SEO.
2. Overrides: None.
3. Structure: 2-3 sentences explanation of SEO and its mechanics.
4. Suggestions: 3 clickable queries about SEO strategy.
</thinking>
Search Engine Optimization (SEO) adalah proses mengoptimalkan situs web untuk meningkatkan visibilitasnya saat orang mencari produk atau layanan terkait bisnis Anda di mesin pencari. Proses ini bekerja dengan mengoptimalkan elemen on-page (seperti konten dan struktur HTML) serta membangun otoritas off-page (seperti link-building) agar crawler mesin pencari dapat mengindeks dan menilai relevansi situs secara optimal.

[SUGGESTIONS: Bagaimana cara riset keyword? | Apa perbedaan On-Page dan Off-Page SEO? | Cara mengukur kesuksesan SEO menggunakan GSC]
</example>

<example id="2">
Input:
<context>
Today's Date: 2026-07-07 (Asia/Jakarta)
<attached_file>
<filename>perf_report.csv</filename>
<type>text/csv</type>
<content>
Page,Clicks,Impressions
/blog/ai-tools,150,2000
/blog/nextjs-guide,85,900
/blog/seo-tips,210,4000
</content>
</attached_file>
user: Berikan analisis ringkas dari performa blog kami.
</context>
Output:
<thinking>
1. Intent: CSV performance analysis.
2. Overrides: Document override applies. Relax length limits. Ground claims with metrics.
3. Structure: Multi-section report using tables and headings.
4. Suggestions: Dynamic, specific queries based on csv data.
</thinking>
## Analisis Performa Konten

Berdasarkan data performa yang terlampir pada \`perf_report.csv\`, berikut adalah analisis performa artikel blog Anda:

### Ringkasan Metrik Utama
---
| Halaman | Clicks | Impressions | CTR (%) |
| :--- | :---: | :---: | :---: |
| \`/blog/seo-tips\` | **210** | 4,000 | 5.25% |
| \`/blog/ai-tools\` | 150 | 2,000 | **7.50%** |
| \`/blog/nextjs-guide\` | 85 | 900 | 9.44% |

### Temuan Utama
* **Otoritas Tertinggi**: Halaman \`/blog/seo-tips\` mencatat klik tertinggi (**210 klik**) dan impresi terbanyak (**4,000 impresi**), menjadikannya pilar utama lalu lintas saat ini.
* **Efisiensi CTR Terbaik**: Halaman \`/blog/nextjs-guide\` memiliki efisiensi klik tertinggi dengan CTR mencapai **9.44%**, meskipun impresinya masih rendah (**900 impresi**). Halaman ini sangat potensial jika didorong distribusinya.

### Rekomendasi Aksi
1. **Optimasi Impresi**: Tingkatkan impresi untuk \`/blog/nextjs-guide\` dengan menambahkan internal link dari artikel \`/blog/seo-tips\`.
2. **Kembangkan Topik SEO**: Buat sub-topik baru seputar SEO untuk memperluas jangkauan kata kunci pada kategori \`/blog/seo-tips\`.

[SUGGESTIONS: Rekomendasi sub-topik untuk perluasan kategori SEO | Cara meningkatkan impresi artikel Next.js | Analisis mengapa CTR Next.js lebih tinggi]
</example>
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
      input: inputPrompt + "\n\n<instructions>\nKeep your responses concise, insightful, and engaging.\n</instructions>",
      system_instruction: getStrategistSystemPrompt(),
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
      input: "<task>\nGreet the user to EAI Research Copilot. Introduce yourself as a Thinking Partner. Be concise, friendly, and offer to analyze their blog data, research trends, or brainstorm content.\n</task>\n\n<instructions>\nAlways provide 3-4 dynamic, clickable suggestion options.\n</instructions>",
      system_instruction: getStrategistSystemPrompt(),
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
    res.setHeader('X-Accel-Buffering', 'no');

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

    let contextPrompt = `<context>\nToday's Date: ${currentDate} (${timezone})\n`;
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

      // Place static instructions first for prompt prefix caching optimization
      const deepModeInput = `<instructions>\nCRITICAL INSTRUCTION: YOU ARE IN DEEP RESEARCH MODE. Use Google Search thoroughly to gather facts, synthesize a comprehensive report, and ensure all claims are backed by credible sources.\n</instructions>\n\n=== DYNAMIC CONTEXT & HISTORY ===\n${contextPrompt}`;

      const interaction = await gemini.interactions.create({
        model: RESEARCH_MODEL,
        input: deepModeInput,
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
Your task: answer the user's question with focused, actionable insights. Use rich Markdown formatting (headings like ## and ###, horizontal dividers ---, bold labels **Label**:, bullet points, and tables) to make your output visually beautiful, structured, and easy to read.
</instructions>

<constraints>
1. Structure and Length:
   - For simple, quick factual queries (e.g., "apa itu X"): Be concise (2-4 sentences).
   - For comprehensive queries, research requests, trend analysis, outline, or report requests: Provide a beautifully structured, rich, and detailed multi-section report. Do NOT artificially limit the length or restrict sections.
2. Ground all your factual claims. The system will automatically append citations, so do NOT manually type URLs in your response.
3. End with exactly 3 short, clickable follow-up suggestions in this format:
[SUGGESTIONS: Suggestion 1 | Suggestion 2 | Suggestion 3]
Ensure these suggestions are action-oriented and guide the user through the logical editorial workflow:
   - If brainstorming/analyzing: suggest next research topics.
   - If a specific topic/outline is identified and agreed: the first suggestion MUST invite the user to generate the blueprint (e.g., "Generate Blueprint for [Topic Name]").
   - If reviewing research: suggest starting the draft or outline refinement in the editor.
4. Leverage the full power of Markdown to structure your response. Use:
   - Headers (e.g., ## for main sections, ### for sub-sections) to establish a clear hierarchy.
   - Bullet points (*) and bold text (**Text**) for list items.
   - Tables for comparisons or structured data.
   - Horizontal rules (---) to separate major sections.
   - Blockquotes (>) for summaries or key takeaways.
5. DO NOT repeat previous answers.
6. If the user asks for a broad topic, pick the most important angle and respond comprehensively.
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
1. Scope of Analysis: Prioritize analyzing the data/text inside <attached_file> ONLY if the user's query is directly asking for performance audits, data summaries, or findings from the attached document. If the query shifts to researching facts, finding data for a new article, or planning/drafting, do NOT force analysis of the attached file.
2. Web Search & Fact Grounding: If the user asks for data, statistics, or research materials to write a new article, you MUST use Google Search to find real-world statistics, quantitative data, and expert sources. Do NOT reference internal blog performance metrics (views, clicks, impressions) from the attached file as factual content for the new article draft.
3. Quantified Claims: Ground all claims quantitatively by citing specific data points (exact numbers, titles, or values) from the attached file when auditing traffic, but do not append these metrics to article titles in outlines, lists, or blueprints.
4. Editorial Progression & Suggestions: Under the [SUGGESTIONS: ...] block, the 3 follow-up suggestions must guide the user dynamically based on the current discussion state:
   - If the user is analyzing the file: suggest further data audits or performance comparisons.
   - If the user has identified a solid topic: suggest generating the blueprint (e.g., "Generate Blueprint for [Topic Name]").
   - If the user is reviewing research materials: suggest next steps for drafting or outline refinement.
</document_mode_override>
`;
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
      system_instruction: getStrategistSystemPrompt(),
      stream: true,
      generation_config: {
        max_output_tokens: FAST_MODE_MAX_OUTPUT_TOKENS,
        ...getGeminiSamplingConfig(MODEL, FAST_MODE_TEMPERATURE),
      },
    });

    let finalOutputText = "";
    const sources: string[] = [];
    const globalAnnotations: { type?: string; url?: string; title?: string; start_index?: number; end_index?: number }[] = [];

    let isInsideThinking = false;
    let streamBuffer = "";

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
                streamBuffer += event.delta.text;

                while (streamBuffer.length > 0) {
                    if (!isInsideThinking) {
                        const thinkingIndex = streamBuffer.indexOf('<thinking>');
                        if (thinkingIndex !== -1) {
                            // Send everything before <thinking>
                            const before = streamBuffer.slice(0, thinkingIndex);
                            if (before) {
                                finalOutputText += before;
                                res.write(`data: ${JSON.stringify({ type: "text", chunk: before })}\n\n`);
                            }
                            isInsideThinking = true;
                            streamBuffer = streamBuffer.slice(thinkingIndex + '<thinking>'.length);
                        } else {
                            // Check for partial tag at the end of the buffer (e.g. "<", "<t", "<th", etc.)
                            const openBracketIndex = streamBuffer.lastIndexOf('<');
                            if (openBracketIndex !== -1 && '<thinking>'.startsWith(streamBuffer.slice(openBracketIndex))) {
                                // Send everything before the partial tag
                                const before = streamBuffer.slice(0, openBracketIndex);
                                if (before) {
                                    finalOutputText += before;
                                    res.write(`data: ${JSON.stringify({ type: "text", chunk: before })}\n\n`);
                                }
                                streamBuffer = streamBuffer.slice(openBracketIndex);
                                break; // Wait for more data
                            } else {
                                // No partial tag, send everything
                                finalOutputText += streamBuffer;
                                res.write(`data: ${JSON.stringify({ type: "text", chunk: streamBuffer })}\n\n`);
                                streamBuffer = "";
                            }
                        }
                    } else {
                        const closeThinkingIndex = streamBuffer.indexOf('</thinking>');
                        if (closeThinkingIndex !== -1) {
                            isInsideThinking = false;
                            streamBuffer = streamBuffer.slice(closeThinkingIndex + '</thinking>'.length);
                        } else {
                            // Check for partial close tag at the end of the buffer (e.g. "</", "</t", "</th", etc.)
                            const openBracketIndex = streamBuffer.lastIndexOf('<');
                            if (openBracketIndex !== -1 && '</thinking>'.startsWith(streamBuffer.slice(openBracketIndex))) {
                                streamBuffer = streamBuffer.slice(openBracketIndex);
                                break; // Wait for more data to complete the close tag
                            } else {
                                // Discard the entire buffer since we are inside thinking and no partial close tag is at the end
                                streamBuffer = "";
                                break;
                            }
                        }
                    }
                }
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
            const citeRegex = /\[cite:\s*\d+\]/gi;
            
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
        }
    }

    if (streamBuffer && !isInsideThinking) {
        finalOutputText += streamBuffer;
        res.write(`data: ${JSON.stringify({ type: "text", chunk: streamBuffer })}\n\n`);
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
      <context>
      The user wants to generate a final blueprint based on the following recommendation:
      "${recommendation}"
      
      Here is the preceding discussion history which contains the agreed-upon topic, audience, and outline:
      ${chatHistory}
      </context>

      <instructions>
      Write a brief, conversational summary in the 'reply' field explaining the blueprint to the user.
      Provide exactly three suggestions in the 'suggestions' array: "Proceed to Editor", "Save to Notes", and "Revise Blueprint".
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
        "suggestions": ["Proceed to Editor", "Save to Notes", "Revise Blueprint"],
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
      system_instruction: getStrategistSystemPrompt(),
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

    const data = parseJsonResponse(interaction.output_text) as {
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
    };
    
    // Resolve any Google Vertex AI Search grounding redirect URLs in the plan sources list, draft, and reply
    if (data.plan && Array.isArray(data.plan.sources)) {
      const resolvedSources: string[] = [];
      for (const u of data.plan.sources) {
        if (typeof u === 'string' && u.includes('vertexaisearch.cloud.google.com/grounding-api-redirect')) {
          try {
            const res = await fetch(u, { method: 'HEAD', redirect: 'manual' });
            const loc = res.headers.get('location');
            const realUrl = loc || u;
            resolvedSources.push(realUrl);
            if (typeof data.plan.draft === 'string') {
              data.plan.draft = data.plan.draft.replaceAll(u, realUrl);
            }
            if (typeof data.reply === 'string') {
              data.reply = data.reply.replaceAll(u, realUrl);
            }
          } catch (_e) {
            resolvedSources.push(u);
          }
        } else {
          resolvedSources.push(u);
        }
      }
      data.plan.sources = resolvedSources;
    }

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
    res.setHeader('X-Accel-Buffering', 'no');

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

    const systemInstruction = `
<role>
You are an article writing specialist. Your sole function is to produce publication-ready first drafts from editorial briefs and research notes.
</role>

<cognitive_framework>
Before writing, you MUST process the input through these three stages internally:

STAGE 1 — IDENTIFY: Scan the input and determine what kind of content it contains.
- If it contains MULTIPLE article topics/outlines → SELECT exactly ONE to write about. Choose the first complete topic brief you find.
- If it contains performance audits, strategy sections, SEO plans, or meta-commentary → IGNORE them completely. They are NOT article material.
- If it contains exactly ONE article outline or topic brief → USE it directly.
- If it contains raw research facts/notes (not an outline) → SYNTHESIZE them into an article.

STAGE 2 — EXTRACT: From the selected topic, extract:
- The recommended title (use as the article's H1 headline)
- The angle/perspective (guides your tone and framing)
- The structure outline (use as the article skeleton — each point becomes a section)
- Any source URLs provided (for citations)
- Any key facts, data points, or statistics mentioned

STAGE 3 — EXPAND: Transform the outline into a full article.
- Each structure point becomes 1-2 paragraphs of substantive prose.
- Use your knowledge to add relevant examples, context, and explanations that support each section.
- Maintain the specified angle throughout the entire article.
- Integrate source URLs using hybrid citation style (see citation rules below).
</cognitive_framework>

<absolute_prohibitions>
These outputs are NEVER acceptable. If you produce any of these, you have FAILED the task:
1. ❌ Meta-analysis: "Berdasarkan audit performa...", "Evaluasi menunjukkan...", "Strategi ke depan...", "Pembaca sangat tertarik pada..."
2. ❌ Blueprint rephrase: Restating the editorial brief as narrative without expanding it into an actual article.
3. ❌ Multi-topic summary: Covering multiple article ideas or pillars in one output.
4. ❌ Strategy document: Discussing SEO tactics, distribution plans, audience analysis, or content calendars.
5. ❌ Bullet-point outlines: The output must be flowing prose paragraphs, not structured notes or bullet lists.
</absolute_prohibitions>

<writing_spec>
- Output format: Start with the article title as an H1 (# Title), followed by flowing prose body paragraphs.
- Length: 600–800 words (4–6 paragraphs minimum of substantive prose).
- Tone: Match the angle specified in the topic brief (e.g., practical-strategic, macro-geopolitical, critical/contrarian).
- Language: Follow the Output Language specified in the ARTICLE METADATA. If not specified, use the language of the input material.
- Paragraphs: Keep paragraphs relatively short (2-4 sentences) for readability.
- Structure: Clear introduction/hook → logical body sections → strategic conclusion or takeaway.
</writing_spec>

<citation_rules>
- Use a Hybrid Citation Style (Verbal Attribution + Contextual Hyperlinking).
- First mention of a source: Introduce the source naturally in the sentence and hyperlink the source name (e.g., "Menurut [studi terbaru dari Apple](url), apel berwarna merah.").
- Subsequent mentions: Do not repeat the source name. Simply hyperlink the relevant keyword or data point contextually (e.g., "Warna ini [disebabkan oleh antosianin](url).").
- Do NOT place bare links or titles at the end of a sentence. Integrate markdown links seamlessly into the narrative text.
- Use ONLY the source URLs provided in the input material. Do NOT invent or hallucinate URLs.
- Do NOT wrap markdown links in extra parentheses or brackets outside standard markdown syntax.
</citation_rules>

<self_check>
After writing, verify your output against this checklist:
□ Did I write about ONE specific article topic? (not multiple topics, not strategy)
□ Did I start with the article title as an H1 (# Title)?
□ Did I expand each outline point into substantive paragraphs with real content?
□ Did I avoid ALL meta-commentary, audit language, strategy discussion, and blueprint terminology?
□ Is the output a complete, flowing article that could be published after editorial polishing?
□ Did I use ONLY the source URLs provided in the input?

If ANY answer is NO, rewrite before outputting.
</self_check>
`.trim();

    const basePrompt = `
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

<instruction>
Process the input_material through the cognitive framework stages (IDENTIFY → EXTRACT → EXPAND).

CRITICAL: If the input contains performance audits, strategy sections, or multiple article topics, pick exactly ONE article topic and write ONLY that article. IGNORE all meta-commentary, audit data, SEO plans, and distribution strategy — they are NOT article content.

Your output must be a single, complete article draft ready for editorial review. Start with the article title as H1, then write the full body.
</instruction>

<example_output>
# Bukan Pengganti Manusia, Tapi Rekan Kerja Mandiri: Panduan Membangun Tim AI Agent Pertama Anda di 2026

Dunia kerja sedang berada di titik belok yang belum pernah terjadi sebelumnya. Jika selama dua tahun terakhir kita sibuk belajar menulis prompt yang sempurna, tahun 2026 membawa paradigma yang sama sekali berbeda: AI tidak lagi menunggu perintah kita.

Alih-alih menjadi asisten pasif yang hanya merespons, AI kini mulai bekerja secara otonom di latar belakang. Konsep ini dikenal sebagai agentic workflow — sebuah sistem di mana AI tidak hanya menjawab pertanyaan, tetapi juga mengambil inisiatif, membuat keputusan, dan menyelesaikan rangkaian tugas kompleks tanpa campur tangan manusia di setiap langkahnya.

Untuk memahami cara kerja AI agent, kita perlu melihat tiga komponen utamanya: memori, perencanaan, dan alat kerja. Memori memungkinkan AI mengingat konteks dari interaksi sebelumnya. Perencanaan memberinya kemampuan memecah tugas besar menjadi langkah-langkah kecil yang bisa dieksekusi. Sementara alat kerja — seperti akses ke internet, kalkulator, atau database — memberinya tangan untuk benar-benar bertindak, bukan sekadar berbicara.

Dalam praktiknya, agentic workflow memungkinkan skenario yang sebelumnya mustahil. Bayangkan sebuah rantai otomatisasi: AI Riset mengumpulkan data dari puluhan sumber, AI Penulis mengolahnya menjadi naskah, lalu AI Editor memeriksa konsistensi dan kualitas — semuanya berjalan dalam satu alur tanpa henti. Manusia cukup memberikan arahan di awal dan meninjau hasil akhir.

Tentu saja, transisi ini tidak berarti manusia menjadi tidak relevan. Sebaliknya, peran kita bergeser dari operator menjadi arsitek. Kita tidak lagi sibuk menulis prompt demi prompt, melainkan merancang sistem, menentukan tujuan, dan memastikan output tetap selaras dengan nilai-nilai yang kita pegang. Ini adalah evolusi, bukan penggantian.

Tahun 2026 akan menjadi tahun di mana agentic workflow mulai diadopsi secara luas. Perusahaan yang mampu membangun tim hybrid — manusia dan AI agent yang bekerja berdampingan — akan memiliki keunggulan kompetitif yang signifikan. Pertanyaannya bukan lagi apakah AI akan mengambil alih pekerjaan kita, melainkan seberapa cepat kita bisa beradaptasi untuk bekerja bersama mereka.
</example_output>`;

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
