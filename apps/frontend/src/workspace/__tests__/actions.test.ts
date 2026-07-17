import { describe, it, expect, vi } from 'vitest';
import { executeAnalyze } from '../actions/analyze';

describe('executeAnalyze', () => {
  it('should early exit if draft is empty', async () => {
    const mockCtx = {
      draft: '',
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
      setAnalysis: vi.fn(),
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
      analyzeAbortControllerRef: { current: null },
      draftChunkBufferRef: { current: '' },
      rafIdRef: { current: null },
      checkMissingSources: vi.fn(() => []),
      setMissingSources: vi.fn(),
      setPendingRefineAction: vi.fn(),
      setShowMissingSourcesModal: vi.fn(),
    };

    await executeAnalyze(mockCtx);
    expect(mockCtx.directFetch).not.toHaveBeenCalled();
    expect(mockCtx.setAnalysis).not.toHaveBeenCalled();
  });
});
