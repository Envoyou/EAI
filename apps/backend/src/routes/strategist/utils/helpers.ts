import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@clerk/backend';
import { prisma } from '@/lib/db';
import { fetchPublicUrl, validatePublicHttpUrl } from '@/lib/safe-url-fetch';
import { StrategistFastModeInstructionNode } from '@/lib/ai/prompt-engine/core/strategist';

export async function resolveInternalOrgId(
  clerkOrgId: string | null | undefined,
  userId: string
): Promise<string | null> {
  if (clerkOrgId) {
    const org = await prisma.organization.findUnique({
      where: { clerkOrganizationId: clerkOrgId },
      select: { id: true },
    });
    if (org) return org.id;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });
  return user?.organizationId ?? null;
}

export async function scrapeUrlContent(url: string): Promise<string> {
  try {
    await validatePublicHttpUrl(url);
  } catch (error) {
    console.warn('[SCRAPER] Blocked unsafe URL:', error);
    return '';
  }

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 6000);

    const jinaUrl = `https://r.jina.ai/${url}`;
    const jinaRes = await fetch(jinaUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'text/plain',
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

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 6000);
    const res = await fetchPublicUrl(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
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

    const tagRegex = /<(p|h1|h2|h3|h4|h5|h6)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    const matches: string[] = [];
    let match;

    while ((match = tagRegex.exec(clean)) !== null) {
      const tag = match[1].toLowerCase();
      let content = match[2].replace(/<[^>]+>/g, '').trim();

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
    console.log(
      `[SCRAPER] Successfully scraped via basic parser fallback: ${url} (${basicText.length} chars)`
    );
    return basicText.slice(0, 15000);
  } catch (error) {
    console.error(`[SCRAPER] Fallback scrape also failed for ${url}:`, error);
    return '';
  }
}

interface RateLimitBucket {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitBucket>();

export function rateLimiter(options: { windowMs: number; max: number; message: string }) {
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

export async function softAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      if (token) {
        const payload = await verifyToken(token, {
          secretKey: process.env.CLERK_SECRET_KEY,
        });
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

export function truncateAtParagraphBoundary(text: string, maxChars: number): string {
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

const resolveModel = (modelName: string): string => {
  if (
    modelName.startsWith('gemini-2.') ||
    modelName.startsWith('gemini-1.5') ||
    modelName.startsWith('gemini-2.0')
  ) {
    return 'gemini-3.5-flash';
  }
  return modelName;
};

export const MODEL = resolveModel(process.env.GEMINI_COPILOT_MODEL || 'gemini-3.1-flash-lite');
export const RESEARCH_MODEL = resolveModel(
  process.env.GEMINI_RESEARCH_MODEL || 'gemini-3.5-flash'
);
export const FAST_MODE_MAX_OUTPUT_TOKENS =
  Number(process.env.GEMINI_COPILOT_FAST_MAX_TOKENS) || 2048;

export const FAST_MODE_INSTRUCTION = new StrategistFastModeInstructionNode().render({
  format: 'xml',
});

export const buildUrlOverrideWithContent = (url: string): string =>
  `
<url_mode_override>
The system has fetched the URL content at ${url} and placed it inside <scraped_url_content>.
Prioritize analyzing this content. Length restrictions are relaxed and you are encouraged to write
a beautifully structured, comprehensive Markdown analysis.
Do NOT use web search unless additional external details are needed.
</url_mode_override>
`.trim();

export const URL_OVERRIDE_NO_CONTENT = `
<url_mode_override>
The user provided a URL. Use the url_context tool to fetch and read that page directly.
If you cannot fetch it or the tool fails, politely ask the user to copy and paste the content manually.
</url_mode_override>
`.trim();

export const DOCUMENT_MODE_OVERRIDE = `
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
