'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import Editor from '@/components/Editor';
import FeedbackPanel from '@/components/FeedbackPanel';
import FinalDraftPanel from '@/components/FinalDraftPanel';
import HistorySidebar from '@/components/HistorySidebar';
import PanelTabBar, { PanelTab } from '@/components/PanelTabBar';
import StatusBar from '@/components/StatusBar';
import ShortcutsModal from '@/components/ShortcutsModal';
import { AnalysisResult, ArticleMetadata, EditorialProcessStage, EditorialReadiness, ResponseMode, FeedbackItem, ResearchNote, Attachment } from '@eai/shared';
import { Loader2, RotateCcw, Sparkles, Megaphone, Lock, Menu, Zap, Rocket, Cloud, CloudUpload } from 'lucide-react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { applyAllFeedbackOperations, applyFeedbackOperation, canAutoApplyFeedback, findTargetMatch, replaceFirstTargetMatch } from '@eai/shared';
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

const editorStatusBadgeClass = (status?: string) => {
  if (status === 'exported') return 'ui-badge-success';
  if (status === 'refined') return 'ui-badge-primary';
  return 'ui-badge-muted';
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
    const textId = `AI Semakin Banyak Digunakan — Tapi Kualitas Konten Belum Ikut Naik

Banyak perusahaan sekarang pakai AI buat produksi konten. Alasannya masuk akal: lebih cepat, lebih murah, dan gak perlu banyak staf penulis.

Tapi ada masalah yang jarang dibahas. Konten AI itu kebanyakan ya... lumayan. Secara teknis sudah benar tapi rasanya tidak seperti ditulis manusia beneran. Pembaca bisa merasakannya.

Tantangan sebenarnya bagi tim konten bukan lagi soal membuat konten. Itu mudah. Tantangannya adalah memastikan konten tersebut benar-benar bagus — akurat, jelas, sesuai brand, dan layak dibaca.

Di sinilah standar editorial jadi penting. Kebanyakan organisasi punya panduan editorial tapi tidak ada yang ngecek apakah kontennya sudah memenuhi standar itu.

EAI dibangun untuk menyelesaikan masalah ini. EAI mereview draft berdasarkan panduan brand Anda, ngecek kesalahan editorial yang umum, dan kasih feedback yang bisa langsung ditindaklanjuti oleh penulis.`;

    const textEn = `AI Tools Are Changing How We Work — But Not Always for the Better

More and more companies are now using AI tools to speed up content creation. The benefits seems obvious: faster output, less cost, and you dont have to hire as many writers.

But theres a problem nobody talks about. Most AI content is just... okay. Its technically correct but doesnt feel human. Readers notice.

The real challenge for content teams now isnt generating content. Generating is easy. The challenge is making sure that content is actually good — accurate, clear, on-brand, and worth reading.

Thats where editorial standards come in. Most organizations have these standards written down somewhere but nobody actually checks if the content meets them.

EAI was built to solve exactly this. It reviews drafts against your brand guidelines, checks for common editorial mistakes, and gives writers actionable feedback — not just a score.`;

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

  // RAF batching refs for streaming draft chunks
  const draftChunkBufferRef = useRef('');
  const rafIdRef = useRef<number | null>(null);

  // IDE layout state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>('draft');
  const [isMobile, setIsMobile] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hoveredFeedbackIndex, setHoveredFeedbackIndex] = useState<number | null>(null);
  const [activeFeedbackIndex, setActiveFeedbackIndex] = useState<number | null>(null);
  const [showFeedbackSidebar, setShowFeedbackSidebar] = useState(true);
  const [showNotesSidebar, setShowNotesSidebar] = useState(true);
  const [researchNotes, setResearchNotes] = useState<ResearchNote[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(sessionStorage.getItem('eai_research_notes') || '[]');
    } catch {
      return [];
    }
  });
  const [hasNotes, setHasNotes] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const notes = JSON.parse(sessionStorage.getItem('eai_research_notes') || '[]');
      return notes.length > 0;
    } catch {
      return false;
    }
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
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
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create manual draft');
      }

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
      console.error('Error saving to cloud:', error);
      toast.error('Failed to sync draft to cloud');
    } finally {
      setIsSavingToCloud(false);
    }
  };

  const handleNotesChange = (notes: ResearchNote[]) => {
    setResearchNotes(notes);
    setHasNotes(notes.length > 0);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('eai_research_notes', JSON.stringify(notes));
    }
  };

  // Autosave to cloud database (debounced)
  useEffect(() => {
    if (!isLoaded || !activeHistoryId || isDemoMode) return;

    const controller = new AbortController();
    setIsSavingToCloud(true);

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/history/${activeHistoryId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            action: 'autosave_draft',
            content: draft,
            notes: researchNotes,
            metadata: {
              ...metadata,
            }
          }),
        });
        if (!response.ok) {
          console.error('Failed to autosave draft to cloud');
        }
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
  }, [draft, researchNotes, metadata, activeHistoryId, isLoaded, isDemoMode]);

  useEffect(() => {
    if (mode === 'demo') {
      setIsDemoMode(true);
      setAnalysisSpeed('fast');
      const nextOptions = {
        brandName: 'Envoyou (Demo)',
        categories: ['Technology & AI', 'Digital Creator', 'Data & Insight', 'Finance & Investment'],
        articleTypes: ['News & Trend Analysis', 'Opinion / Op-Ed', 'In-Depth Guide / Explainer', 'How-To / Tutorial'],
        sourcePolicy: 'strict' as 'standard' | 'strict',
        isPersonal: true,
        maxTextLength: 5000,
        cmsExportEnabled: false,
        activePlan: 'demo',
      };
      setEditorialOptions(nextOptions);
      setWorkspaceChecking(false);

      // Force dark mode for /demo regardless of user's saved theme preference
      const html = document.documentElement;
      const prevClass = html.className;
      html.classList.add('dark');
      return () => {
        // Restore original class on unmount (so navigating away reverts theme)
        html.className = prevClass;
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
          category: current.category && nextOptions.categories.includes(current.category)
            ? current.category
            : undefined,
          type: current.type && nextOptions.articleTypes.includes(current.type)
            ? current.type
            : undefined,
        }));
        setAppSettings((current) => ({
          ...current,
          defaultMetadata: {
            ...current.defaultMetadata,
            category:
              current.defaultMetadata.category &&
              nextOptions.categories.includes(current.defaultMetadata.category)
                ? current.defaultMetadata.category
                : '',
            type:
              current.defaultMetadata.type &&
              nextOptions.articleTypes.includes(current.defaultMetadata.type)
                ? current.defaultMetadata.type
                : '',
          },
        }));
        setWorkspaceChecking(false);
      })
      .catch(() => router.replace('/onboarding'));
  }, [router, mode]);

  // Recovery from localStorage on client-side mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      let nextSettings = DEFAULT_APP_SETTINGS;
      if (savedSettings) {
        try {
          nextSettings = normalizeAppSettings(JSON.parse(savedSettings));
        } catch {
          nextSettings = DEFAULT_APP_SETTINGS;
        }
      }
      const savedDraft = localStorage.getItem('eai-draft');
      const savedMeta = localStorage.getItem('eai-metadata');
      const savedAnalysis = localStorage.getItem('eai-analysis');
      const savedHistoryId = localStorage.getItem('eai-active-history-id');
      const savedSourceDraft = localStorage.getItem('eai-source-draft');
      const savedActiveTab = localStorage.getItem('eai-active-tab');
      const savedShowSidebar = localStorage.getItem('eai-show-feedback-sidebar');
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
      if (savedActiveTab !== null) setActiveTab(savedActiveTab as PanelTab);
      if (savedShowSidebar !== null) setShowFeedbackSidebar(savedShowSidebar === 'true');

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
      localStorage.setItem('eai-active-tab', activeTab);
    }
  }, [activeTab, isLoaded]);

  useEffect(() => {
    if (isLoaded && typeof window !== 'undefined') {
      localStorage.setItem('eai-show-feedback-sidebar', String(showFeedbackSidebar));

      localStorage.setItem('eai-analysis-speed', analysisSpeed);
    }
  }, [showFeedbackSidebar, analysisSpeed, isLoaded]);


  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Global '?' shortcut for modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        setIsShortcutModalOpen(p => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const hasResult = analysis.status === 'success' || analysis.status === 'error';

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
    // Switch to final tab immediately when loading starts
    setActiveTab('refined');

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
          text: textToAnalyze,
          role: 'polish',
          metadata: {
            ...requestMetadata,
            researchNotes,
            attachments,
          },
          analysisSpeed: analysisSpeed === 'publish' ? 'deep' : 'fast',
        }),
      });
      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(response, 'Failed to start analysis stream.')
        );
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
          try { event = JSON.parse(line); } catch (e) { console.error('Failed to parse NDJSON:', line, e); continue; }

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
              const { item, index } = event.data as { item: import('@eai/shared').FeedbackItem; index: number };
              currentFeedback[index] = item;
              return { ...prev, status: 'success', feedback: currentFeedback };
            }); break;
            case 'flags': setAnalysis(prev => ({ ...prev, status: 'success', flags: event.data as string[] })); break;
            case 'draft_chunk': {
              // Buffer chunks and flush at most once per animation frame
              draftChunkBufferRef.current += event.data as string;
              if (rafIdRef.current === null) {
                rafIdRef.current = requestAnimationFrame(() => {
                  const buffered = draftChunkBufferRef.current;
                  draftChunkBufferRef.current = '';
                  rafIdRef.current = null;
                  setAnalysis(prev => ({
                    ...prev,
                    status: 'success',
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
      toast.success('Refinement Complete', { description: 'Final draft and editorial quality gate are ready.' });
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
      // Flush any remaining buffered draft chunks before stopping
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (draftChunkBufferRef.current) {
        const remaining = draftChunkBufferRef.current;
        draftChunkBufferRef.current = '';
        setAnalysis(prev => ({
          ...prev,
          polishedDraft: (prev.polishedDraft || '') + remaining,
        }));
      }
      setIsStreaming(false);
      setProcessStartedAt(null);
    }
  };

  /* ── Re-analyze ── */
  const handleReanalyze = () => {
    if (analysis.polishedDraft) {
      handleAnalyze(analysis.polishedDraft);
    }
  };

  /* ── Refine Again ── */
  const handleRefineAgain = async (instruction: string) => {
    const currentDraft = analysis.polishedDraft;
    if (!currentDraft?.trim() || isRefining || isStreaming) return;

    if (isDemoMode && demoRefineCount >= 2) {
      toast.error('Create a free account to continue.', {
        description: 'Get 10 free Editorial Credits.',
        action: {
          label: 'Sign Up',
          onClick: () => router.push('/signup'),
        },
        duration: 8000,
      });
      return;
    }

    setIsRefining(true);
    setProcessStage('rewriting');
    setProcessStartedAt(Date.now());
    draftChunkBufferRef.current = '';
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
        throw new Error(
          await getApiErrorMessage(response, 'Failed to start refine stream.')
        );
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
              setAnalysis(prev => ({ ...prev, polishedDraft: event.data as string }));
              break;
            case 'seo_metadata': setAnalysis(prev => ({ ...prev, generatedMetadata: event.data as Record<string, unknown> })); break;
            case 'feedback_reset': setAnalysis(prev => ({ ...prev, feedback: [], flags: [] })); break;
            case 'readiness': setAnalysis(prev => ({ ...prev, readiness: event.data as EditorialReadiness, verdict: event.data as EditorialReadiness })); break;
            case 'summary': setAnalysis(prev => ({ ...prev, summary: event.data as string })); break;
            case 'changes': setAnalysis(prev => ({ ...prev, changes: event.data as string[] })); break;
            case 'feedback_item': setAnalysis(prev => {
              const currentFeedback = prev.feedback ? [...prev.feedback] : [];
              const { item, index } = event.data as { item: import('@eai/shared').FeedbackItem; index: number };
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
      toast.success('Draft refined!', { description: 'Your instruction has been applied.' });
      setRefreshTrigger(prev => prev + 1);

      if (isDemoMode) {
        const nextCount = demoRefineCount + 1;
        setDemoRefineCount(nextCount);
        localStorage.setItem('eai-demo-refine-count', nextCount.toString());
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Refinement failed';
      toast.error('Refine Failed', { description: msg });
      // Restore original draft on failure
      setAnalysis(prev => ({ ...prev, polishedDraft: currentDraft }));
    } finally {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (draftChunkBufferRef.current) {
        const remaining = draftChunkBufferRef.current;
        draftChunkBufferRef.current = '';
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
    const finalDraft = analysis.polishedDraft || '';
    const result = applyFeedbackOperation(finalDraft, { ...item, targetText: target, replacementText: replacement, operation });
    if (!result.success) { toast.error('Failed to apply fix', { description: 'Target text not found. Please edit manually.' }); return false; }
    setAnalysis(prev => ({ ...prev, polishedDraft: result.nextText, readiness: 'needs_review', verdict: 'needs_review' }));
    toast.success('Suggestion applied!');
    return true;
  };

  const handleApplyAllFixes = () => {
    const feedback = analysis.feedback || [];
    const autoApplicable = feedback.filter(canAutoApplyFeedback);
    if (autoApplicable.length === 0) { toast.error('No suggestions can be auto-applied'); return; }
    const result = applyAllFeedbackOperations(analysis.polishedDraft || '', feedback);
    if (result.appliedIndexes.length === 0) { toast.error('Auto-apply failed', { description: 'No matching target text found.' }); return; }
    setAnalysis(prev => ({ ...prev, polishedDraft: result.nextText, readiness: 'needs_review', verdict: 'needs_review' }));
    if (result.failedIndexes.length > 0) {
      toast.warning(`${result.appliedIndexes.length} applied, ${result.failedIndexes.length} need manual review.`);
    } else {
      toast.success(`${result.appliedIndexes.length} changes applied.`);
    }
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
    setActiveTab('draft');
    setHoveredFeedbackIndex(null);
    setActiveFeedbackIndex(null);
    
    setResearchNotes([]);
    setHasNotes(false);
    setAttachments([]);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('eai_research_notes');
    }

    if (isMobile) setSidebarOpen(false);
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
      console.error('Failed to save metadata preference:', error);
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
        setHasNotes(loadedNotes.length > 0);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('eai_research_notes', JSON.stringify(loadedNotes));
        }

        const loadedAttachments = (logMetadata?.attachments || []) as Attachment[];
        setAttachments(loadedAttachments);

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
        // If this history item has a result, go to refined draft tab
        if (log.status === 'success') setActiveTab('refined');
        if (isMobile) setSidebarOpen(false);
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
    if (!analysisLogId) {
      throw new Error('The refinement history is not ready yet. Please try again.');
    }

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
    if (!response.ok) {
      throw new Error(result.error || 'Failed to save the editorial decision.');
    }
  };

  const handleAcceptFeedback = async (index: number) => {
    if (!analysis.feedback) return;
    const nextFeedback = [...analysis.feedback];
    nextFeedback[index] = {
      ...nextFeedback[index],
      isAccepted: true,
    };
    const nextReadiness = calculateReadiness(nextFeedback, analysis.readiness);
    const nextFlags = nextReadiness === 'ready' ? [] : (analysis.flags || []);
    try {
      await persistEditorialResolution(
        nextFeedback,
        nextReadiness,
        analysis.polishedDraft || '',
        nextFlags
      );
      setAnalysis(prev => ({
        ...prev,
        feedback: nextFeedback,
        readiness: nextReadiness,
        flags: nextFlags,
      }));
      toast.success('Editorial decision saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save the editorial decision.');
    }
  };

  const handleMarkFeedbackVerified = async (index: number) => {
    if (!analysis.feedback) return;
    const nextFeedback = [...analysis.feedback];
    nextFeedback[index] = {
      ...nextFeedback[index],
      isVerified: true,
    };
    const nextReadiness = calculateReadiness(nextFeedback, analysis.readiness);
    const nextFlags = nextReadiness === 'ready' ? [] : (analysis.flags || []);
    try {
      await persistEditorialResolution(
        nextFeedback,
        nextReadiness,
        analysis.polishedDraft || '',
        nextFlags
      );
      setAnalysis(prev => ({
        ...prev,
        feedback: nextFeedback,
        readiness: nextReadiness,
        flags: nextFlags,
      }));
      toast.success('Verification saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save verification.');
    }
  };

  const handleAddFeedbackSource = async (index: number, url: string) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      toast.error('URL is required.');
      return;
    }
    const item = analysis.feedback?.[index];
    if (!item) return;
    const sourceTarget = item.targetText?.trim() || item.message;
    const currentDraft = analysis.polishedDraft || '';
    const match = findTargetMatch(currentDraft, sourceTarget);

    const verificationNote = [
      '## Verification Notes',
      `- ${sourceTarget} — ${trimmedUrl}`,
    ].join('\n');
    const nextDraft = match
      ? `${currentDraft.slice(0, match.start)}[${match.text}](${trimmedUrl})${currentDraft.slice(match.end)}`
      : currentDraft.includes('## Verification Notes')
        ? `${currentDraft.trim()}\n- ${sourceTarget} — ${trimmedUrl}`
        : `${currentDraft.trim()}\n\n${verificationNote}`;

    const nextFeedback = [...(analysis.feedback || [])];
    nextFeedback[index] = {
      ...nextFeedback[index],
      isVerified: true,
      verifiedSource: trimmedUrl,
    };
    const nextReadiness = calculateReadiness(nextFeedback, analysis.readiness);
    const nextFlags = nextReadiness === 'ready' ? [] : (analysis.flags || []);
    try {
      await persistEditorialResolution(nextFeedback, nextReadiness, nextDraft, nextFlags);
      setAnalysis(prev => ({
        ...prev,
        polishedDraft: nextDraft,
        feedback: nextFeedback,
        readiness: nextReadiness,
        flags: nextFlags,
      }));
      toast.success(match ? 'Source added and verified.' : 'Source note added and verified.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save the source.');
    }
  };

  const handleTargetedFix = async (index: number, actionType: 'remove' | 'fix') => {
    const item = analysis.feedback?.[index];
    if (!item || !item.targetText || isTargetedFixing !== null) return;
    setIsTargetedFixing(index);

    try {
      const instruction = actionType === 'remove'
        ? 'Write a revised version of the text to completely remove or neutralize the editorial addition/novel framework or claim. Do NOT add new unverified claims, numbers, or frameworks.'
        : `Revise this sentence to fix the following editorial issue: ${item.message}.`;

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: analysis.polishedDraft || item.targetText,
          mode: 'fix_targeted',
          targetText: item.targetText,
          feedbackMessage: item.message || 'Address this editorial issue',
          instruction: instruction,
          analysisSpeed: analysisSpeed === 'publish' ? 'deep' : 'fast',
        }),
      });

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(response, 'Failed to start targeted fix stream.')
        );
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
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }

          if (event.type === 'replacement') {
            replacementText = event.data as string;
          } else if (event.type === 'error') {
            throw new Error(event.data as string);
          }
        }
      }

      if (!replacementText) {
        throw new Error('No replacement text returned by the AI.');
      }

      const finalDraft = analysis.polishedDraft || '';
      const result = replaceFirstTargetMatch(finalDraft, item.targetText, replacementText);
      
      let nextDraft = finalDraft;
      if (result.success) {
        nextDraft = result.nextText;
      } else {
        toast.info('Target text was already modified or removed. Marking as resolved.');
      }

      const nextFeedback = [...(analysis.feedback || [])];
      nextFeedback[index] = {
        ...nextFeedback[index],
        isVerified: actionType === 'fix',
        isAccepted: actionType === 'remove',
      };
      const nextReadiness = calculateReadiness(nextFeedback, analysis.readiness);
      const nextFlags = nextReadiness === 'ready' ? [] : (analysis.flags || []);
      await persistEditorialResolution(
        nextFeedback,
        nextReadiness,
        nextDraft,
        nextFlags
      );
      setAnalysis(prev => ({
        ...prev,
        polishedDraft: nextDraft,
        feedback: nextFeedback,
        readiness: nextReadiness,
        flags: nextFlags,
      }));

      toast.success(actionType === 'remove' ? 'Addition removed successfully!' : 'Sentence fixed successfully!');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Targeted fix failed';
      toast.error('Fix Failed', { description: msg });
    } finally {
      setIsTargetedFixing(null);
    }
  };

  // Derived state
  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const charCount = draft.length;
  const MAX_TEXT_LENGTH = editorialOptions.maxTextLength;

  /* ── Render ─────────────────────────────────────────────── */
  if (workspaceChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
    <div
      className="flex flex-col h-screen overflow-hidden relative"
      style={{ background: 'var(--background)' }}
    >

      {/* ── Body: Sidebar + Main ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">



        {/* Sidebar (History) — always mounted, width/transform animates */}
        {!isDemoMode && (
          <div
            className={`shrink-0 h-full ${isMobile ? 'fixed inset-y-0 left-0 z-50' : 'relative'}`}
            style={isMobile ? {
              width: 'var(--sidebar-panel-width)',
              borderRight: 'none',
              transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 240ms cubic-bezier(0.4, 0, 0.2, 1)',
            } : {
              width: sidebarOpen ? 'var(--sidebar-panel-width)' : '0px',
              borderRight: 'none',
              overflow: 'hidden',
              overflowX: 'hidden',
              transition: 'width 240ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
          <div style={{ width: '100%', height: '100%' }}>
            <HistorySidebar
              onSelect={loadHistory}
              onNew={handleNewDraft}
              activeId={activeHistoryId}
              refreshTrigger={refreshTrigger}
              sidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen(p => !p)}
              isDemoMode={isDemoMode}
              activePlan={editorialOptions.activePlan}
            />
            </div>
          </div>
        )}

        {/* Mobile backdrop — always mounted, opacity animates */}
        {isMobile && !isDemoMode && (
          <button
            type="button"
            aria-label="Close draft history"
            className="fixed inset-0 z-40"
            style={{
              background: 'rgba(9,9,9,0.7)',
              backdropFilter: 'blur(3px)',
              opacity: sidebarOpen ? 1 : 0,
              pointerEvents: sidebarOpen ? 'auto' : 'none',
              transition: 'opacity 240ms ease',
            }}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Main Editor Area ── */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          {/* ── Title Bar ── */}
          <header className="ide-titlebar max-sm:h-14 max-sm:px-3 max-sm:gap-2" role="banner">
            {/* Left Side: Active Document Path */}
            <div className="titlebar-path flex min-w-0 shrink-0 items-center gap-2 select-none">
              {!sidebarOpen && !isDemoMode && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="mr-2 p-1.5 -ml-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] md:hidden"
                  aria-label="Open Sidebar"
                >
                  <Menu className="w-4 h-4" />
                </button>
              )}
              {isDemoMode ? (
                <>
                  <span className="titlebar-workspace text-sm font-bold text-[var(--foreground)] tracking-tight">EAI</span>
                  <span className="ui-badge ui-badge-surface ui-badge-xs ml-1 font-semibold tracking-wide uppercase">Try Demo</span>
                </>
              ) : (
                <>
                  <span className="titlebar-workspace text-sm font-semibold text-[var(--foreground)]">Workspace</span>
                  <span className="text-[11px] text-[var(--muted-foreground)]">/</span>
                  <span className="titlebar-current truncate text-[13px] font-medium text-[var(--muted-foreground)]">
                    {activeTab === 'draft' ? 'Draft Article' : 'Refined Draft'}
                  </span>
                </>
              )}
              {analysis.editorStatus && (
                <span className={`ui-badge ui-badge-xs ml-1 capitalize ${editorStatusBadgeClass(analysis.editorStatus)}`}>
                  {analysis.editorStatus}
                </span>
              )}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Global Actions */}
            <div className="titlebar-actions flex items-center gap-1.5">
              {/* What's New */}
              {!isDemoMode && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <a
                        id="titlebar-whats-new"
                        href="https://envoyou.com/changelog"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ui-btn ui-btn-muted ui-btn-sm no-underline"
                      >
                        <Megaphone className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">What&apos;s New</span>
                      </a>
                    }
                  />
                  <TooltipContent side="bottom" className="text-xs">
                    View latest platform updates
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Undo (Borderless) */}
              {!isDemoMode && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        id="titlebar-undo"
                        onClick={handleUndoLastEdit}
                        disabled={draftHistory.length === 0 || analysis.status === 'loading'}
                        className="ui-btn ui-btn-muted ui-btn-sm"
                        aria-label="Undo last edit"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span className="hidden sm:inline">Undo</span>
                      </button>
                    }
                  />
                  <TooltipContent side="bottom" className="text-xs">
                    Undo last edit
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Cloud Save / Sync Indicator */}
              {!isDemoMode && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      activeHistoryId ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--muted-foreground)] bg-[var(--surface-2)]/45 border border-[var(--border)]/75 rounded-full select-none">
                          {isSavingToCloud ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--primary)]" />
                              <span>Saving...</span>
                            </>
                          ) : (
                            <>
                              <Cloud className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="hidden sm:inline">Saved to Cloud</span>
                            </>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={handleCloudSave}
                          disabled={isSavingToCloud}
                          className="ui-btn ui-btn-muted ui-btn-sm text-[var(--primary)] border-[var(--primary)]/20 hover:bg-[var(--primary)]/10"
                        >
                          {isSavingToCloud ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CloudUpload className="w-3.5 h-3.5" />
                          )}
                          <span>Save to Cloud</span>
                        </button>
                      )
                    }
                  />
                  <TooltipContent side="bottom" className="text-xs">
                    {activeHistoryId 
                      ? 'Autosave is active. Edits sync to database automatically.' 
                      : 'Save this draft and notes to the cloud database to work on other devices.'}
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Mode Selector (Borderless) */}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setAnalysisSpeed('fast')}
                        className={`relative flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[13px] font-[550] transition-colors border-none bg-transparent cursor-pointer rounded-md ${
                          analysisSpeed === 'fast' ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">Fast</span>
                        {analysisSpeed === 'fast' && (
                          <div className="absolute -bottom-[5px] left-2 right-2 h-[2px] bg-[var(--primary)] rounded-t-sm" />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          if (isDemoMode) {
                            setShowDemoSignupModal(true);
                            return;
                          }
                          setAnalysisSpeed('publish');
                        }}
                        className={`relative flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[13px] font-[550] transition-colors border-none bg-transparent cursor-pointer rounded-md ${
                          analysisSpeed === 'publish' ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]'
                        }`}
                      >
                        {isDemoMode ? <Lock className="w-3.5 h-3.5 text-slate-400" /> : <Rocket className="w-3.5 h-3.5" />}
                        <span className="hidden md:inline">Publish</span>
                        {analysisSpeed === 'publish' && (
                          <div className="absolute -bottom-[5px] left-2 right-2 h-[2px] bg-[var(--primary)] rounded-t-sm" />
                        )}
                      </button>
                    </div>
                  }
                />
                <TooltipContent side="bottom" className="text-xs">
                  {analysisSpeed === 'fast' 
                    ? 'Fast Review: Quick and cost-efficient. Skips SEO generation and internal link lookup.'
                    : 'Publish Ready: Full editorial workflow with SEO metadata and internal links.'}
                </TooltipContent>
              </Tooltip>

              {/* Refine Draft — Primary CTA */}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      id="titlebar-refine"
                      onClick={() => handleAnalyze()}
                      disabled={!draft.trim() || analysis.status === 'loading'}
                      className={`ui-btn ui-btn-primary ui-btn-sm ${
                        activeTab !== 'draft' ? 'max-sm:hidden' : ''
                      }`}
                    >
                      {analysis.status === 'loading'
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Sparkles className="w-4 h-4" />
                      }
                      <span className="hidden sm:inline">
                        {analysis.status === 'loading' ? 'Refining…' : 'Refine Draft'}
                      </span>
                    </button>
                  }
                />
                <TooltipContent side="bottom" className="text-xs">
                  {analysis.status === 'loading' ? 'Refining draft…' : 'Refine Draft (Ctrl+Enter)'}
                </TooltipContent>
              </Tooltip>

            </div>
            
            {/* Demo CTAs */}
            {isDemoMode && (
              <div className="flex items-center gap-2 ml-2 pl-2 border-l border-[var(--border)]">
                <button
                  onClick={() => router.push('/login')}
                  className="text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors px-2"
                >
                  Login
                </button>
                <button
                  onClick={() => router.push('/signup')}
                  className="ui-btn ui-btn-primary ui-btn-sm text-xs px-3"
                >
                  Start Free
                </button>
              </div>
            )}
          </header>

          {/* Demo Progress Stepper */}
          {isDemoMode && (
            <div className="flex items-center justify-center gap-0 border-b border-[var(--border)] px-4 py-2.5" style={{ background: 'var(--background)' }}>
              <span className="text-[11px] font-semibold text-[var(--muted-foreground)] mr-4 hidden sm:block">Try EAI in 30 sec</span>
              {/* Step 1: Refine Draft */}
              <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${
                analysis.status === 'idle' ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]'
              }`}>
                <span className="flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold bg-[var(--primary)] text-white">
                  {analysis.status !== 'idle' ? '✓' : '1'}
                </span>
                <span className="hidden sm:block">Refine Draft</span>
              </div>
              <div className="w-6 sm:w-10 h-px bg-[var(--border)] mx-2" />
              {/* Step 2: See Improvements */}
              <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${
                analysis.status === 'loading' ? 'text-[var(--primary)]' :
                hasResult ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]'
              }`}>
                <span className={`flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${
                  analysis.status === 'loading' ? 'bg-[var(--primary)] text-white' :
                  hasResult ? 'bg-[var(--primary)] text-white' : 'border border-[var(--border)] text-[var(--muted-foreground)]'
                }`}>{hasResult ? '✓' : analysis.status === 'loading' ? '…' : '2'}</span>
                <span className="hidden sm:block">See Improvements</span>
              </div>
              <div className="w-6 sm:w-10 h-px bg-[var(--border)] mx-2" />
              {/* Step 3: Save Workspace */}
              <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${
                hasResult ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'
              }`}>
                <span className={`flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${
                  hasResult ? 'border border-[var(--primary)] text-[var(--primary)]' : 'border border-[var(--border)] text-[var(--muted-foreground)]'
                }`}>3</span>
                <span className="hidden sm:block">Save Workspace</span>
              </div>
            </div>
          )}

          {/* Tab Bar */}
          <PanelTabBar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            hasResult={hasResult}
            isLoading={analysis.status === 'loading'}
            showFeedbackSidebar={showFeedbackSidebar}
            onToggleFeedbackSidebar={() => setShowFeedbackSidebar(p => !p)}
            showHistorySidebar={sidebarOpen}
            onToggleHistorySidebar={() => setSidebarOpen(p => !p)}
            showNotesSidebar={showNotesSidebar}
            onToggleNotesSidebar={() => setShowNotesSidebar(p => !p)}
            hasNotes={hasNotes}
          />

          {/* Workspace */}
          <div
            id={`panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`panel-tab-${activeTab}`}
            className="flex-1 min-h-0 overflow-hidden relative"
          >
            <AnimatePresence mode="wait">
              {/* ── DRAFT TAB ── */}
              {activeTab === 'draft' && (
                <motion.div
                  key="draft-tab"
                  initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full w-full p-3 md:px-6 md:py-5 absolute inset-0"
                >
                  <Editor
                    value={draft}
                    onChange={setDraft}
                    metadata={metadata}
                    onMetadataChange={setMetadata}
                    isLoading={analysis.status === 'loading'}
                    onAnalyze={handleAnalyze}
                    categoryOptions={editorialOptions.categories}
                    articleTypeOptions={editorialOptions.articleTypes}
                    editorialBrandName={editorialOptions.brandName}
                    isPersonal={editorialOptions.isPersonal}
                    onAddNewMetadataOption={handleAddNewCategoryOrType}
                    charLimit={editorialOptions.maxTextLength}
                    showNotesSidebar={showNotesSidebar}
                    researchNotes={researchNotes}
                    onNotesChange={handleNotesChange}
                    attachments={attachments}
                    onAttachmentsChange={setAttachments}
                  />
                </motion.div>
              )}

              {/* ── REFINED DRAFT TAB ── */}
              {activeTab === 'refined' && (
                <motion.div
                  key="refined-tab"
                  initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full w-full flex min-h-0 overflow-hidden absolute inset-0"
                >
                  {(hasResult || analysis.status === 'loading') ? (
                    isMobile ? (
                    <div className="flex-1 min-w-0 h-full overflow-hidden p-4">
                      {showFeedbackSidebar ? (
                        <FeedbackPanel
                          key={`${activeHistoryId ?? 'draft'}-${refreshTrigger}-${analysis.status}`}
                          result={analysis}
                          title={analysis.generatedMetadata?.title as string | undefined}
                          onApplyFix={handleApplyFix}
                          onApplyAll={handleApplyAllFixes}
                          hoveredFeedbackIndex={hoveredFeedbackIndex}
                          onHoveredFeedbackChange={setHoveredFeedbackIndex}
                          activeFeedbackIndex={activeFeedbackIndex}
                          onActiveFeedbackChange={setActiveFeedbackIndex}
                          isSidebarMode={true}
                          isProcessing={isStreaming || isRefining}
                          processStage={processStage}
                          processStartedAt={processStartedAt}
                          isRefining={isRefining}
                          onAcceptFeedback={handleAcceptFeedback}
                          onRemoveFeedbackAddition={(idx) => handleTargetedFix(idx, 'remove')}
                          onAddFeedbackSource={handleAddFeedbackSource}
                          onMarkFeedbackVerified={handleMarkFeedbackVerified}
                          onFixFeedbackWithEAI={(idx) => handleTargetedFix(idx, 'fix')}
                          isTargetedFixing={isTargetedFixing}
                        />
                      ) : (
                        <FinalDraftPanel
                          originalDraft={sourceDraft}
                          polishedDraft={analysis.polishedDraft ?? ''}
                          ready={analysis.status === 'success'}
                          exportBlocked={isDemoMode || analysis.readiness !== 'ready'}
                          cmsConnected={editorialOptions.cmsExportEnabled}
                          analysisLogId={analysis.analysisLogId || activeHistoryId || undefined}
                          sourceRef={analysis.sourceRef || metadata.sourceRef}
                          articleMetadata={metadata}
                          exportStatus={analysis.exportStatus}
                          generatedMetadata={analysis.generatedMetadata}
                          isStreaming={isStreaming}
                          isRefining={isRefining}
                          processStage={processStage}
                          processStartedAt={processStartedAt}
                          isStale={analysis.summary?.startsWith('Iterative refinement')}
                          onRefineAgain={handleRefineAgain}
                          onReanalyze={handleReanalyze}
                          hoveredFeedbackIndex={hoveredFeedbackIndex}
                          activeFeedbackIndex={activeFeedbackIndex}
                          onActiveFeedbackChange={setActiveFeedbackIndex}
                          feedback={analysis.feedback || []}
                          isDemoMode={isDemoMode}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0 flex h-full overflow-hidden p-3 gap-3 md:px-5 md:py-5 md:gap-4">
                      <div
                        className="min-w-0 h-full flex flex-col overflow-hidden"
                        style={{
                          flex: 1,
                          maxWidth: showFeedbackSidebar ? '9999px' : '56rem',
                          marginLeft: 'auto',
                          marginRight: 'auto',
                          transition: 'max-width 240ms cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                      >
                        <FinalDraftPanel
                          originalDraft={sourceDraft}
                          polishedDraft={analysis.polishedDraft ?? ''}
                          ready={analysis.status === 'success'}
                          exportBlocked={isDemoMode || analysis.readiness !== 'ready'}
                          cmsConnected={editorialOptions.cmsExportEnabled}
                          analysisLogId={analysis.analysisLogId || activeHistoryId || undefined}
                          sourceRef={analysis.sourceRef || metadata.sourceRef}
                          articleMetadata={metadata}
                          exportStatus={analysis.exportStatus}
                          generatedMetadata={analysis.generatedMetadata}
                          isStreaming={isStreaming}
                          isRefining={isRefining}
                          processStage={processStage}
                          processStartedAt={processStartedAt}
                          isStale={analysis.summary?.startsWith('Iterative refinement')}
                          onRefineAgain={handleRefineAgain}
                          onReanalyze={handleReanalyze}
                          hoveredFeedbackIndex={hoveredFeedbackIndex}
                          activeFeedbackIndex={activeFeedbackIndex}
                          onActiveFeedbackChange={setActiveFeedbackIndex}
                          feedback={analysis.feedback || []}
                          isDemoMode={isDemoMode}
                        />
                      </div>
                      <motion.div
                        initial={false}
                        animate={{
                          width: showFeedbackSidebar ? 380 : 0,
                          opacity: showFeedbackSidebar ? 1 : 0,
                        }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        style={{
                          flexShrink: 0,
                          overflow: 'hidden',
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        <div
                          style={{
                            width: '380px',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            background: 'var(--card)',
                            borderRadius: 'var(--radius-lg)',
                            border: '1px solid var(--border)',
                            boxShadow: 'none',
                            overflow: 'hidden',
                          }}
                        >
                          <FeedbackPanel
                            key={`${activeHistoryId ?? 'draft'}-${refreshTrigger}-${analysis.status}`}
                            result={analysis}
                            title={analysis.generatedMetadata?.title as string | undefined}
                            onApplyFix={handleApplyFix}
                            onApplyAll={handleApplyAllFixes}
                            hoveredFeedbackIndex={hoveredFeedbackIndex}
                            onHoveredFeedbackChange={setHoveredFeedbackIndex}
                            activeFeedbackIndex={activeFeedbackIndex}
                            onActiveFeedbackChange={setActiveFeedbackIndex}
                            isSidebarMode={true}
                            isProcessing={isStreaming || isRefining}
                            processStage={processStage}
                            processStartedAt={processStartedAt}
                            isRefining={isRefining}
                            onAcceptFeedback={handleAcceptFeedback}
                            onRemoveFeedbackAddition={(idx) => handleTargetedFix(idx, 'remove')}
                            onAddFeedbackSource={handleAddFeedbackSource}
                            onMarkFeedbackVerified={handleMarkFeedbackVerified}
                            onFixFeedbackWithEAI={(idx) => handleTargetedFix(idx, 'fix')}
                            isTargetedFixing={isTargetedFixing}
                          />
                        </div>
                      </motion.div>
                    </div>
                  )
                ) : (
                  <div className="h-full max-w-4xl mx-auto w-full p-6 md:p-10">
                    <div className="ui-state-card flex h-full items-center justify-center p-8">
                      <p className="text-xs ui-muted">
                        Run &ldquo;Refine Draft&rdquo; to generate the Refined Draft.
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
            </AnimatePresence>
          </div>

          {/* Status Bar */}
          <StatusBar
            wordCount={wordCount}
            charCount={charCount}
            charLimit={MAX_TEXT_LENGTH}
            readiness={analysis.readiness}
            isLoading={analysis.status === 'loading'}
            isStreaming={isStreaming}
            isRefining={isRefining}
            activeTab={activeTab}
            onOpenShortcuts={() => setIsShortcutModalOpen(true)}
          />

          {/* Demo CTA: Continue with your own content */}
          {isDemoMode && hasResult && (
            <div
              className="flex items-center justify-between gap-4 px-5 py-2.5 border-t border-[var(--border)]"
              style={{ background: 'var(--surface-1)' }}
            >
              <p className="text-xs text-[var(--muted-foreground)] leading-tight">
                Your demo won&apos;t be saved. Create an account to keep your work.
              </p>
              <button
                onClick={() => router.push('/signup')}
                className="ui-btn ui-btn-primary ui-btn-xs whitespace-nowrap shrink-0"
              >
                Continue Editing →
              </button>
            </div>
          )}
        </div>
      </div>

      <ShortcutsModal
        isOpen={isShortcutModalOpen}
        onClose={() => setIsShortcutModalOpen(false)}
      />

      {/* Demo Signup Modal */}
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
            {/* Close */}
            <button
              onClick={() => setShowDemoSignupModal(false)}
              className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] transition-colors"
              aria-label="Close"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            </button>

            {/* Icon */}
            <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center mb-4">
              <Sparkles className="w-5 h-5 text-[var(--primary)]" />
            </div>

            {/* Copy */}
            <h2 className="text-base font-bold text-[var(--foreground)] mb-1.5">Save this result?</h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-1 leading-relaxed">
              Create your free workspace and continue editing with your own content.
            </p>
            <p className="text-xs text-[var(--muted-foreground)]/70 mb-6">
              Your demo won&apos;t be saved. Create an account to keep your work.
            </p>

            {/* Actions */}
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
    </div>
    </MotionConfig>
  );
}
