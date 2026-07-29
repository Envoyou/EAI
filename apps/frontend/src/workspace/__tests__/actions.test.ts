import { describe, it, expect, vi } from 'vitest';
import type { AnalysisResult } from '@eai/shared';
import { executeAnalyze } from '../actions/analyze';

const createAnalyzeContext = (
  draft: string,
  initialAnalysis: AnalysisResult = { status: 'idle' }
) => {
  let currentAnalysis = initialAnalysis;
  const setAnalysis = vi.fn(
    (updater: (previous: AnalysisResult) => AnalysisResult) => {
      currentAnalysis = updater(currentAnalysis);
    }
  );

  const context = {
      analysis: initialAnalysis,
      draft,
      sourceDraft: 'Previously committed source draft.',
      metadata: {},
      researchNotes: [],
      attachments: [],
      editorialOptions: {
        brandName: 'Envoyou',
        categories: [],
        articleTypes: [],
        sourcePolicy: 'standard' as const,
        isPersonal: false,
        maxTextLength: 15000,
        cmsExportEnabled: false,
        activePlan: 'free',
      },
      appSettings: {
        autoSave: true,
        outputLanguage: 'id' as const,
        themeMode: 'dark' as const,
        strictness: 'balanced' as const,
        profile: {
          displayName: 'Editorial Team',
          role: 'editor' as const,
          language: 'en' as const,
        },
        defaultMetadata: {
          category: '',
          type: '',
          targetAudience: '',
          targetLength: '',
          strictness: 'balanced' as const,
          outputLanguage: 'follow_draft' as const,
        }
      },
      analysisSpeed: 'fast' as const,
      isDemoMode: false,
      demoRefineCount: 0,
      isMobile: false,
      directFetch: vi.fn(),
      setDraft: vi.fn(),
      setDraftHistory: vi.fn(),
      setSourceDraft: vi.fn(),
      setAnalysis,
      setIsStreaming: vi.fn(),
      setProcessStage: vi.fn(),
      setProcessStartedAt: vi.fn(),
      setActiveTab: vi.fn(),
      setRightPanelOpen: vi.fn(),
      setRightPanelTab: vi.fn(),
      setMobileViewTab: vi.fn(),
      setDemoRefineCount: vi.fn(),
      setShowDemoSignupModal: vi.fn(),
      setRefreshTrigger: vi.fn(),
      analyzeAbortControllerRef: {
        current: null as AbortController | null,
      },
      draftChunkBufferRef: { current: '' },
      rafIdRef: { current: null },
      checkMissingSources: vi.fn(() => []),
      setMissingSources: vi.fn(),
      setPendingRefineAction: vi.fn(),
      setShowMissingSourcesModal: vi.fn(),
  };

  return {
    context,
    getAnalysis: () => currentAnalysis,
  };
};

describe('executeAnalyze', () => {
  it('should early exit if draft is empty', async () => {
    const { context } = createAnalyzeContext('');

    await executeAnalyze(context);
    expect(context.directFetch).not.toHaveBeenCalled();
    expect(context.setAnalysis).not.toHaveBeenCalled();
  });

  it('restores the previous completed result when a repeated analysis is cancelled', async () => {
    const previousAnalysis: AnalysisResult = {
      status: 'success',
      polishedDraft: 'Previously completed final draft.',
      summary: 'Previous complete result.',
      feedback: [],
      flags: [],
    };
    const { context, getAnalysis } = createAnalyzeContext(
      'Draft to analyze',
      previousAnalysis
    );
    context.directFetch.mockImplementation(async () => {
      context.analyzeAbortControllerRef.current?.abort();
      throw new DOMException('Aborted', 'AbortError');
    });

    await executeAnalyze(context);

    expect(getAnalysis()).toEqual(previousAnalysis);
    expect(context.setIsStreaming).toHaveBeenLastCalledWith(false);
    expect(context.setSourceDraft).toHaveBeenLastCalledWith(
      'Previously committed source draft.'
    );
  });

  it('does not start a second analysis while an AI request owns the controller', async () => {
    const { context } = createAnalyzeContext('Draft to analyze');
    context.analyzeAbortControllerRef.current = new AbortController();

    await executeAnalyze(context);

    expect(context.directFetch).not.toHaveBeenCalled();
    expect(context.setAnalysis).not.toHaveBeenCalled();
  });
});
