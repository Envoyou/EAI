import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';

const router = Router();

function cleanHtml(html: string): string {
  // Remove script, style, head, nav, footer, and other noisy markup
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
    let content = match[2]
      .replace(/<[^>]+>/g, '') // Strip remaining inline HTML tags
      .trim();

    // Decode HTML entities
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
      .replace(/\s+/g, ' '); // Collapse spaces

    if (content.length > 10) {
      if (tag.startsWith('h')) {
        matches.push(`\n## ${content}\n`);
      } else {
        matches.push(content);
      }
    }
  }

  return matches.join('\n');
}

// POST /api/scrape
router.post('/', requireAuth, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.trim()) {
      return res.status(400).json({ error: 'URL is required' });
    }

    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000); // 8-second timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });
    clearTimeout(id);

    if (!response.ok) {
      return res.status(response.status === 404 || response.status === 403 ? response.status : 400).json({
        error: `Failed to fetch URL: ${response.status} ${response.statusText}. Please verify the link or copy the text manually.`
      });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return res.status(400).json({ error: 'Only HTML or text resources are supported.' });
    }

    const html = await response.text();
    const cleanText = cleanHtml(html);

    if (!cleanText.trim()) {
      return res.status(422).json({
        error: 'No readable text content could be extracted. The website might be protected or client-rendered.'
      });
    }

    const maxChars = 12000;
    const resultText = cleanText.length > maxChars
      ? cleanText.slice(0, maxChars) + '\n\n[Content truncated for length limit]'
      : cleanText;

    return res.json({ text: resultText });

  } catch (error: unknown) {
    console.error('URL Scrape error:', error);
    if (error instanceof Error && error.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timed out. The website is slow or unreachable.' });
    }
    return res.status(500).json({
      error: 'An error occurred while fetching the URL. The site might be blocking scrapers or paywalled.'
    });
  }
});

export default router;
