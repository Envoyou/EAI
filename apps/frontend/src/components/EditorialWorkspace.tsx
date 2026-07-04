'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCcw, Sparkles, Cloud, FileText, Upload, Layers, X } from 'lucide-react';
import { MotionConfig } from 'framer-motion';
import { toast } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

import Editor from '@/components/Editor';
import SourcesPanel from '@/components/SourcesPanel';
import StudioReviewPanel from '@/components/StudioReviewPanel';
import ContentStrategistWizard from '@/components/ContentStrategistWizard';
import ShortcutsModal from '@/components/ShortcutsModal';

import { AnalysisResult, ArticleMetadata, EditorialProcessStage, EditorialReadiness, ResponseMode, FeedbackItem, ResearchNote, Attachment, canAutoApplyFeedback } from '@eai/shared';
import {
  AppSettings,
  DEFAULT_APP_SETTINGS,
  SETTINGS_STORAGE_KEY,
  applyDefaultMetadata,
  normalizeAppSettings,
} from '@/lib/preferences';

/* ── Helpers ─────────────────────────────────────────── */
const extractArticleMetadata = (metadata: unknown): ArticleMetadata => {
  if (!metadata || typeof metadata !== 'object') return {};
  const source = metadata as Record<string, unknown>;
  return {
    category: typeof source.category === 'string' ? source.category : undefined,
    type: typeof source.type === 'string' ? source.type : undefined,
    targetAudience: typeof source.targetAudience === 'string' ? source.targetAudience : undefined,
    targetLength: typeof source.targetLength === 'string' ? source.targetLength : undefined,
    strictness: source.strictness === 'strict' || source.strictness === 'balanced' ? source.strictness : undefined,
    outputLanguage: source.outputLanguage === 'id' || source.outputLanguage === 'en' || source.outputLanguage === 'follow_draft' ? source.outputLanguage : undefined,
    sourceRef: typeof source.sourceRef === 'string' ? source.sourceRef : undefined,
    exportStatus: source.exportStatus as ArticleMetadata['exportStatus'],
  };
};

const extractResponseMode = (metadata: unknown): ResponseMode | undefined => {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const system = (metadata as Record<string, unknown>)._system;
  if (!system || typeof system !== 'object') return undefined;
  const responseMode = (system as Record<string, unknown>).responseMode;
  if (responseMode === 'standard' || responseMode === 'compact' || responseMode === 'manual_fallback') return responseMode;
  return undefined;
};

const extractPolishedDraft = (metadata: unknown): string | undefined => {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const system = (metadata as Record<string, unknown>)._system;
  if (!system || typeof system !== 'object') return undefined;
  const polishedDraft = (system as Record<string, unknown>).polishedDraft;
  return typeof polishedDraft === 'string' ? polishedDraft : undefined;
};

const extractGeneratedMetadata = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object') return undefined;
  return (metadata as Record<string, unknown>).generatedMetadata as Record<string, unknown> | undefined;
};

const extractQualityGate = (metadata: unknown): {
  readiness?: EditorialReadiness;
  changes?: string[];
} => {
  if (!metadata || typeof metadata !== 'object') return {};
  const system = (metadata as Record<string, unknown>)._system;
  if (!system || typeof system !== 'object') return {};
  const source = system as Record<string, unknown>;
  const readiness: EditorialReadiness | undefined =
    source.readiness === 'ready' || source.readiness === 'needs_review' || source.readiness === 'blocked'
      ? source.readiness
      : undefined;
  return {
    readiness,
    changes: Array.isArray(source.refinementChanges)
      ? source.refinementChanges.filter((item): item is string => typeof item === 'string')
      : undefined,
  };
};


const normalizeProcessStage = (status: unknown): EditorialProcessStage | null => {
  if (status === 'evaluating') return 'reviewing';
  if (status === 'rewriting') return 'rewriting';
  if (status === 'quality_gate') return 'quality_gate';
  if (status === 'generating_seo') return 'seo';
  return null;
};

const getApiErrorMessage = async (response: Response, fallback: string) => {
  const result = await response.json().catch(() => null);
  return typeof result?.error === 'string' ? result.error : fallback;
};

const calculateReadiness = (feedback: FeedbackItem[], originalReadiness?: EditorialReadiness): EditorialReadiness => {
  const unresolved = (feedback || []).filter(
    (item) => item.status !== 'pass' && !item.isAccepted && !item.isVerified
  );

  if (unresolved.length === 0) {
    return 'ready';
  }

  const hasUnresolvedFail = unresolved.some((item) => item.status === 'fail');
  if (hasUnresolvedFail) {
    return originalReadiness === 'blocked' ? 'blocked' : 'needs_review';
  }

  return 'needs_review';
};

const readWithTimeout = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = 45000
): Promise<ReadableStreamReadResult<Uint8Array>> => {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Stream idle timeout: No response received from the server for 45 seconds.'));
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([reader.read(), timeoutPromise]);
    return result;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

/* ── Page ─────────────────────────────────────────────── */
export default function EditorialWorkspace({ mode }: { mode: 'demo' | 'workspace' }) {
  const router = useRouter();
  const [workspaceChecking, setWorkspaceChecking] = useState(true);
  const [editorialOptions, setEditorialOptions] = useState({
    brandName: 'Envoyou',
    categories: [] as string[],
    articleTypes: [] as string[],
    sourcePolicy: 'standard' as 'standard' | 'strict',
    isPersonal: false,
    maxTextLength: 15000,
    cmsExportEnabled: false,
    activePlan: 'free',
  });
  const [draft, setDraft] = useState(() => {
    if (mode !== 'demo') return '';
    if (typeof navigator === 'undefined') return '';
    const isIndo = navigator.language.toLowerCase().startsWith('id');
    const textId = `AI Semakin Banyak Digunakan — Tapi Kualitas Konten Belum Ikut Naik\n\nBanyak perusahaan sekarang pakai AI buat produksi konten...`;
    const textEn = `AI Tools Are Changing How We Work — But Not Always for the Better\n\nMore and more companies are now using AI tools...`;
    return isIndo ? textId : textEn;
  });
  const [metadata, setMetadata] = useState<ArticleMetadata>({});
  const [analysis, setAnalysis] = useState<AnalysisResult>({ status: 'idle' });
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [draftHistory, setDraftHistory] = useState<string[]>([]);
  const [sourceDraft, setSourceDraft] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [processStage, setProcessStage] = useState<EditorialProcessStage>('reviewing');
  const [processStartedAt, setProcessStartedAt] = useState<number | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);

  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoRefineCount, setDemoRefineCount] = useState(0);
  const [showDemoSignupModal, setShowDemoSignupModal] = useState(false);

  // RAF batching refs
  const draftChunkBufferRef = useRef('');
  const rafIdRef = useRef<number | null>(null);

  // Responsive layout state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Center column Canvas tab ('chat' | 'editor')
  const [canvasTab, setCanvasTab] = useState<'chat' | 'editor'>('editor');

  // Mobile navigation tab ('sources' | 'chat' | 'editor' | 'review')
  const [mobileTab, setMobileTab] = useState<'sources' | 'chat' | 'editor' | 'review'>('editor');

  // Feedback highlighting
  const [hoveredFeedbackIndex, setHoveredFeedbackIndex] = useState<number | null>(null);
  const [activeFeedbackIndex, setActiveFeedbackIndex] = useState<number | null>(null);

  // Research Notes
  const [researchNotes, setResearchNotes] = useState<ResearchNote[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(sessionStorage.getItem('eai_research_notes') || '[]');
    } catch {
      return [];
    }
  });

  // Source Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);

  const [analysisSpeed, setAnalysisSpeed] = useState<'fast' | 'publish'>('publish');
  const [isTargetedFixing, setIsTargetedFixing] = useState<number | null>(null);
  const [isSavingToCloud, setIsSavingToCloud] = useState(false);

  const handleCloudSave = async () => {
    if (isDemoMode) return;
    setIsSavingToCloud(true);
    try {
      const response = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: draft,
          metadata: {
            ...metadata,
            researchNotes,
            attachments,
          },
        }),
      });

      if (!response.ok) throw new Error('Failed to create manual draft');
      const result = await response.json();
      if (result.id) {
        setActiveHistoryId(result.id);
        if (typeof window !== 'undefined') {
          localStorage.setItem('eai-active-history-id', result.id);
        }
        setRefreshTrigger(prev => prev + 1);
        toast.success('Draft synced to cloud');
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to sync draft to cloud');
    } finally {
      setIsSavingToCloud(false);
    }
  };

  const handleNotesChange = (notes: ResearchNote[]) => {
    setResearchNotes(notes);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('eai_research_notes', JSON.stringify(notes));
    }
  };

  // Generate Draft from Notes
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const handleGenerateDraftFromNotes = async () => {
    if (researchNotes.length === 0) {
      toast.error('No notes available to generate a draft.');
      return;
    }
    setIsGeneratingDraft(true);
    setDraft('');
    setCanvasTab('editor');
    setMobileTab('editor');

    try {
      const response = await fetch('/api/strategist/generate-draft-from-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: researchNotes, metadata }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate draft: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let buffer = '';
      let currentDraft = '';

      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;

        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'text') {
              currentDraft += data.chunk;
              setDraft(currentDraft);
            } else if (data.type === 'error') {
              toast.error(data.message);
            }
          }
        }
      }
      toast.success('Draft generated successfully!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate draft');
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const handleInsertNoteToDraft = (content: string) => {
    const insertText = `\n\n---\n<!-- Research Note -->\n${content}`;
    setDraft(prev => prev + insertText);
    toast.success('Note inserted to draft');
  };

  // Autosave to cloud database (debounced)
  useEffect(() => {
    if (!isLoaded || !activeHistoryId || isDemoMode) return;

    const controller = new AbortController();
    setIsSavingToCloud(true);

    const timer = setTimeout(async () => {
      try {
        await fetch(`/api/history/${activeHistoryId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            action: 'autosave_draft',
            content: draft,
            notes: researchNotes,
            metadata: {
              ...metadata,
              attachments,
            }
          }),
        });
      } catch (err: unknown) {
        if ((err as Record<string, unknown>)?.name !== 'AbortError') {
          console.error('Error in autosave:', err);
        }
      } finally {
        setIsSavingToCloud(false);
      }
    }, 1500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draft, researchNotes, metadata, attachments, activeHistoryId, isLoaded, isDemoMode]);

  useEffect(() => {
    if (mode === 'demo') {
      setIsDemoMode(true);
      setAnalysisSpeed('fast');
      setEditorialOptions({
        brandName: 'Envoyou (Demo)',
        categories: ['Technology & AI', 'Digital Creator', 'Data & Insight', 'Finance & Investment'],
        articleTypes: ['News & Trend Analysis', 'Opinion / Op-Ed', 'In-Depth Guide / Explainer', 'How-To / Tutorial'],
        sourcePolicy: 'strict',
        isPersonal: true,
        maxTextLength: 5000,
        cmsExportEnabled: false,
        activePlan: 'demo',
      });
      setWorkspaceChecking(false);

      const html = document.documentElement;
      const prevClass = html.className;
      html.classList.add('dark');
      return () => { html.className = prevClass; };
    }
  }, [mode]);

  useEffect(() => {
    if (mode === 'demo') return;

    fetch('/api/workspace/config', { cache: 'no-store' })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace('/login');
          return;
        }
        const result = await response.json();
        if (response.status === 409) {
          router.replace('/onboarding');
          return;
        }
        if (!response.ok) throw new Error(result.error || 'Unable to load workspace.');
        const nextOptions = {
          brandName: result.editorial.brandName as string,
          categories: result.editorial.categories as string[],
          articleTypes: result.editorial.articleTypes as string[],
          sourcePolicy: (result.editorial.sourcePolicy || 'standard') as 'standard' | 'strict',
          isPersonal: Boolean(result.organization?.slug?.startsWith('personal-')),
          maxTextLength: (result.plan?.maxTextLength || 15000) as number,
          cmsExportEnabled: Boolean(result.capabilities?.cmsExport),
          activePlan: (result.plan?.activePlan || 'free') as string,
        };
        setEditorialOptions(nextOptions);
        setMetadata((current) => ({
          ...current,
          category: current.category && nextOptions.categories.includes(current.category) ? current.category : undefined,
          type: current.type && nextOptions.articleTypes.includes(current.type) ? current.type : undefined,
        }));
        setAppSettings((current) => ({
          ...current,
          defaultMetadata: {
            ...current.defaultMetadata,
            category: current.defaultMetadata.category && nextOptions.categories.includes(current.defaultMetadata.category) ? current.defaultMetadata.category : '',
            type: current.defaultMetadata.type && nextOptions.articleTypes.includes(current.defaultMetadata.type) ? current.defaultMetadata.type : '',
          },
        }));
        setWorkspaceChecking(false);
      })
      .catch(() => router.replace('/onboarding'));
  }, [router, mode]);

  // Recover from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      let nextSettings = DEFAULT_APP_SETTINGS;
      if (savedSettings) {
        try { nextSettings = normalizeAppSettings(JSON.parse(savedSettings)); } catch { }
      }
      const savedDraft = localStorage.getItem('eai-draft');
      const savedMeta = localStorage.getItem('eai-metadata');
      const savedAnalysis = localStorage.getItem('eai-analysis');
      const savedHistoryId = localStorage.getItem('eai-active-history-id');
      const savedSourceDraft = localStorage.getItem('eai-source-draft');
      const savedSpeed = localStorage.getItem('eai-analysis-speed');
      const savedDemoCount = localStorage.getItem('eai-demo-refine-count');

      setAppSettings(nextSettings);
      if (savedDraft !== null) setDraft(savedDraft);
      if (savedMeta !== null) {
        try { setMetadata(JSON.parse(savedMeta)); } catch { }
      } else {
        setMetadata(applyDefaultMetadata(nextSettings.defaultMetadata));
      }
      if (savedAnalysis !== null) {
        try { setAnalysis(JSON.parse(savedAnalysis)); } catch { }
      }
      if (savedHistoryId !== null) setActiveHistoryId(savedHistoryId || null);
      if (savedSourceDraft !== null) setSourceDraft(savedSourceDraft);
      if (savedSpeed === 'fast' || savedSpeed === 'publish') setAnalysisSpeed(savedSpeed);
      if (savedDemoCount !== null) setDemoRefineCount(parseInt(savedDemoCount, 10) || 0);

      setIsLoaded(true);
    }
  }, []);

  // Autosave to localStorage
  useEffect(() => {
    if (isLoaded && typeof window !== 'undefined') {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(appSettings));
    }
  }, [appSettings, isLoaded]);

  useEffect(() => {
    if (isLoaded && appSettings.autoSave && typeof window !== 'undefined') {
      localStorage.setItem('eai-draft', draft);
    }
  }, [draft, isLoaded, appSettings.autoSave]);

  useEffect(() => {
    if (isLoaded && appSettings.autoSave && typeof window !== 'undefined') {
      localStorage.setItem('eai-metadata', JSON.stringify(metadata));
    }
  }, [metadata, isLoaded, appSettings.autoSave]);

  useEffect(() => {
    if (isLoaded && appSettings.autoSave && typeof window !== 'undefined') {
      localStorage.setItem('eai-analysis', JSON.stringify(analysis));
    }
  }, [analysis, isLoaded, appSettings.autoSave]);

  useEffect(() => {
    if (isLoaded && appSettings.autoSave && typeof window !== 'undefined') {
      localStorage.setItem('eai-active-history-id', activeHistoryId || '');
    }
  }, [activeHistoryId, isLoaded, appSettings.autoSave]);

  useEffect(() => {
    if (isLoaded && appSettings.autoSave && typeof window !== 'undefined') {
      localStorage.setItem('eai-source-draft', sourceDraft);
    }
  }, [sourceDraft, isLoaded, appSettings.autoSave]);

  useEffect(() => {
    if (isLoaded && typeof window !== 'undefined') {
      localStorage.setItem('eai-analysis-speed', analysisSpeed);
    }
  }, [analysisSpeed, isLoaded]);

  // Responsive resize
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Shortcuts modal trigger
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        setIsShortcutModalOpen(p => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  /* ── Analyze ── */
  const handleAnalyze = async (overrideDraft?: string) => {
    const textToAnalyze = overrideDraft ?? draft;
    if (!textToAnalyze.trim()) return;

    if (isDemoMode && demoRefineCount >= 2) {
      setShowDemoSignupModal(true);
      return;
    }

    if (overrideDraft) {
      setDraftHistory(prev => [...prev, draft]);
      setDraft(overrideDraft);
    }

    setSourceDraft(textToAnalyze);
    setAnalysis({ status: 'loading', readiness: undefined, changes: [], summary: '', polishedDraft: '', feedback: [], flags: [] });
    setIsStreaming(true);
    setProcessStage('reviewing');
    setProcessStartedAt(Date.now());
    
    // Switch Tab to Editor Canvas & Review Panel
    setCanvasTab('editor');
    setMobileTab('review');

    try {
      const requestMetadata: ArticleMetadata = {
        ...metadata,
        strictness: editorialOptions.sourcePolicy === 'strict' ? 'strict' : 'balanced',
        outputLanguage: appSettings.outputLanguage,
      };

      // Filter active attachments based on checked IDs in Kolom Kiri
      const activeAttachments = attachments.filter(a => selectedAttachmentIds.includes(a.id));

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToAnalyze,
          role: 'polish',
          metadata: {
            ...requestMetadata,
            researchNotes,
            attachments: activeAttachments,
          },
          analysisSpeed: analysisSpeed === 'publish' ? 'deep' : 'fast',
        }),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to start analysis stream.'));
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response body reader not available');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await readWithTimeout(reader);
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: { type: string; data: unknown };
          try { event = JSON.parse(line); } catch (e) { console.error(e); continue; }

          switch (event.type) {
            case 'status': {
              const nextStage = normalizeProcessStage(event.data);
              if (nextStage) setProcessStage(nextStage);
              break;
            }
            case 'score': setAnalysis(prev => ({ ...prev, status: 'success', score: event.data as number })); break;
            case 'verdict': setAnalysis(prev => ({ ...prev, status: 'success', verdict: event.data as 'approve' | 'revise' | 'reject' })); break;
            case 'readiness': setAnalysis(prev => ({ ...prev, status: 'success', readiness: event.data as EditorialReadiness, verdict: event.data as EditorialReadiness, score: undefined })); break;
            case 'changes': setAnalysis(prev => ({ ...prev, status: 'success', changes: event.data as string[] })); break;
            case 'feedback_reset': setAnalysis(prev => ({ ...prev, status: 'success', feedback: [], flags: [] })); break;
            case 'summary': setAnalysis(prev => ({ ...prev, status: 'success', summary: event.data as string })); break;
            case 'feedback_item': setAnalysis(prev => {
              const currentFeedback = prev.feedback ? [...prev.feedback] : [];
              const { item, index } = event.data as { item: FeedbackItem; index: number };
              currentFeedback[index] = item;
              return { ...prev, status: 'success', feedback: currentFeedback };
            }); break;
            case 'flags': setAnalysis(prev => ({ ...prev, status: 'success', flags: event.data as string[] })); break;
            case 'draft_chunk': {
              draftChunkBufferRef.current += event.data as string;
              if (rafIdRef.current === null) {
                rafIdRef.current = requestAnimationFrame(() => {
                  const buffered = draftChunkBufferRef.current;
                  draftChunkBufferRef.current = '';
                  rafIdRef.current = null;
                  
                  // Stream directly into the Editor Canvas text
                  setDraft(prev => prev + buffered);
                  setAnalysis(prev => ({
                    ...prev,
                    polishedDraft: (prev.polishedDraft || '') + buffered,
                  }));
                });
              }
              break;
            }
            case 'draft_final':
              draftChunkBufferRef.current = '';
              if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
              }
              setDraft(event.data as string);
              setAnalysis(prev => ({ ...prev, status: 'success', polishedDraft: event.data as string }));
              break;
            case 'seo_metadata': setAnalysis(prev => ({ ...prev, status: 'success', generatedMetadata: event.data as Record<string, unknown> })); break;
            case 'reset':
              setProcessStage('reviewing');
              setAnalysis({ status: 'loading', readiness: undefined, changes: [], summary: '', polishedDraft: '', feedback: [], flags: [] });
              break;
            case 'complete': {
              setProcessStage('finalizing');
              const { analysisLogId, sourceRef } = event.data as { analysisLogId: string; sourceRef: string };
              setAnalysis(prev => ({ ...prev, status: 'success', analysisLogId, sourceRef }));
              if (sourceRef) setMetadata(prev => ({ ...prev, sourceRef }));
              break;
            }
            case 'error': throw new Error(event.data as string);
          }
        }
      }
      toast.success('Refinement Complete');
      setRefreshTrigger(prev => prev + 1);

      if (isDemoMode) {
        const nextCount = demoRefineCount + 1;
        setDemoRefineCount(nextCount);
        localStorage.setItem('eai-demo-refine-count', nextCount.toString());
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'An unexpected error occurred';
      setAnalysis({ status: 'error', errorMessage: errorMsg });
      toast.error('Analysis Failed', { description: errorMsg });
    } finally {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (draftChunkBufferRef.current) {
        const remaining = draftChunkBufferRef.current;
        draftChunkBufferRef.current = '';
        setDraft(prev => prev + remaining);
        setAnalysis(prev => ({ ...prev, polishedDraft: (prev.polishedDraft || '') + remaining }));
      }
      setIsStreaming(false);
      setProcessStartedAt(null);
    }
  };

  /* ── Re-analyze ── */
  const handleReanalyze = () => {
    if (draft) {
      handleAnalyze(draft);
    }
  };

  /* ── Refine Again ── */
  const handleRefineAgain = async (instruction: string) => {
    const currentDraft = draft;
    if (!currentDraft?.trim() || isRefining || isStreaming) return;

    if (isDemoMode && demoRefineCount >= 2) {
      toast.error('Create a free account to continue.');
      return;
    }

    setIsRefining(true);
    setProcessStage('rewriting');
    setProcessStartedAt(Date.now());
    draftChunkBufferRef.current = '';
    setDraft('');
    setAnalysis(prev => ({ ...prev, polishedDraft: '', readiness: undefined, changes: [], feedback: [], flags: [], score: undefined, verdict: undefined }));

    try {
      const requestMetadata: ArticleMetadata = {
        ...metadata,
        strictness: editorialOptions.sourcePolicy === 'strict' ? 'strict' : 'balanced',
        outputLanguage: appSettings.outputLanguage,
      };
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: currentDraft,
          mode: 'refine',
          userInstruction: instruction,
          previousFeedback: analysis.feedback,
          metadata: requestMetadata,
          analysisSpeed: analysisSpeed === 'publish' ? 'deep' : 'fast',
        }),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to start refine stream.'));
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response body reader not available');

      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await readWithTimeout(reader);
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let event: { type: string; data: unknown };
          try { event = JSON.parse(line); } catch { continue; }
          switch (event.type) {
            case 'status': {
              const nextStage = normalizeProcessStage(event.data);
              if (nextStage) setProcessStage(nextStage);
              break;
            }
            case 'draft_chunk': {
              draftChunkBufferRef.current += event.data as string;
              if (rafIdRef.current === null) {
                rafIdRef.current = requestAnimationFrame(() => {
                  const buffered = draftChunkBufferRef.current;
                  draftChunkBufferRef.current = '';
                  rafIdRef.current = null;
                  setDraft(prev => prev + buffered);
                  setAnalysis(prev => ({ ...prev, polishedDraft: (prev.polishedDraft || '') + buffered }));
                });
              }
              break;
            }
            case 'draft_final':
              draftChunkBufferRef.current = '';
              if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
              }
              setDraft(event.data as string);
              setAnalysis(prev => ({ ...prev, polishedDraft: event.data as string }));
              break;
            case 'seo_metadata': setAnalysis(prev => ({ ...prev, generatedMetadata: event.data as Record<string, unknown> })); break;
            case 'feedback_reset': setAnalysis(prev => ({ ...prev, feedback: [], flags: [] })); break;
            case 'readiness': setAnalysis(prev => ({ ...prev, readiness: event.data as EditorialReadiness, verdict: event.data as EditorialReadiness })); break;
            case 'summary': setAnalysis(prev => ({ ...prev, summary: event.data as string })); break;
            case 'changes': setAnalysis(prev => ({ ...prev, changes: event.data as string[] })); break;
            case 'feedback_item': setAnalysis(prev => {
              const currentFeedback = prev.feedback ? [...prev.feedback] : [];
              const { item, index } = event.data as { item: FeedbackItem; index: number };
              currentFeedback[index] = item;
              return { ...prev, feedback: currentFeedback };
            }); break;
            case 'flags': setAnalysis(prev => ({ ...prev, flags: event.data as string[] })); break;
            case 'complete': {
              setProcessStage('finalizing');
              const { analysisLogId, sourceRef } = event.data as { analysisLogId?: string; sourceRef?: string };
              if (analysisLogId) setAnalysis(prev => ({ ...prev, analysisLogId }));
              if (sourceRef) setMetadata(prev => ({ ...prev, sourceRef }));
              break;
            }
            case 'error': throw new Error(event.data as string);
          }
        }
      }
      toast.success('Draft refined!');
      setRefreshTrigger(prev => prev + 1);

      if (isDemoMode) {
        const nextCount = demoRefineCount + 1;
        setDemoRefineCount(nextCount);
        localStorage.setItem('eai-demo-refine-count', nextCount.toString());
      }
    } catch {
      toast.error('Refine Failed');
      setDraft(currentDraft);
    } finally {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (draftChunkBufferRef.current) {
        const remaining = draftChunkBufferRef.current;
        draftChunkBufferRef.current = '';
        setDraft(prev => prev + remaining);
        setAnalysis(prev => ({ ...prev, polishedDraft: (prev.polishedDraft || '') + remaining }));
      }
      setIsRefining(false);
      setProcessStartedAt(null);
    }
  };

  /* ── Fix handlers ── */
  const handleApplyFix = (target: string, replacement: string, operation: 'replace' | 'insert_before' | 'insert_after' | 'manual', index: number) => {
    const item = analysis.feedback?.[index];
    if (!item || operation === 'manual') return false;
    const finalDraft = draft || '';
    
    // Simple inline search/replace
    let nextText = finalDraft;
    if (operation === 'replace') {
      const matchIdx = finalDraft.toLowerCase().indexOf(target.toLowerCase());
      if (matchIdx !== -1) {
        nextText = finalDraft.substring(0, matchIdx) + replacement + finalDraft.substring(matchIdx + target.length);
      } else {
        return false;
      }
    } else if (operation === 'insert_before') {
      const matchIdx = finalDraft.toLowerCase().indexOf(target.toLowerCase());
      if (matchIdx !== -1) {
        nextText = finalDraft.substring(0, matchIdx) + replacement + '\n' + finalDraft.substring(matchIdx);
      } else {
        return false;
      }
    } else if (operation === 'insert_after') {
      const matchIdx = finalDraft.toLowerCase().indexOf(target.toLowerCase());
      if (matchIdx !== -1) {
        nextText = finalDraft.substring(0, matchIdx + target.length) + '\n' + replacement + finalDraft.substring(matchIdx + target.length);
      } else {
        return false;
      }
    }

    setDraft(nextText);
    setAnalysis(prev => ({ ...prev, polishedDraft: nextText, readiness: 'needs_review', verdict: 'needs_review' }));
    return true;
  };

  const handleApplyAllFixes = () => {
    const feedback = analysis.feedback || [];
    const autoApplicable = feedback.filter(canAutoApplyFeedback);
    if (autoApplicable.length === 0) { toast.error('No suggestions can be auto-applied'); return; }
    
    let nextText = draft || '';
    let appliedCount = 0;

    autoApplicable.forEach(item => {
      if (item.targetText && item.replacementText && item.operation === 'replace') {
        const matchIdx = nextText.toLowerCase().indexOf(item.targetText.toLowerCase());
        if (matchIdx !== -1) {
          nextText = nextText.substring(0, matchIdx) + item.replacementText + nextText.substring(matchIdx + item.targetText.length);
          appliedCount++;
        }
      }
    });

    if (appliedCount === 0) { toast.error('Auto-apply failed: targets not found.'); return; }
    setDraft(nextText);
    setAnalysis(prev => ({ ...prev, polishedDraft: nextText, readiness: 'needs_review', verdict: 'needs_review' }));
    toast.success(`${appliedCount} suggestions applied.`);
  };

  const handleUndoLastEdit = () => {
    const previousDraft = draftHistory[draftHistory.length - 1];
    if (previousDraft === undefined) { toast.error('No revisions to undo'); return; }
    setDraft(previousDraft);
    setDraftHistory(prev => prev.slice(0, -1));
    toast.success('Last revision undone');
  };

  const handleNewDraft = () => {
    setActiveHistoryId(null);
    setDraft('');
    setSourceDraft('');
    setMetadata(applyDefaultMetadata(appSettings.defaultMetadata));
    setAnalysis({ status: 'idle' });
    setDraftHistory([]);
    setCanvasTab('editor');
    setHoveredFeedbackIndex(null);
    setActiveFeedbackIndex(null);
    setResearchNotes([]);
    setAttachments([]);
    setSelectedAttachmentIds([]);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('eai_research_notes');
    }
  };

  const handleAddNewCategoryOrType = async (type: 'category' | 'articleType', value: string) => {
    if (!value || !value.trim()) return;
    const trimmed = value.trim();
    if (type === 'category' && editorialOptions.categories.includes(trimmed)) return;
    if (type === 'articleType' && editorialOptions.articleTypes.includes(trimmed)) return;

    if (isDemoMode) {
      setEditorialOptions(prev => ({
        ...prev,
        categories: type === 'category' ? [...prev.categories, trimmed] : prev.categories,
        articleTypes: type === 'articleType' ? [...prev.articleTypes, trimmed] : prev.articleTypes,
      }));
      return;
    }

    try {
      const response = await fetch('/api/workspace/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [type]: trimmed }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to save preference.');
      setEditorialOptions(prev => ({
        ...prev,
        categories: result.categories || prev.categories,
        articleTypes: result.articleTypes || prev.articleTypes,
      }));
    } catch (error) {
      console.error(error);
    }
  };

  const loadHistory = async (id: string) => {
    try {
      const res = await fetch(`/api/history/${id}`);
      if (res.ok) {
        const log = await res.json();
        setActiveHistoryId(log.id);
        setDraft(log.content || '');
        setSourceDraft(log.content || '');
        setMetadata(extractArticleMetadata(log.metadata));

        const logMetadata = log.metadata as Record<string, unknown> | null;
        const loadedNotes = (logMetadata?.researchNotes || []) as ResearchNote[];
        setResearchNotes(loadedNotes);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('eai_research_notes', JSON.stringify(loadedNotes));
        }

        const loadedAttachments = (logMetadata?.attachments || []) as Attachment[];
        setAttachments(loadedAttachments);
        setSelectedAttachmentIds(loadedAttachments.map(x => x.id));

        setDraftHistory([]);
        setHoveredFeedbackIndex(null);
        setActiveFeedbackIndex(null);
        const qualityGate = extractQualityGate(log.metadata);
        const legacyOrReadiness = log.verdict as AnalysisResult['verdict'];
        setAnalysis({
          status: log.status, score: log.score, verdict: legacyOrReadiness, readiness: qualityGate.readiness, changes: qualityGate.changes, summary: log.summary,
          polishedDraft: log.polishedDraft || extractPolishedDraft(log.metadata),
          feedback: log.feedback, flags: log.flags, errorMessage: log.errorMessage,
          responseMode: log.responseMode || extractResponseMode(log.metadata),
          analysisLogId: log.id,
          sourceRef: (log.metadata as Record<string, unknown>)?.sourceRef as string | undefined,
          exportStatus: (log.metadata as Record<string, unknown>)?.exportStatus as ArticleMetadata['exportStatus'],
          generatedMetadata: extractGeneratedMetadata(log.metadata) as Record<string, unknown>,
          editorStatus: log.editorStatus,
        });

        // Switch workspace tabs on load
        setCanvasTab('editor');
        setMobileTab('editor');
      } else {
        toast.error('Failed to load history');
      }
    } catch {
      toast.error('A network error occurred');
    }
  };

  const persistEditorialResolution = async (
    feedback: FeedbackItem[],
    readiness: EditorialReadiness,
    polishedDraft: string,
    flags: string[]
  ) => {
    const analysisLogId = analysis.analysisLogId || activeHistoryId;
    if (!analysisLogId) throw new Error('History is not ready. Please try again.');

    const response = await fetch(`/api/history/${analysisLogId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'resolve_editorial_feedback',
        feedback,
        polishedDraft,
        flags: readiness === 'ready' ? [] : flags,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to save decision.');
  };

  const handleAcceptFeedback = async (index: number) => {
    if (!analysis.feedback) return;
    const nextFeedback = [...analysis.feedback];
    nextFeedback[index] = { ...nextFeedback[index], isAccepted: true };
    const nextReadiness = calculateReadiness(nextFeedback, analysis.readiness);
    const nextFlags = nextReadiness === 'ready' ? [] : (analysis.flags || []);
    try {
      await persistEditorialResolution(nextFeedback, nextReadiness, draft || '', nextFlags);
      setAnalysis(prev => ({ ...prev, feedback: nextFeedback, readiness: nextReadiness, flags: nextFlags }));
      toast.success('Editorial decision saved.');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to save decision.';
      toast.error(msg);
    }
  };

  const handleMarkFeedbackVerified = async (index: number) => {
    if (!analysis.feedback) return;
    const nextFeedback = [...analysis.feedback];
    nextFeedback[index] = { ...nextFeedback[index], isVerified: true };
    const nextReadiness = calculateReadiness(nextFeedback, analysis.readiness);
    const nextFlags = nextReadiness === 'ready' ? [] : (analysis.flags || []);
    try {
      await persistEditorialResolution(nextFeedback, nextReadiness, draft || '', nextFlags);
      setAnalysis(prev => ({ ...prev, feedback: nextFeedback, readiness: nextReadiness, flags: nextFlags }));
      toast.success('Verification saved.');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to save verification.';
      toast.error(msg);
    }
  };

  const handleAddFeedbackSource = async (index: number, url: string) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) { toast.error('URL is required.'); return; }
    const item = analysis.feedback?.[index];
    if (!item) return;
    
    const sourceTarget = item.targetText?.trim() || item.message;
    const nextDraft = `${draft.trim()}\n\n[${sourceTarget}](${trimmedUrl})`;

    const nextFeedback = [...(analysis.feedback || [])];
    nextFeedback[index] = { ...nextFeedback[index], isVerified: true, verifiedSource: trimmedUrl };
    const nextReadiness = calculateReadiness(nextFeedback, analysis.readiness);
    const nextFlags = nextReadiness === 'ready' ? [] : (analysis.flags || []);
    try {
      await persistEditorialResolution(nextFeedback, nextReadiness, nextDraft, nextFlags);
      setDraft(nextDraft);
      setAnalysis(prev => ({ ...prev, polishedDraft: nextDraft, feedback: nextFeedback, readiness: nextReadiness, flags: nextFlags }));
      toast.success('Source added and verified.');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to save source.';
      toast.error(msg);
    }
  };

  const handleTargetedFix = async (index: number, actionType: 'remove' | 'fix') => {
    const item = analysis.feedback?.[index];
    if (!item || !item.targetText || isTargetedFixing !== null) return;
    setIsTargetedFixing(index);

    try {
      const instruction = actionType === 'remove'
        ? 'Write a revised version of the text to completely remove or neutralize the editorial addition/novel framework or claim.'
        : `Revise this sentence to fix the following editorial issue: ${item.message}.`;

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: draft || item.targetText,
          mode: 'fix_targeted',
          targetText: item.targetText,
          feedbackMessage: item.message || 'Address this editorial issue',
          instruction: instruction,
          analysisSpeed: analysisSpeed === 'publish' ? 'deep' : 'fast',
        }),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to start targeted fix stream.'));
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response body reader not available');

      const decoder = new TextDecoder();
      let buffer = '';
      let replacementText = '';

      while (true) {
        const { done, value } = await readWithTimeout(reader);
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: { type: string; data: unknown };
          try { event = JSON.parse(line); } catch { continue; }

          if (event.type === 'replacement') {
            replacementText = event.data as string;
          } else if (event.type === 'error') {
            throw new Error(event.data as string);
          }
        }
      }

      if (!replacementText) throw new Error('No replacement text returned by the AI.');

      const finalDraft = draft || '';
      let nextDraft = finalDraft;
      const matchIdx = finalDraft.toLowerCase().indexOf(item.targetText.toLowerCase());
      if (matchIdx !== -1) {
        nextDraft = finalDraft.substring(0, matchIdx) + replacementText + finalDraft.substring(matchIdx + item.targetText.length);
      } else {
        toast.info('Target text was already modified. Marking resolved.');
      }

      const nextFeedback = [...(analysis.feedback || [])];
      nextFeedback[index] = {
        ...nextFeedback[index],
        isVerified: actionType === 'fix',
        isAccepted: actionType === 'remove',
      };
      const nextReadiness = calculateReadiness(nextFeedback, analysis.readiness);
      const nextFlags = nextReadiness === 'ready' ? [] : (analysis.flags || []);
      await persistEditorialResolution(nextFeedback, nextReadiness, nextDraft, nextFlags);
      
      setDraft(nextDraft);
      setAnalysis(prev => ({ ...prev, polishedDraft: nextDraft, feedback: nextFeedback, readiness: nextReadiness, flags: nextFlags }));
      toast.success(actionType === 'remove' ? 'Addition removed successfully!' : 'Sentence fixed successfully!');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'An error occurred';
      toast.error('Fix Failed', { description: msg });
    } finally {
      setIsTargetedFixing(null);
    }
  };

  const handleExport = async () => {
    if (!analysis.analysisLogId || !analysis.sourceRef || !analysis.generatedMetadata?.title) return;
    setIsSavingToCloud(true);
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisLogId: analysis.analysisLogId,
          sourceRef: analysis.sourceRef,
          title: analysis.generatedMetadata.title,
          slug: analysis.generatedMetadata.slug,
          excerpt: analysis.generatedMetadata.excerpt,
          content: draft,
          metaTitle: analysis.generatedMetadata.metaTitle,
          metaDescription: analysis.generatedMetadata.metaDescription,
          category: metadata.category,
          tags: analysis.generatedMetadata.tags,
          coverImageAltText: analysis.generatedMetadata.coverImageAltText,
          coverImagePrompt: analysis.generatedMetadata.coverImageAltText,
        }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        toast.success(`Exported: ${analysis.generatedMetadata.title}`, {
          action: result.editUrl ? {
            label: 'Open Blog Admin',
            onClick: () => window.open(result.editUrl, '_blank'),
          } : undefined,
          duration: 8000,
        });
      } else {
        toast.error('Export failed', { description: result.error });
      }
    } catch {
      toast.error('Export failed: Connection error.');
    } finally {
      setIsSavingToCloud(false);
    }
  };

  // Clear all workspace states
  const handleClearWorkspace = () => {
    setDraft('');
    setSourceDraft('');
    setMetadata(applyDefaultMetadata(appSettings.defaultMetadata));
    setAnalysis({ status: 'idle' });
    setDraftHistory([]);
    setCanvasTab('editor');
    setHoveredFeedbackIndex(null);
    setActiveFeedbackIndex(null);
    setResearchNotes([]);
    setAttachments([]);
    setSelectedAttachmentIds([]);

    sessionStorage.removeItem('eai_strategist_messages');
    sessionStorage.removeItem('eai_strategist_sources');
    sessionStorage.removeItem('eai_strategist_current_plan');
    sessionStorage.removeItem('eai_strategist_deep_research');
    sessionStorage.removeItem('eai_strategist_attachment');
    sessionStorage.removeItem('eai_research_notes');

    toast.success('Workspace cleared');
  };


  if (workspaceChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <TooltipProvider delay={300}>
      <MotionConfig reducedMotion="user">
        <div className="flex flex-col h-screen overflow-hidden relative bg-[var(--background)]">
          
          {/* DESKTOP LAYOUT (>= 1024px) */}
          {!isMobile && (
            <div className="flex-1 grid grid-cols-[280px_1fr_400px] min-h-0 overflow-hidden">
              
              {/* Kolom Kiri: Sources & History */}
              <SourcesPanel
                onSelect={loadHistory}
                onNew={handleNewDraft}
                activeId={activeHistoryId}
                refreshTrigger={refreshTrigger}
                sidebarOpen={sidebarOpen}
                onToggleSidebar={() => setSidebarOpen(p => !p)}
                isDemoMode={isDemoMode}
                activePlan={editorialOptions.activePlan}
                attachments={attachments}
                onAttachmentsChange={setAttachments}
                selectedAttachmentIds={selectedAttachmentIds}
                onSelectedAttachmentsChange={setSelectedAttachmentIds}
              />

              {/* Kolom Tengah: Canvas (Chat / Editor) */}
              <div className="flex flex-col h-full min-h-0 overflow-hidden border-r border-[var(--border)]">
                
                {/* Titlebar Path & Global Actions */}
                <header className="ide-titlebar h-12 px-4 shrink-0 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-1)]" role="banner">
                  <div className="flex items-center gap-2 select-none">
                    <span className="text-xs font-bold text-[var(--foreground)] tracking-tight">EAI Canvas</span>
                    <span className="text-[11px] text-[var(--muted-foreground)]">/</span>
                    <span className="text-[12px] font-medium text-[var(--muted-foreground)] capitalize">
                      {canvasTab === 'chat' ? 'Content Strategist' : 'Tiptap Drafting'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Canvas Tab switcher */}
                    <div className="flex items-center bg-[var(--surface-2)] p-0.5 rounded-lg border border-[var(--border)]">
                      <button
                        onClick={() => setCanvasTab('chat')}
                        className={`px-3 py-1 text-xs font-semibold rounded-md border-none cursor-pointer ${
                          canvasTab === 'chat' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'bg-transparent text-[var(--muted-foreground)]'
                        }`}
                      >
                        AI Strategist
                      </button>
                      <button
                        onClick={() => setCanvasTab('editor')}
                        className={`px-3 py-1 text-xs font-semibold rounded-md border-none cursor-pointer ${
                          canvasTab === 'editor' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'bg-transparent text-[var(--muted-foreground)]'
                        }`}
                      >
                        Drafting Editor
                      </button>
                    </div>

                    {!isDemoMode && (
                      <button
                        onClick={handleUndoLastEdit}
                        disabled={draftHistory.length === 0}
                        className="ui-btn ui-btn-muted ui-btn-xs"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Undo</span>
                      </button>
                    )}

                    {!isDemoMode && (
                      <div className="flex items-center gap-1 px-3 py-1 bg-[var(--surface-2)] rounded-full text-xs text-[var(--muted-foreground)] select-none">
                        {isSavingToCloud ? (
                          <>
                            <Loader2 className="w-3 animate-spin text-[var(--primary)]" />
                            <span>Saving...</span>
                          </>
                        ) : (
                          <>
                            <Cloud className="w-3 text-emerald-500" />
                            <span>Saved to Cloud</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </header>

                {/* Canvas Tab Content */}
                <div className="flex-1 min-h-0 relative bg-[var(--background)]">
                  {canvasTab === 'chat' ? (
                    <ContentStrategistWizard
                      savedNotes={researchNotes}
                      onNotesChange={handleNotesChange}
                      onComplete={(topic, outline, generatedDraft, notes, wizardAttachments) => {
                        const content = generatedDraft || outline || topic;
                        setDraft(content);
                        if (notes && notes.length > 0) setResearchNotes(notes);
                        if (wizardAttachments && wizardAttachments.length > 0) {
                          setAttachments(wizardAttachments);
                          setSelectedAttachmentIds(wizardAttachments.map(x => x.id));
                        }
                        setCanvasTab('editor');
                        toast.success('Blueprint applied to editor drafting panel.');
                      }}
                    />
                  ) : (
                    <Editor
                      value={draft}
                      onChange={setDraft}
                      metadata={metadata}
                      onMetadataChange={setMetadata}
                      isLoading={analysis.status === 'loading'}
                      onAnalyze={() => handleAnalyze()}
                      categoryOptions={editorialOptions.categories}
                      articleTypeOptions={editorialOptions.articleTypes}
                      editorialBrandName={editorialOptions.brandName}
                      isPersonal={editorialOptions.isPersonal}
                      onAddNewMetadataOption={handleAddNewCategoryOrType}
                      charLimit={editorialOptions.maxTextLength}
                      onClear={handleClearWorkspace}
                      onOpenChatTab={() => setCanvasTab('chat')}
                      feedback={analysis.feedback}
                      activeFeedbackIndex={activeFeedbackIndex}
                      hoveredFeedbackIndex={hoveredFeedbackIndex}
                      originalDraft={sourceDraft}
                    />
                  )}
                </div>
              </div>

              {/* Kolom Kanan: Accordion Studio & Review */}
              <StudioReviewPanel
                isDemoMode={isDemoMode}
                researchNotes={researchNotes}
                onNotesChange={handleNotesChange}
                onGenerateDraftFromNotes={handleGenerateDraftFromNotes}
                isGeneratingDraft={isGeneratingDraft}
                onInsertNoteToDraft={handleInsertNoteToDraft}
                attachments={attachments}
                selectedAttachmentIds={selectedAttachmentIds}
                draftContent={draft}
                analysisSpeed={analysisSpeed}
                onAnalysisSpeedChange={setAnalysisSpeed}
                onAnalyze={() => handleAnalyze()}
                isStreaming={isStreaming}
                isRefining={isRefining}
                processStage={processStage}
                processStartedAt={processStartedAt}
                onRefineAgain={handleRefineAgain}
                onReanalyze={handleReanalyze}
                analysis={analysis}
                hoveredFeedbackIndex={hoveredFeedbackIndex}
                onHoveredFeedbackChange={setHoveredFeedbackIndex}
                activeFeedbackIndex={activeFeedbackIndex}
                onActiveFeedbackChange={setActiveFeedbackIndex}
                onApplyFix={handleApplyFix}
                onApplyAll={handleApplyAllFixes}
                onAcceptFeedback={handleAcceptFeedback}
                onRemoveFeedbackAddition={(idx) => handleTargetedFix(idx, 'remove')}
                onAddFeedbackSource={handleAddFeedbackSource}
                onMarkFeedbackVerified={handleMarkFeedbackVerified}
                onFixFeedbackWithEAI={(idx) => handleTargetedFix(idx, 'fix')}
                isTargetedFixing={isTargetedFixing}
                activeHistoryId={activeHistoryId}
                refreshTrigger={refreshTrigger}
                articleMetadata={metadata}
                cmsExportEnabled={editorialOptions.cmsExportEnabled}
                onExport={handleExport}
                isExporting={isSavingToCloud}
                isRefineCountMaxed={isDemoMode && demoRefineCount >= 2}
                onShowSignupModal={() => setShowDemoSignupModal(true)}
              />

            </div>
          )}

          {/* MOBILE LAYOUT (< 1024px) */}
          {isMobile && (
            <div className="flex-1 flex flex-col min-h-0 pb-16 overflow-hidden">
              
              {/* Top Titlebar */}
              <header className="h-14 px-4 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-1)]">
                <span className="text-sm font-bold capitalize">{mobileTab}</span>
                {!isDemoMode && (
                  <button onClick={handleCloudSave} className="ui-btn ui-btn-muted ui-btn-xs">
                    <Cloud className="w-3 text-emerald-500" />
                    <span>Sync</span>
                  </button>
                )}
              </header>

              {/* Active Mobile Content Panel */}
              <div className="flex-1 min-h-0 relative">
                {mobileTab === 'sources' && (
                  <SourcesPanel
                    onSelect={loadHistory}
                    onNew={handleNewDraft}
                    activeId={activeHistoryId}
                    refreshTrigger={refreshTrigger}
                    sidebarOpen={true}
                    isDemoMode={isDemoMode}
                    activePlan={editorialOptions.activePlan}
                    attachments={attachments}
                    onAttachmentsChange={setAttachments}
                    selectedAttachmentIds={selectedAttachmentIds}
                    onSelectedAttachmentsChange={setSelectedAttachmentIds}
                  />
                )}
                {mobileTab === 'chat' && (
                  <ContentStrategistWizard
                    savedNotes={researchNotes}
                    onNotesChange={handleNotesChange}
                    onComplete={(topic, outline, generatedDraft, notes, wizardAttachments) => {
                      const content = generatedDraft || outline || topic;
                      setDraft(content);
                      if (notes && notes.length > 0) setResearchNotes(notes);
                      if (wizardAttachments && wizardAttachments.length > 0) {
                        setAttachments(wizardAttachments);
                        setSelectedAttachmentIds(wizardAttachments.map(x => x.id));
                      }
                      setMobileTab('editor');
                      toast.success('Blueprint applied.');
                    }}
                  />
                )}
                {mobileTab === 'editor' && (
                  <Editor
                    value={draft}
                    onChange={setDraft}
                    metadata={metadata}
                    onMetadataChange={setMetadata}
                    isLoading={analysis.status === 'loading'}
                    onAnalyze={() => handleAnalyze()}
                    categoryOptions={editorialOptions.categories}
                    articleTypeOptions={editorialOptions.articleTypes}
                    editorialBrandName={editorialOptions.brandName}
                    isPersonal={editorialOptions.isPersonal}
                    onAddNewMetadataOption={handleAddNewCategoryOrType}
                    charLimit={editorialOptions.maxTextLength}
                    onClear={handleClearWorkspace}
                    feedback={analysis.feedback}
                    activeFeedbackIndex={activeFeedbackIndex}
                    hoveredFeedbackIndex={hoveredFeedbackIndex}
                    originalDraft={sourceDraft}
                  />
                )}
                {mobileTab === 'review' && (
                  <StudioReviewPanel
                    isDemoMode={isDemoMode}
                    researchNotes={researchNotes}
                    onNotesChange={handleNotesChange}
                    onGenerateDraftFromNotes={handleGenerateDraftFromNotes}
                    isGeneratingDraft={isGeneratingDraft}
                    onInsertNoteToDraft={handleInsertNoteToDraft}
                    attachments={attachments}
                    selectedAttachmentIds={selectedAttachmentIds}
                    draftContent={draft}
                    analysisSpeed={analysisSpeed}
                    onAnalysisSpeedChange={setAnalysisSpeed}
                    onAnalyze={() => handleAnalyze()}
                    isStreaming={isStreaming}
                    isRefining={isRefining}
                    processStage={processStage}
                    processStartedAt={processStartedAt}
                    onRefineAgain={handleRefineAgain}
                    onReanalyze={handleReanalyze}
                    analysis={analysis}
                    hoveredFeedbackIndex={hoveredFeedbackIndex}
                    onHoveredFeedbackChange={setHoveredFeedbackIndex}
                    activeFeedbackIndex={activeFeedbackIndex}
                    onActiveFeedbackChange={setActiveFeedbackIndex}
                    onApplyFix={handleApplyFix}
                    onApplyAll={handleApplyAllFixes}
                    onAcceptFeedback={handleAcceptFeedback}
                    onRemoveFeedbackAddition={(idx) => handleTargetedFix(idx, 'remove')}
                    onAddFeedbackSource={handleAddFeedbackSource}
                    onMarkFeedbackVerified={handleMarkFeedbackVerified}
                    onFixFeedbackWithEAI={(idx) => handleTargetedFix(idx, 'fix')}
                    isTargetedFixing={isTargetedFixing}
                    activeHistoryId={activeHistoryId}
                    refreshTrigger={refreshTrigger}
                    articleMetadata={metadata}
                    cmsExportEnabled={editorialOptions.cmsExportEnabled}
                    onExport={handleExport}
                    isExporting={isSavingToCloud}
                  />
                )}
              </div>

              {/* Bottom Navigation Bar */}
              <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[var(--surface-1)] border-t border-[var(--border)] flex items-center justify-around z-50">
                <button
                  onClick={() => setMobileTab('sources')}
                  className={`flex flex-col items-center justify-center gap-1 border-none bg-transparent cursor-pointer ${
                    mobileTab === 'sources' ? 'text-[var(--primary)] font-bold' : 'text-[var(--muted-foreground)]'
                  }`}
                >
                  <Upload className="w-5 h-5" />
                  <span className="text-[10px]">Sources</span>
                </button>
                <button
                  onClick={() => setMobileTab('chat')}
                  className={`flex flex-col items-center justify-center gap-1 border-none bg-transparent cursor-pointer ${
                    mobileTab === 'chat' ? 'text-[var(--primary)] font-bold' : 'text-[var(--muted-foreground)]'
                  }`}
                >
                  <Sparkles className="w-5 h-5" />
                  <span className="text-[10px]">Chat</span>
                </button>
                <button
                  onClick={() => setMobileTab('editor')}
                  className={`flex flex-col items-center justify-center gap-1 border-none bg-transparent cursor-pointer ${
                    mobileTab === 'editor' ? 'text-[var(--primary)] font-bold' : 'text-[var(--muted-foreground)]'
                  }`}
                >
                  <FileText className="w-5 h-5" />
                  <span className="text-[10px]">Editor</span>
                </button>
                <button
                  onClick={() => setMobileTab('review')}
                  className={`flex flex-col items-center justify-center gap-1 border-none bg-transparent cursor-pointer ${
                    mobileTab === 'review' ? 'text-[var(--primary)] font-bold' : 'text-[var(--muted-foreground)]'
                  }`}
                >
                  <Layers className="w-5 h-5" />
                  <span className="text-[10px]">Review</span>
                </button>
              </nav>
            </div>
          )}

          {/* Demo Sign up Modal */}
          {showDemoSignupModal && (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
              onClick={() => setShowDemoSignupModal(false)}
            >
              <div
                className="relative bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-7"
                onClick={(e) => e.stopPropagation()}
                style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.35)' }}
              >
                <button
                  onClick={() => setShowDemoSignupModal(false)}
                  className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4.5 h-4.5 text-[var(--muted-foreground)]" />
                </button>

                <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center mb-4">
                  <Sparkles className="w-5 h-5 text-[var(--primary)]" />
                </div>

                <h2 className="text-base font-bold text-[var(--foreground)] mb-1.5">Save this result?</h2>
                <p className="text-sm text-[var(--muted-foreground)] mb-1 leading-relaxed">
                  Create your free workspace and continue editing with your own content.
                </p>
                <p className="text-xs text-[var(--muted-foreground)]/70 mb-6">
                  Your demo won&apos;t be saved. Create an account to keep your work.
                </p>

                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={() => router.push('/signup')}
                    className="ui-btn ui-btn-primary w-full justify-center py-2.5 text-sm font-semibold"
                  >
                    Start Free
                  </button>
                  <button
                    onClick={() => setShowDemoSignupModal(false)}
                    className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-center py-1 transition-colors"
                  >
                    Maybe Later
                  </button>
                </div>
              </div>
            </div>
          )}

          <ShortcutsModal
            isOpen={isShortcutModalOpen}
            onClose={() => setIsShortcutModalOpen(false)}
          />

        </div>
      </MotionConfig>
    </TooltipProvider>
  );
}
