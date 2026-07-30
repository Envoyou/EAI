import type { ArticleMetadata } from '@eai/shared';
import type { EditorialProfileSnapshot } from '@eai/shared/server';
import { RefinementPromptComposer } from './prompt-engine/composer/refinement-composer';
import type { AiProvider, AnalysisSpeed } from './provider-runtime';
import { getProvider } from './providers/registry';
import { resolveModel } from './model-router';
import { executeGenerate } from './runtime/execute-generate';
import { composeWorkspaceContext } from './workspace-context';
import type { AiTelemetryCollector } from '@/lib/ai-telemetry';
import { detectSourceFidelitySignals } from '@/lib/final-quality';
import { replaceFirstTargetMatch, ResearchNotesArraySchema } from '@eai/shared';
import { buildAttachmentContext } from './prompt-context';

export const runTargetedFixStage = async ({
  provider,
  analysisSpeed,
  article,
  originalDraft,
  targetText,
  feedback,
  editorInstruction,
  metadata: _metadata,
  editorialProfile,
  telemetry,
  modelOverride,
  signal,
}: {
  provider: AiProvider;
  analysisSpeed?: AnalysisSpeed;
  article: string;
  originalDraft: string;
  targetText: string;
  feedback: string;
  editorInstruction: string;
  metadata?: ArticleMetadata;
  editorialProfile: EditorialProfileSnapshot;
  telemetry: AiTelemetryCollector;
  modelOverride?: string | null;
  signal?: AbortSignal;
}): Promise<{ replacementText: string; modelName: string }> => {
  const timezone = editorialProfile.config.timezone || 'Asia/Jakarta';
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

  const parsedNotes = ResearchNotesArraySchema.safeParse(
    _metadata?.researchNotes
  );
  const researchNotes = parsedNotes.success ? parsedNotes.data : [];
  const notesSummary = researchNotes
    .map((note, index) => {
      const sourceUrls = note.sources?.map((source) => source.url).join(', ');
      return [
        `Note ${index + 1}: ${note.content}`,
        sourceUrls ? `Sources: ${sourceUrls}` : '',
      ].filter(Boolean).join('\n');
    })
    .join('\n\n');
  const sourceMaterial = [
    originalDraft,
    ...researchNotes.map((note) => [
      note.content,
      ...(note.sources?.map((source) => source.url) ?? []),
    ].join('\n')),
  ].filter(Boolean).join('\n\n');

  const { xml: workspaceXml, agentInstruction } = composeWorkspaceContext({
    today: currentDate,
    timezone,
    profileConfig: editorialProfile.config,
    notesSummary: notesSummary || null,
    attachment: buildAttachmentContext(_metadata?.attachments),
  });

  const baseSystemInstruction = `${new RefinementPromptComposer(
    'targeted_fix',
    editorialProfile.config
  ).compose('xml')}\n\n${agentInstruction}`;

  const baseContents = [
    workspaceXml,
    '<source_draft>',
    originalDraft,
    '</source_draft>',
    '',
    '<article_draft>',
    article,
    '</article_draft>',
    '',
    '<target_text>',
    targetText,
    '</target_text>',
    '',
    '<feedback>',
    feedback,
    '</feedback>',
    '',
    '<editor_instruction>',
    editorInstruction,
    '</editor_instruction>',
    '',
    '<task>',
    'Based on the preceding article context, return only a concise replacement for targetText that resolves the feedback and follows editorInstruction.',
    '</task>'
  ].join('\n');

  const aiProvider = getProvider(provider);
  const modelName = resolveModel(
    provider,
    'editor',
    analysisSpeed ?? 'balanced',
    modelOverride
  );

  const baselineSignals = detectSourceFidelitySignals(
    sourceMaterial || originalDraft,
    article,
    {
      trustedEntities: [editorialProfile.config.brandName],
      allowedEditorialTerms: editorialProfile.config.allowedEditorialTerms,
    }
  );
  const baseline = {
    numbers: new Set(baselineSignals.novelNumbers),
    entities: new Set(baselineSignals.novelEntities),
    urls: new Set(baselineSignals.novelUrls),
  };
  let correction = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await executeGenerate({
      provider: aiProvider,
      request: {
        signal,
        systemInstruction: `${baseSystemInstruction}${correction}`,
        userContent: baseContents,
        model: modelName,
        maxOutputTokens: 800,
        temperature: 0.2,
        thinkingLevel: provider === 'gemini' ? 'medium' : undefined,
      },
      telemetry,
      stage: 'targeted_fix',
      attempt,
    });
    const replacementText = result.text.replace(/^["']|["']$/g, '').trim();
    const candidate = replaceFirstTargetMatch(article, targetText, replacementText);
    if (!candidate.success) {
      throw new Error('The targeted text changed before the replacement could be validated.');
    }

    const candidateSignals = detectSourceFidelitySignals(
      sourceMaterial || originalDraft,
      candidate.nextText,
      {
        trustedEntities: [editorialProfile.config.brandName],
        allowedEditorialTerms: editorialProfile.config.allowedEditorialTerms,
      }
    );
    const introduced = [
      ...candidateSignals.novelNumbers.filter((value) => !baseline.numbers.has(value)),
      ...candidateSignals.novelEntities.filter((value) => !baseline.entities.has(value)),
      ...candidateSignals.novelUrls.filter((value) => !baseline.urls.has(value)),
    ];
    if (introduced.length === 0) {
      return { modelName, replacementText };
    }

    correction = `

<retry_correction>
The proposed replacement introduced source-fidelity signals that were absent from both the current article and supplied source material: ${introduced.slice(0, 6).join(', ')}.
Rewrite the target again without adding those or any other new number, named entity, identity attribute, or URL.
</retry_correction>`;
  }

  throw new Error(
    'EAI could not produce a source-safe replacement after two attempts. Apply this finding manually or add a supporting source.'
  );
};
