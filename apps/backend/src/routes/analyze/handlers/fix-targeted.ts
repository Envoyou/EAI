/**
 * Handler for fix_targeted mode.
 * Validates targetText, calls runTargetedFixStage, streams replacement.
 * Extracted from analyze.ts L1147–1195 (zero logic change).
 * Throws on error — controller's try/catch handles SSE error + res.end().
 */

import type { FixTargetedContext } from '../types';
import { runTargetedFixStage } from '@/lib/ai/targeted-fix-stage';

export async function handleFixTargeted(ctx: FixTargetedContext): Promise<void> {
  const {
    sendEvent,
    state,
    text,
    metadata,
    targetText,
    feedbackMessage,
    instruction,
    originalDraft,
    analysisSpeed,
    effectiveProvider,
    workspace,
    editorialProfile,
  } = ctx;

  if (!targetText?.trim()) {
    sendEvent('error', 'targetText is required for fix_targeted mode');
    return;
  }

  const maxLength = workspace?.plan?.maxTextLength ?? 15000;
  if (text && text.length > maxLength) {
    sendEvent('error', `Draft is too long. Maximum ${maxLength} characters.`);
    return;
  }

  sendEvent('status', 'rewriting');
  let replacementText: string;

  const missingGeminiKey =
    !process.env.GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY === 'empty' ||
    process.env.GEMINI_API_KEY === 'your-api-key-here';
  const missingGroqKey =
    !process.env.GROQ_API_KEY ||
    process.env.GROQ_API_KEY === 'empty' ||
    process.env.GROQ_API_KEY === 'your-groq-api-key';
  const missingOpenRouterKey =
    !process.env.OPENROUTER_API_KEY ||
    process.env.OPENROUTER_API_KEY === 'empty' ||
    process.env.OPENROUTER_API_KEY === 'your-openrouter-api-key';

  if (
    (effectiveProvider === 'gemini' && missingGeminiKey) ||
    (effectiveProvider === 'groq' && missingGroqKey) ||
    (effectiveProvider === 'openrouter' && missingOpenRouterKey)
  ) {
    replacementText = targetText.trim();
  } else {
    const targetedResult = await runTargetedFixStage({
      signal: state.signal,
      provider: effectiveProvider,
      analysisSpeed,
      article: text ?? '',
      originalDraft: originalDraft || text || '',
      targetText,
      feedback: feedbackMessage || 'Address this editorial issue',
      editorInstruction: instruction || 'Fix and simplify the text',
      metadata,
      editorialProfile,
    });
    state.usedModels.push(`${targetedResult.modelName}(fix_targeted)`);
    replacementText = targetedResult.replacementText;
  }

  sendEvent('replacement', replacementText);
  sendEvent('complete', {});
}
