import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import {
  gemini,
  getGeminiModelForRole,
  getGeminiSamplingConfig,
  extractGeminiText,
} from '@/lib/ai/provider-runtime';

const router = Router();

router.post('/ai-action', requireAuth, async (req, res) => {
  try {
    const { action, selectionMarkdown, contextMarkdown } = req.body;
    
    if (!action || !selectionMarkdown) {
      return res.status(400).json({ error: 'Missing action or selectionMarkdown' });
    }

    let prompt = '';
    
    switch (action) {
      case 'expand':
        prompt = `Expand the following text to provide more detail and depth, keeping the original tone intact. Return ONLY the expanded text in Markdown without any prefix or conversational filler.\n\nContext:\n${contextMarkdown}\n\nText to expand:\n${selectionMarkdown}`;
        break;
      case 'shorten':
        prompt = `Shorten the following text to be more concise while retaining the core message. Return ONLY the shortened text in Markdown without any prefix or conversational filler.\n\nContext:\n${contextMarkdown}\n\nText to shorten:\n${selectionMarkdown}`;
        break;
      case 'rewrite':
        prompt = `Rewrite the following text for better flow, clarity, and engagement. Return ONLY the rewritten text in Markdown without any prefix or conversational filler.\n\nContext:\n${contextMarkdown}\n\nText to rewrite:\n${selectionMarkdown}`;
        break;
      case 'seo_optimize':
        prompt = `Optimize the following text for SEO, incorporating natural keywords without sounding robotic. Return ONLY the optimized text in Markdown without any prefix or conversational filler.\n\nContext:\n${contextMarkdown}\n\nText to optimize:\n${selectionMarkdown}`;
        break;
      case 'add_citation':
        prompt = `Add a relevant context or citation reference to this text, using the provided context if helpful. Return ONLY the updated text in Markdown without any prefix or conversational filler.\n\nContext:\n${contextMarkdown}\n\nText:\n${selectionMarkdown}`;
        break;
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    // Call Gemini. For inline fast edits, 'fast' speed is usually appropriate.
    const model = getGeminiModelForRole('polish', 'fast');
    const samplingConfig = getGeminiSamplingConfig(model, 0.7);
    
    const response = await gemini.models.generateContent({
      model,
      contents: prompt,
      config: samplingConfig,
    });
    
    const content = extractGeminiText(response);
    const tokens = response.usageMetadata?.totalTokenCount || 0;

    return res.json({
      content,
      metadata: {
        tokens,
        action,
      }
    });

  } catch (error) {
    console.error('[Editor AI Action Error]', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: 'Internal Server Error', details: errorMessage });
  }
});

export default router;
