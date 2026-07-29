'use client';
/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { generateId, extractDynamicSuggestions } from '@/lib/strategist-utils';
import { useUser } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { useDirectFetch } from '@/lib/hooks/useDirectFetch';
import { readWithTimeout, StreamIdleTimeoutError } from '@/lib/stream-utils';
import {
  fetchWithTimeout,
  getResponseErrorMessage,
  REQUEST_TIMEOUT_MS,
  RequestTimeoutError,
} from '@/lib/fetch-utils';
import {
  beginStrategistContentAnimation,
  completeStrategistMessageStream,
  getStrategistStreamError,
  parseStrategistSseLine,
  updateStrategistContentAnimation,
} from '@/lib/strategist-stream';
import {
  getStrategistChatPath,
  getStrategistStatusPath,
  getStrategistCancelPath,
} from '@/lib/hooks/useStrategistChatPath';
import {
  recoverStrategistPlanResult,
  type StrategistPlanResult,
} from '@/lib/strategist-plan-request';
import { recoverStrategistChatRequest } from '@/lib/strategist-chat-request';
import {
  StrategistTypewriterQueue,
  type StrategistTypewriterMode,
} from '@/lib/strategist-typewriter';

export type SignalData = {
  topic: string;
  internalSignal: 'High' | 'Medium' | 'Low';
  externalSignal: 'Rising' | 'Stable' | 'Declining';
};

export type Recommendation = {
  type: 'write_now' | 'experiment' | 'avoid';
  title: string;
  description: string;
};

export type PreEditorPlan = {
  angle: string;
  audience: string;
  hook: string;
  outline: string;
  seoIntent: string;
  sources: string[];
  draft: string;
};

export type ResearchNote = {
  id: string;
  content: string;
  sources: { url: string; domain: string }[];
  savedAt: string;
};

export type Attachment = {
  id: string;
  filename: string;
  r2Key: string;
  publicUrl: string;
  contentType: string;
  extractedText: string;
  uploadedAt: string;
};

export const MAX_DEEP_RESEARCH_REPORTS = 5;

export type DeepResearchReport = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
};

const getDeepResearchReportTitle = (content: string): string => {
  const firstMeaningfulLine = content
    .split('\n')
    .map(line => line.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim())
    .find(Boolean);

  return (firstMeaningfulLine || 'Deep Research Report').slice(0, 120);
};

export type ChatMessageType = 'text' | 'welcome' | 'recommendations' | 'plan';
export type AssistantLifecycle = 'pending' | 'success' | 'error' | 'cancelled';
export type StrategistThinkingKind = 'reasoning' | 'grounding';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  type: ChatMessageType;
  content: string;
  payload?: {
    status?: string;
    lifecycle?: AssistantLifecycle;
    isContentAnimating?: boolean;
    isStreamComplete?: boolean;
    isSupportReady?: boolean;
    thinking?: {
      kind: StrategistThinkingKind;
      content: string;
    };
    suggestions?: string[];
    sources?: { url: string; domain: string; title?: string; description?: string }[];
  };
};

export interface ChatSession {
  id: string;
  title: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  messages?: ChatMessage[];
}

interface UseContentStrategistOptions {
  onComplete: (topic: string, outline: string, draft: string, notes: ResearchNote[], attachments: Attachment[]) => void;
  notes?: ResearchNote[];
  onNotesChange?: (notes: ResearchNote[]) => void;
  documentId?: string;
}

const MAX_NOTES = 10;
const SESSION_KEY = 'eai_research_notes';

export function useContentStrategist({ onComplete, notes, onNotesChange, documentId = 'new' }: UseContentStrategistOptions) {
  const { user } = useUser();
  const tReport = useTranslations('DeepResearchReport');
  const directFetch = useDirectFetch();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const chatAbortControllerRef = useRef<AbortController | null>(null);
  const quickDraftAbortControllerRef = useRef<AbortController | null>(null);
  const deepResearchMessageIdRef = useRef<string | null>(null);
  const deepResearchCancelTokenRef = useRef<string | null>(null);
  const deepResearchFollowUpContentRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (chatAbortControllerRef.current) {
        chatAbortControllerRef.current.abort();
      }
      if (quickDraftAbortControllerRef.current) {
        quickDraftAbortControllerRef.current.abort();
      }
    };
  }, []);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = sessionStorage.getItem(`eai_strategist_messages_${documentId}`);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const strategistTypewriterRef = useRef<StrategistTypewriterQueue | null>(null);
  if (strategistTypewriterRef.current == null) {
    strategistTypewriterRef.current = new StrategistTypewriterQueue();
  }

  useEffect(() => {
    const queue = strategistTypewriterRef.current;
    return () => queue?.dispose();
  }, []);

  const dropStrategistTypewriter = useCallback((messageId: string) => {
    strategistTypewriterRef.current?.dropByPrefix(`${messageId}:`);
  }, []);

  const enqueueStrategistThinking = useCallback((
    messageId: string,
    kind: StrategistThinkingKind,
    chunk: string
  ) => {
    strategistTypewriterRef.current?.enqueue(
      `${messageId}:thinking`,
      chunk,
      'append',
      (animatedText) => {
        setMessages(prev => prev.map(message => message.id === messageId
          ? {
              ...message,
              payload: {
                ...message.payload,
                status: 'Thinking...',
                thinking: {
                  kind,
                  content: animatedText,
                },
              },
            }
          : message));
      }
    );
  }, []);

  const enqueueStrategistContent = useCallback((
    messageId: string,
    content: string,
    suggestions: string[] | undefined,
    mode: StrategistTypewriterMode = 'replace'
  ) => {
    strategistTypewriterRef.current?.drop(`${messageId}:thinking`);
    setMessages(prev => prev.map(message => message.id === messageId
      ? {
          ...message,
          payload: {
            ...message.payload,
            ...beginStrategistContentAnimation(),
          },
        }
      : message));
    strategistTypewriterRef.current?.enqueue(
      `${messageId}:content`,
      content,
      mode,
      (animatedText, complete) => {
        setMessages(prev => prev.map(message => message.id === messageId
          ? {
              ...message,
              content: animatedText,
              payload: {
                ...message.payload,
                status: undefined,
                ...updateStrategistContentAnimation(
                  message.payload,
                  complete
                ),
                ...(complete && suggestions !== undefined
                  ? { suggestions }
                  : {}),
              },
            }
          : message));
      }
    );
  }, []);
  const completeStrategistStream = useCallback((messageId: string) => {
    setMessages(prev => prev.map(message => message.id === messageId
      ? {
          ...message,
          payload: {
            ...message.payload,
            status: undefined,
            ...completeStrategistMessageStream(message.payload),
          },
        }
      : message));
  }, []);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PreEditorPlan | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = sessionStorage.getItem(`eai_strategist_current_plan_${documentId}`);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [collectedSources, setCollectedSources] = useState<{ url: string; domain: string; title?: string; description?: string }[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = sessionStorage.getItem(`eai_strategist_sources_${documentId}`);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [deepResearchReports, setDeepResearchReports] = useState<DeepResearchReport[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const storedCollection = sessionStorage.getItem(
        `eai_strategist_deep_research_reports_${documentId}`
      );
      if (storedCollection) {
        const parsed = JSON.parse(storedCollection);
        if (Array.isArray(parsed)) return parsed;
      }

      const legacyReport = sessionStorage.getItem(
        `eai_strategist_deep_research_${documentId}`
      );
      return legacyReport
        ? [{
            id: `legacy-${generateId()}`,
            title: getDeepResearchReportTitle(legacyReport),
            content: legacyReport,
            createdAt: new Date().toISOString(),
          }]
        : [];
    } catch { return []; }
  });
  const [uploadedAttachment, setUploadedAttachment] = useState<Attachment | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = sessionStorage.getItem('eai_strategist_attachment');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  // For unauthenticated/demo users, default to 'new' session to skip landing list
  useEffect(() => {
    if (typeof window !== 'undefined' && !user) {
      setCurrentSessionId('new');
    }
  }, [user]);

  const loadSessions = useCallback(async () => {
    if (!user) return;
    setIsSessionsLoading(true);
    try {
      const res = await fetchWithTimeout('/api/strategist/sessions?limit=50');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error('Failed to load chat sessions:', err);
    } finally {
      setIsSessionsLoading(false);
    }
  }, [user, setSessions, setIsSessionsLoading]);

  useEffect(() => {
    if (user) {
      loadSessions();
    }
  }, [user, loadSessions]);

  const selectSession = useCallback(async (sessionId: string) => {
    if (!user) return;
    strategistTypewriterRef.current?.clear();
    setIsTyping(true);
    try {
      const res = await fetchWithTimeout(`/api/strategist/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          setCurrentSessionId(sessionId);
          setMessages(data.session.messages || []);
        } else {
          toast.error('Failed to load chat session');
        }
      } else {
        toast.error('Failed to load chat session');
      }
    } catch (err) {
      console.error('Error loading session:', err);
      toast.error('An error occurred while loading the chat');
    } finally {
      setIsTyping(false);
    }
  }, [user, setCurrentSessionId, setMessages, setIsTyping]);

  const renameSession = useCallback(async (sessionId: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    // Optimistic UI update
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: trimmed } : s));

    if (!user) return;
    try {
      const res = await fetchWithTimeout(`/api/strategist/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed })
      });
      if (!res.ok) {
        toast.error('Failed to rename chat session');
        loadSessions(); // revert on failure
      } else {
        toast.success('Chat session renamed successfully');
      }
    } catch (err) {
      console.error('Error renaming session:', err);
      loadSessions(); // revert
    }
  }, [user, loadSessions, setSessions]);

  const togglePinSession = useCallback(async (sessionId: string) => {
    let targetPinned = false;
    setSessions(prev => {
      const updated = prev.map(s => {
        if (s.id === sessionId) {
          targetPinned = !s.isPinned;
          return { ...s, isPinned: targetPinned };
        }
        return s;
      });
      return [...updated].sort((a, b) => {
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1;
        }
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    });

    if (!user) return;
    try {
      const res = await fetchWithTimeout(`/api/strategist/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPinned: targetPinned })
      });
      if (!res.ok) {
        toast.error('Failed to update pinned status');
        loadSessions(); // revert
      }
    } catch (err) {
      console.error('Error pinning session:', err);
      loadSessions(); // revert
    }
  }, [user, loadSessions, setSessions]);

  const deleteSession = useCallback(async (sessionId: string) => {
    // Optimistic UI update
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (currentSessionId === sessionId) {
      strategistTypewriterRef.current?.clear();
      setCurrentSessionId(null);
      setMessages([]);
    }

    if (!user) return;
    try {
      const res = await fetchWithTimeout(`/api/strategist/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        toast.error('Failed to delete chat session');
        loadSessions(); // revert
      } else {
        toast.success('Chat session deleted successfully');
      }
    } catch (err) {
      console.error('Error deleting session:', err);
      loadSessions(); // revert
    }
  }, [user, currentSessionId, loadSessions, setSessions, setCurrentSessionId, setMessages]);

  const startNewChat = useCallback(() => {
    strategistTypewriterRef.current?.clear();
    setCurrentSessionId('new');
    setMessages([]);
    setCurrentPlan(null);
    setUploadedAttachment(null);
    setChatInput('');
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(`eai_strategist_messages_${documentId}`);
      sessionStorage.removeItem(`eai_strategist_current_plan_${documentId}`);
      sessionStorage.removeItem(`eai_strategist_sources_${documentId}`);
    }
  }, [documentId, setCurrentSessionId, setMessages, setCurrentPlan, setUploadedAttachment, setChatInput]);



  // Persist messages when they change
  useEffect(() => {
    if (
      !isTyping &&
      !strategistTypewriterRef.current?.isActive() &&
      typeof window !== 'undefined'
    ) {
      sessionStorage.setItem(`eai_strategist_messages_${documentId}`, JSON.stringify(messages));
    }
  }, [messages, isTyping, documentId]);

  // Persist currentPlan
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`eai_strategist_current_plan_${documentId}`, currentPlan ? JSON.stringify(currentPlan) : 'null');
    }
  }, [currentPlan, documentId]);

  // Persist collectedSources
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`eai_strategist_sources_${documentId}`, JSON.stringify(collectedSources));
    }
  }, [collectedSources, documentId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(
        `eai_strategist_deep_research_reports_${documentId}`,
        JSON.stringify(deepResearchReports)
      );
      sessionStorage.removeItem(`eai_strategist_deep_research_${documentId}`);
    } catch {
      toast.error(tReport('storageError'));
    }
  }, [deepResearchReports, documentId, tReport]);

  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);
  const [showResearchMenu, setShowResearchMenu] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [researchMode, setResearchMode] = useState<'fast' | 'deep'>('fast');
  const [enableSearch, setEnableSearch] = useState(true);
  const [credits, setCredits] = useState<number | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallMessage, setPaywallMessage] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const fetchCredits = useCallback(() => {
    fetchWithTimeout('/api/workspace/config')
      .then(res => res.json())
      .then(data => {
        if (data && data.plan) setCredits(data.plan.creditsRemaining);
      })
      .catch(err => console.error('Failed to load credits:', err));
  }, []);

  useEffect(() => { fetchCredits(); }, [fetchCredits]);

  const [isShowingAllSources, setIsShowingAllSources] = useState(false);

  const [activeDeepResearchId, setActiveDeepResearchId] = useState<string | null>(null);

  const [localNotes, setLocalNotes] = useState<ResearchNote[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]'); } catch { return []; }
  });

  const savedNotes = notes ?? localNotes;

  const updateSavedNotes = useCallback((newNotes: ResearchNote[] | ((prev: ResearchNote[]) => ResearchNote[])) => {
    if (onNotesChange) {
      const resolved = typeof newNotes === 'function' ? newNotes(savedNotes) : newNotes;
      onNotesChange(resolved);
    } else {
      setLocalNotes(newNotes);
    }
  }, [onNotesChange, savedNotes]);



  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(savedNotes));
  }, [savedNotes]);

  useEffect(() => {
    sessionStorage.setItem('eai_strategist_attachment', uploadedAttachment ? JSON.stringify(uploadedAttachment) : 'null');
  }, [uploadedAttachment]);

  const savedNoteIds = useMemo(() => new Set(savedNotes.map(n => n.id)), [savedNotes]);

  const [quickDraftMode, setQuickDraftMode] = useState<'topic' | 'outline' | 'reference' | 'press_release' | null>(null);
  const [quickDraftTopic, setQuickDraftTopic] = useState('');
  const [quickDraftOutline, setQuickDraftOutline] = useState('');
  const [quickDraftReference, setQuickDraftReference] = useState('');
  const [quickDraftOutput, setQuickDraftOutput] = useState('');
  const [isGeneratingQuickDraft, setIsGeneratingQuickDraft] = useState(false);
  const [quickDraftError, setQuickDraftError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeDeepResearchId) return;

    let cancelled = false;
    const pollController = new AbortController();
    const deadlineAt = Date.now() + (30 * 60_000);
    let nextPollTimer: ReturnType<typeof setTimeout> | undefined;

    const finishDeepResearchMessage = (
      content: string,
      lifecycle: Exclude<AssistantLifecycle, 'pending'>
    ) => {
      const messageId = deepResearchMessageIdRef.current;
      if (messageId) {
        setMessages(prev => prev.map(message => message.id === messageId
          ? {
              ...message,
              content,
              payload: {
                ...message.payload,
                status: undefined,
                lifecycle,
                isContentAnimating: false,
                isStreamComplete: true,
                isSupportReady: true,
              },
            }
          : message));
      } else {
        setMessages(prev => [...prev, {
          id: generateId(),
          role: 'assistant',
          type: 'text',
          content,
          payload: { lifecycle },
        }]);
      }
      deepResearchMessageIdRef.current = null;
      deepResearchCancelTokenRef.current = null;
      setIsTyping(false);
    };

    const poll = async () => {
      if (cancelled) return;
      if (Date.now() >= deadlineAt) {
        setActiveDeepResearchId(null);
        finishDeepResearchMessage('Deep Research timed out. Please try again.', 'error');
        return;
      }
      try {
        const res = await directFetch(
          getStrategistStatusPath(activeDeepResearchId),
          {
            signal: pollController.signal,
            timeoutMs: REQUEST_TIMEOUT_MS.polling,
          }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.state === 'COMPLETED' && data.output) {
            const completedReport: DeepResearchReport = {
              id: `deep-report-${generateId()}`,
              title: getDeepResearchReportTitle(data.output),
              content: data.output,
              createdAt: new Date().toISOString(),
            };
            setDeepResearchReports(previousReports => {
              if (previousReports.length >= MAX_DEEP_RESEARCH_REPORTS) {
                toast.warning(tReport('limitReached', {
                  max: MAX_DEEP_RESEARCH_REPORTS,
                }));
                return previousReports;
              }
              return [completedReport, ...previousReports];
            });
            setActiveDeepResearchId(null);
            finishDeepResearchMessage('Deep Research complete. Open the report from the right panel.', 'success');
            return;
          } else if (data.state === 'FAILED') {
            setActiveDeepResearchId(null);
            finishDeepResearchMessage('Deep Research encountered an error and failed to complete.', 'error');
            return;
          }
        }
      } catch (error) {
        if (!cancelled && !pollController.signal.aborted) {
          console.warn('Deep Research status poll failed:', error);
        }
      }

      if (!cancelled) nextPollTimer = setTimeout(poll, 10_000);
    };

    nextPollTimer = setTimeout(poll, 10_000);

    return () => {
      cancelled = true;
      pollController.abort();
      if (nextPollTimer) clearTimeout(nextPollTimer);
    };
  }, [activeDeepResearchId, directFetch, tReport]);

  const appendMessage = useCallback((msg: Omit<ChatMessage, 'id'>) => {
    setMessages(prev => [...prev, { ...msg, id: generateId() }]);
  }, []);

  const prepareDeepResearchFollowUp = useCallback((reportId: string, prompt: string) => {
    const report = deepResearchReports.find(item => item.id === reportId);
    if (!report) return;
    deepResearchFollowUpContentRef.current = report.content;
    setChatInput(prompt);
  }, [deepResearchReports]);

  const deleteDeepResearchReport = useCallback((reportId: string) => {
    setDeepResearchReports(previousReports =>
      previousReports.filter(report => report.id !== reportId)
    );
    toast.success(tReport('deleted'));
  }, [tReport]);

  const openQuickDraft = useCallback((mode: 'topic' | 'outline' | 'reference' | 'press_release') => {
    setQuickDraftMode(mode);
    setQuickDraftTopic('');
    setQuickDraftOutline('');
    setQuickDraftReference('');
    setQuickDraftOutput('');
    setQuickDraftError(null);
    setIsGeneratingQuickDraft(false);
    setShowAttachMenu(false);
  }, []);

  const closeQuickDraft = useCallback(() => {
    quickDraftAbortControllerRef.current?.abort();
    quickDraftAbortControllerRef.current = null;
    setQuickDraftMode(null);
    setQuickDraftTopic('');
    setQuickDraftOutline('');
    setQuickDraftReference('');
    setQuickDraftOutput('');
    setQuickDraftError(null);
    setIsGeneratingQuickDraft(false);
  }, []);

  const saveNote = useCallback((msg: ChatMessage) => {
    if (savedNoteIds.has(msg.id)) return;
    if (msg.content.length < 50) {
      toast.info('Content is too short to save as a note.');
      return;
    }
    if (savedNotes.length >= MAX_NOTES) {
      toast.warning('Maximum of 10 notes reached.');
      return;
    }
    const note: ResearchNote = {
      id: msg.id,
      content: msg.content,
      sources: msg.payload?.sources || [],
      savedAt: new Date().toISOString(),
    };
    updateSavedNotes(prev => [...prev, note]);
    toast.success('Note saved');
  }, [savedNoteIds, savedNotes.length, updateSavedNotes]);

  const handleCopy = useCallback((text: string, msgId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(msgId);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedMessageId(null), 2000);
  }, []);

  const handleProceedToEditor = useCallback(() => {
    if (!currentPlan) return;

    const sourcesMapped = (currentPlan.sources || []).map((url: string) => {
      let domain = 'Source';
      try { domain = new URL(url).hostname.replace('www.', ''); } catch {}
      return { url, domain };
    });

    const blueprintNote: ResearchNote = {
      id: `blueprint-${generateId()}`,
      content: [
        `# Blueprint: ${currentPlan.angle}`,
        `**Audience:** ${currentPlan.audience}`,
        `**SEO Intent:** ${currentPlan.seoIntent || 'N/A'}`,
        `**Hook:** ${currentPlan.hook}`,
        `\n## Outline`,
        currentPlan.outline,
        `\n## Draft`,
        currentPlan.draft,
      ].join('\n'),
      sources: sourcesMapped,
      savedAt: new Date().toISOString(),
    };

    const allNotes = [...savedNotes, blueprintNote];
    updateSavedNotes(allNotes);

    onComplete(currentPlan.angle, currentPlan.outline, currentPlan.draft, allNotes, uploadedAttachment ? [uploadedAttachment] : []);
  }, [currentPlan, savedNotes, uploadedAttachment, onComplete, updateSavedNotes]);

  const handleSaveToNotesOnly = useCallback(() => {
    if (!currentPlan) return;

    const sourcesMapped = (currentPlan.sources || []).map((url: string) => {
      let domain = 'Source';
      try { domain = new URL(url).hostname.replace('www.', ''); } catch {}
      return { url, domain };
    });

    const blueprintNote: ResearchNote = {
      id: `blueprint-${generateId()}`,
      content: [
        `# Blueprint: ${currentPlan.angle}`,
        `**Audience:** ${currentPlan.audience}`,
        `**SEO Intent:** ${currentPlan.seoIntent || 'N/A'}`,
        `**Hook:** ${currentPlan.hook}`,
        `\n## Outline`,
        currentPlan.outline,
        `\n## Draft`,
        currentPlan.draft,
      ].join('\n'),
      sources: sourcesMapped,
      savedAt: new Date().toISOString(),
    };

    const allNotes = [...savedNotes, blueprintNote];
    updateSavedNotes(allNotes);
    toast.success('Blueprint successfully saved to Notes!');
    setCurrentPlan(null);
  }, [currentPlan, savedNotes, updateSavedNotes]);

  const generatePlan = useCallback(async (recommendationText: string, history: ChatMessage[]) => {
    setIsTyping(true);
    const assistantMsgId = generateId();
    const requestId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', type: 'text', content: '', payload: { status: 'Generating Editorial Blueprint...', lifecycle: 'pending' } }]);

    chatAbortControllerRef.current?.abort();
    const controller = new AbortController();
    chatAbortControllerRef.current = controller;

    const applyPlanResult = (data: StrategistPlanResult<PreEditorPlan>) => {
      if (data.sessionId && data.sessionId !== currentSessionId) {
        setCurrentSessionId(data.sessionId);
        loadSessions();
      }

      if (data.plan) {
        setCurrentPlan(data.plan);
        if (data.plan.sources?.length > 0) {
          const fakeDomains = data.plan.sources.map((url: string) => {
            let domain = 'Source';
            try { domain = new URL(url).hostname.replace('www.', ''); } catch {}
            return { url, domain };
          });
          setCollectedSources(prev => {
            const existing = new Set(prev.map(s => s.url));
            return [...prev, ...fakeDomains.filter((s: { url: string; domain: string }) => !existing.has(s.url))];
          });
        }
      }

      let displayContent = data.reply || "";
      if (data.plan) {
        const plan = data.plan;
        displayContent += `\n\n### **Blueprint Preview**\n`;
        displayContent += `* **Angle**: ${plan.angle || 'N/A'}\n`;
        displayContent += `* **Audience**: ${plan.audience || 'N/A'}\n`;
        if (plan.hook) {
          displayContent += `* **Hook**: *"${plan.hook}"*\n`;
        }
        displayContent += `\n`;

        if (plan.outline) {
          displayContent += `### **Proposed Outline**\n${plan.outline}\n\n`;
        }

        if (plan.sources?.length > 0) {
          displayContent += `### **Sources**\n`;
          plan.sources.forEach((src: string, index: number) => {
            let domain = 'Source';
            try { domain = new URL(src).hostname.replace('www.', ''); } catch {}
            displayContent += `${index + 1}. [${domain}](${src})\n`;
          });
          displayContent += `\n`;
        }

        if (plan.draft) {
          displayContent += `### **Draft Preview**\n${plan.draft}\n`;
        }
      }

      setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
        id: assistantMsgId,
        role: 'assistant',
        type: 'text',
        content: displayContent,
        payload: { suggestions: data.suggestions, lifecycle: 'success' }
      } : m));
    };

    try {
      const res = await directFetch('/api/strategist/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        timeoutMs: REQUEST_TIMEOUT_MS.aiFlex,
        body: JSON.stringify({ requestId, recommendation: recommendationText, history, sessionId: currentSessionId }),
      });

      if (!res.ok) {
        throw new Error(await getResponseErrorMessage(res, `Plan generation failed (${res.status})`));
      }
      if (res.status === 202) {
        throw new Error('Blueprint request is still processing');
      }
      const data = await res.json() as StrategistPlanResult<PreEditorPlan>;
      applyPlanResult(data);
    } catch (error) {
      if (controller.signal.aborted) {
        setMessages(prev => prev.filter(message => message.id !== assistantMsgId));
        return;
      }

      let recovered: StrategistPlanResult<PreEditorPlan> | null = null;
      try {
        recovered = await recoverStrategistPlanResult<PreEditorPlan>(
          directFetch,
          requestId,
          { signal: controller.signal }
        );
      } catch {
        // Preserve the original request error below when recovery confirms failure.
      }
      if (controller.signal.aborted) {
        setMessages(prev => prev.filter(message => message.id !== assistantMsgId));
        return;
      }
      if (recovered) {
        applyPlanResult(recovered);
        return;
      }

      const message = error instanceof Error ? error.message : 'Failed to generate draft plan';
      toast.error(message);
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
        id: assistantMsgId,
        role: 'assistant',
        type: 'text',
        content: `I failed to generate the plan. ${message}`,
        payload: { lifecycle: 'error' },
      } : m));
    } finally {
      setIsTyping(false);
      if (chatAbortControllerRef.current === controller) {
        chatAbortControllerRef.current = null;
      }
    }
  }, [currentSessionId, directFetch, loadSessions]);

  const handleRewrite = useCallback(async (msgId: string) => {
    const msgIndex = messages.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;

    const messagesBefore = messages.slice(0, msgIndex);
    const lastUserMessage = messagesBefore[messagesBefore.length - 1];
    if (!lastUserMessage || lastUserMessage.role !== 'user') {
      toast.error('Cannot find user message to rewrite');
      return;
    }

    setMessages(messagesBefore);
    setIsTyping(true);

    const notesSummary = savedNotes.length > 0
      ? `[SAVED NOTES CONTEXT: ${savedNotes.length} notes saved. Snippets: ${savedNotes.map((n, idx) => {
          const cleanText = n.content.replace(/\s*\[\d+\]\([^)]+\)/g, '');
          const snippet = cleanText.slice(0, 80).replace(/\n/g, ' ');
          return `Note ${idx + 1}: "${snippet}..."`;
        }).join(' | ')}]`
      : undefined;

    const assistantMsgId = generateId();
    const chatRequestId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: assistantMsgId,
      role: 'assistant',
      type: 'text',
      content: '',
      payload: {
        status: researchMode === 'deep' ? 'Initiating Deep Research...' : 'Thinking...',
        lifecycle: 'pending',
        isSupportReady: false,
      }
    }]);

    if (chatAbortControllerRef.current) {
      chatAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    chatAbortControllerRef.current = controller;

    try {
      const res = await directFetch(getStrategistChatPath(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          requestId: chatRequestId,
          messages: messagesBefore,
          mode: researchMode,
          notesSummary,
          attachments: uploadedAttachment ? [uploadedAttachment] : [],
          enableSearch,
          sessionId: currentSessionId,
        }),
      });

      if (!res.ok) {
        if (res.status === 403) {
          const errData = await res.json().catch(() => ({}));
          if (errData.code === 'INSUFFICIENT_CREDITS' || errData.code === 'AUTH_REQUIRED') {
            setIsTyping(false);
            setPaywallMessage(errData.message || 'Access denied.');
            setPaywallOpen(true);
            setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
            return;
          }
        }
        throw new Error(await getResponseErrorMessage(res, `Strategist request failed (${res.status})`));
      }
      if (res.status === 202) {
        throw new Error('Strategist request is still processing');
      }

      if (!res.body) throw new Error('No body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let currentContent = '';
      let buffer = '';
      let receivedDone = false;
      let deepResearchStarted = false;

      while (!done) {
        const { value, done: readerDone } = await readWithTimeout(
          reader,
          45_000,
          (reason) => controller.abort(reason)
        );
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
              const dataStr = line.trim().slice(6);
              const parsedEvent = parseStrategistSseLine(line);
              if (parsedEvent?.type === 'error') {
                throw new Error(getStrategistStreamError(parsedEvent));
              }
              try {
                const data = JSON.parse(dataStr);
                if (data.type === 'session_init') {
                  setCurrentSessionId(data.sessionId);
                  loadSessions();
                } else if (data.type === 'deep_research_started') {
                  deepResearchStarted = true;
                  deepResearchMessageIdRef.current = assistantMsgId;
                  deepResearchCancelTokenRef.current = typeof data.cancel_token === 'string'
                    ? data.cancel_token
                    : null;
                  setActiveDeepResearchId(data.interaction_id);
                  setMessages(prev => prev.map(m => m.id === assistantMsgId
                    ? { ...m, payload: { ...m.payload, status: 'Deep Research in progress...' } }
                    : m));
                } else if (data.type === 'thinking' && data.chunk) {
                  const thinkingKind: StrategistThinkingKind =
                    data.kind === 'grounding' ? 'grounding' : 'reasoning';
                  enqueueStrategistThinking(
                    assistantMsgId,
                    thinkingKind,
                    data.chunk
                  );
                } else if (data.type === 'chunk' || data.type === 'text') {
                  currentContent += data.chunk;
                  const { displayContent, suggestions } = extractDynamicSuggestions(currentContent);
                  enqueueStrategistContent(
                    assistantMsgId,
                    displayContent,
                    suggestions
                  );
                } else if (data.type === 'replace_text') {
                  currentContent = data.text;
                  const { displayContent, suggestions } = extractDynamicSuggestions(currentContent);
                  enqueueStrategistContent(
                    assistantMsgId,
                    displayContent,
                    suggestions
                  );
                } else if (data.type === 'sources') {
                  if (data.sources && data.sources.length > 0) {
                    setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, payload: { ...m.payload, sources: data.sources } } : m));
                  }
                } else if (data.type === 'done') {
                  receivedDone = true;
                }
              } catch { /* skip */ }
            }
          }
        }
      }

      if (controller.signal.aborted) {
        dropStrategistTypewriter(assistantMsgId);
        setMessages(prev => prev.flatMap(m => {
          if (m.id !== assistantMsgId) return [m];
          return m.content.trim()
            ? [{ ...m, payload: { ...m.payload, status: undefined, lifecycle: 'cancelled', isContentAnimating: false } }]
            : [];
        }));
        return;
      }

      if (!receivedDone) {
        throw new Error('Connection lost prematurely. Please retry.');
      }

      const sugMatch = currentContent.match(/\[SUGGESTIONS:\s*([\s\S]*?)\](?![^\]]*\])/);
      if (sugMatch) {
        const extractedSuggestions = sugMatch[1].split('|').map(s => s.trim());
        currentContent = currentContent.replace(sugMatch[0], '').trim();
        enqueueStrategistContent(
          assistantMsgId,
          currentContent,
          extractedSuggestions
        );
      } else {
        const cleaned = currentContent.replace(/\[SUGGESTIONS:[\s\S]*/g, '').trim();
        if (cleaned !== currentContent) {
          currentContent = cleaned;
          enqueueStrategistContent(
            assistantMsgId,
            currentContent,
            undefined
          );
        }
      }

      if (!deepResearchStarted) {
        completeStrategistStream(assistantMsgId);
      }
      fetchCredits();
    } catch (error) {
      if (controller.signal.aborted && !(error instanceof StreamIdleTimeoutError)) {
        console.log('Chat stream aborted.');
        dropStrategistTypewriter(assistantMsgId);
        setMessages(prev => prev.flatMap(m => {
          if (m.id !== assistantMsgId) return [m];
          return m.content.trim()
            ? [{ ...m, payload: { ...m.payload, status: undefined, lifecycle: 'cancelled', isContentAnimating: false } }]
            : [];
        }));
        return;
      }
      const recovery = await recoverStrategistChatRequest(
        directFetch,
        chatRequestId,
        { signal: controller.signal }
      );
      if (controller.signal.aborted) {
        dropStrategistTypewriter(assistantMsgId);
        setMessages(prev => prev.filter(message => message.id !== assistantMsgId));
        return;
      }
      if (recovery?.status === 'completed') {
        setCurrentSessionId(recovery.result.sessionId);
        loadSessions();
        const { displayContent, suggestions } = extractDynamicSuggestions(
          recovery.result.text
        );
        dropStrategistTypewriter(assistantMsgId);
        setMessages(prev => prev.map(item => item.id === assistantMsgId
          ? {
              ...item,
              payload: {
                ...item.payload,
                status: undefined,
                suggestions,
                sources: recovery.result.sources,
                isSupportReady: false,
              },
            }
          : item));
        enqueueStrategistContent(
          assistantMsgId,
          displayContent,
          suggestions
        );
        completeStrategistStream(assistantMsgId);
        fetchCredits();
        return;
      }
      const message = recovery?.status === 'failed'
        ? recovery.error.message
        : error instanceof Error
          ? error.message
          : 'Failed to rewrite message';
      toast.error(message);
      dropStrategistTypewriter(assistantMsgId);
      setMessages(prev => prev.map(m => m.id === assistantMsgId
        ? {
            ...m,
            content: m.content.trim() || message,
            payload: { ...m.payload, status: undefined, lifecycle: 'error', isContentAnimating: false },
          }
        : m));
    } finally {
      setIsTyping(false);
      chatAbortControllerRef.current = null;
    }
  }, [messages, savedNotes, researchMode, uploadedAttachment, enableSearch, fetchCredits, currentSessionId, directFetch, loadSessions, setCurrentSessionId, setMessages]);

  const submitQuickDraft = useCallback(async () => {
    if (!quickDraftTopic.trim() || isGeneratingQuickDraft || !quickDraftMode) return;

    setIsGeneratingQuickDraft(true);
    setQuickDraftOutput('');
    setQuickDraftError(null);

    const isOutlineMode = quickDraftMode === 'outline';
    const body: Record<string, unknown> = {
      topic: quickDraftTopic,
      mode: isOutlineMode ? 'outline' : 'draft',
      draftMode: isOutlineMode ? 'topic' : quickDraftMode,
    };

    if (!isOutlineMode && quickDraftOutline.trim()) body.outline = quickDraftOutline;
    if ((quickDraftMode === 'reference' || quickDraftMode === 'press_release') && quickDraftReference.trim()) body.referenceText = quickDraftReference;

    if (quickDraftAbortControllerRef.current) {
      quickDraftAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    quickDraftAbortControllerRef.current = controller;

    try {
      const res = await directFetch('/api/strategist/quick-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const result = await res.json().catch(() => null);
        throw new Error(result?.error || `Quick draft failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Response reader not available');

      const decoder = new TextDecoder();
      let buf = '';
      let output = '';
      let receivedComplete = false;

      while (true) {
        const { done: rd, value } = await readWithTimeout(
          reader,
          45_000,
          (reason) => controller.abort(reason)
        );
        if (rd) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: { type: string; data: unknown };
          try { event = JSON.parse(line); } catch { continue; }
          if (event.type === 'draft_chunk') {
            output += event.data as string;
            setQuickDraftOutput(output);
          } else if (event.type === 'complete') {
            receivedComplete = true;
          } else if (event.type === 'error') {
            throw new Error(event.data as string);
          }
        }
      }

      if (controller.signal.aborted) {
        return;
      }

      if (!receivedComplete) {
        throw new Error('Connection lost prematurely. Please retry.');
      }

      appendMessage({ role: 'user', type: 'text', content: `Quick draft request (${quickDraftMode.replace('_', ' ')}): ${quickDraftTopic}` });

      appendMessage({
        role: 'assistant',
        type: 'text',
        content: isOutlineMode
          ? `Here is a structured outline for **${quickDraftTopic}**:\n\n${output}`
          : `Here is a rough draft for **${quickDraftTopic}**:\n\n${output}`,
      });

      setCurrentPlan({
        angle: quickDraftTopic,
        audience: '',
        hook: '',
        outline: isOutlineMode ? output : quickDraftOutline,
        seoIntent: '',
        sources: [],
        draft: output,
      });

      closeQuickDraft();
    } catch (err: unknown) {
      if (controller.signal.aborted && !(err instanceof StreamIdleTimeoutError)) {
        console.log('Quick draft aborted.');
        return;
      }
      const message = err instanceof Error ? err.message : 'Quick draft failed';
      setQuickDraftError(message);
      toast.error(message);
    } finally {
      setIsGeneratingQuickDraft(false);
      quickDraftAbortControllerRef.current = null;
    }
  }, [quickDraftTopic, quickDraftMode, quickDraftOutline, quickDraftReference, isGeneratingQuickDraft, appendMessage, closeQuickDraft]);

  const handleFileUpload = useCallback(async (file: File) => {
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File size exceeds the maximum limit of 10MB.');
      return;
    }

    const loadingToast = toast.loading('Uploading and extracting file content...');
    setShowAttachMenu(false);
    try {
      const presignedRes = await fetchWithTimeout('/api/storage/presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type || 'text/plain' }),
      });

      if (!presignedRes.ok) {
        const errData = await presignedRes.json();
        throw new Error(errData.error || 'Failed to get upload authorization');
      }

      const { uploadUrl, fileKey, publicUrl } = await presignedRes.json();

      const uploadRes = await fetchWithTimeout(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'text/plain' },
        body: file,
      });

      if (!uploadRes.ok) throw new Error('Failed to upload file to storage');

      const extractRes = await fetchWithTimeout('/api/storage/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileKey, contentType: file.type || 'text/plain', filename: file.name, publicUrl }),
      });

      if (!extractRes.ok) {
        const errData = await extractRes.json();
        throw new Error(errData.error || 'Failed to extract text from file');
      }

      const { attachment } = await extractRes.json();
      setUploadedAttachment(attachment);
      toast.success('File uploaded and processed successfully!', { id: loadingToast });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to attach file';
      toast.error(msg, { id: loadingToast });
    }
  }, [setUploadedAttachment]);

  const cancelDeepResearch = useCallback(async () => {
    const interactionId = activeDeepResearchId;
    const cancelToken = deepResearchCancelTokenRef.current;
    if (!interactionId || !cancelToken) return;

    try {
      const response = await directFetch(
        getStrategistCancelPath(interactionId),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cancelToken }),
          timeoutMs: 8_000,
        }
      );
      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response, 'Failed to cancel Deep Research.'));
      }

      const messageId = deepResearchMessageIdRef.current;
      setMessages(prev => prev.map(message => message.id === messageId
        ? {
            ...message,
            content: 'Deep Research cancelled.',
            payload: { ...message.payload, status: undefined, lifecycle: 'cancelled' },
          }
        : message));
      setActiveDeepResearchId(null);
      deepResearchMessageIdRef.current = null;
      deepResearchCancelTokenRef.current = null;
      toast.info('Deep Research cancelled');
    } catch (error) {
      if (error instanceof RequestTimeoutError) {
        toast.error('Cancellation could not be confirmed. The research may still be stopping.');
      } else {
        toast.error(error instanceof Error ? error.message : 'Failed to cancel Deep Research.');
      }
    }
  }, [activeDeepResearchId, directFetch, setActiveDeepResearchId, setMessages]);

  const cancelChat = useCallback(() => {
    if (activeDeepResearchId) {
      void cancelDeepResearch();
      return;
    }
    if (chatAbortControllerRef.current) {
      chatAbortControllerRef.current.abort();
      chatAbortControllerRef.current = null;
    }
    setIsTyping(false);
  }, [activeDeepResearchId, cancelDeepResearch]);

  const handleSend = useCallback(async (forcedText?: string) => {
    const textToSend = forcedText ?? chatInput;
    if (!textToSend.trim()) return;
    const deepResearchFollowUpContent = deepResearchFollowUpContentRef.current;

    if (textToSend === 'Proceed to Editor' && currentPlan) {
      handleProceedToEditor();
      return;
    }

    if (textToSend === 'Save to Notes' && currentPlan) {
      handleSaveToNotesOnly();
      return;
    }

    const DRAFT_INTENT_PATTERN = /\b(buat(kan)?|tulis(kan)?|generate|write|create|bikin)\b.{0,30}\b(draft|blueprint|plan|roadmap)\b|\b(draft|blueprint|plan|roadmap)\b.{0,25}\bartikel\b/i;
    const isDraftIntent =
      DRAFT_INTENT_PATTERN.test(textToSend) ||
      textToSend.toLowerCase().startsWith('draft') ||
      textToSend.toLowerCase().startsWith('blueprint');

    if (
      !deepResearchFollowUpContent &&
      !isDraftIntent &&
      researchMode === 'deep' &&
      deepResearchReports.length >= MAX_DEEP_RESEARCH_REPORTS
    ) {
      toast.warning(tReport('limitReached', {
        max: MAX_DEEP_RESEARCH_REPORTS,
      }));
      return;
    }

    if (!forcedText) setChatInput('');
    setIsTyping(true);
    setShowAttachMenu(false);

    let messageText = textToSend;
    if (textToSend === 'Revise Blueprint') {
      messageText = "I want to revise the blueprint with different data. Please forget the previous draft idea.";
      setCurrentPlan(null);
    }

    const newMsg: ChatMessage = { id: generateId(), role: 'user', type: 'text', content: messageText };
    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);

    if (!deepResearchFollowUpContent && isDraftIntent) {
      generatePlan(messageText, updatedMessages);
      return;
    }

    const notesSummary = savedNotes.length > 0
      ? `[SAVED NOTES CONTEXT: ${savedNotes.length} notes saved. Snippets: ${savedNotes.map((n, idx) => {
          const cleanText = n.content.replace(/\s*\[\d+\]\([^)]+\)/g, '');
          const snippet = cleanText.slice(0, 80).replace(/\n/g, ' ');
          return `Note ${idx + 1}: "${snippet}..."`;
        }).join(' | ')}]`
      : undefined;

    const assistantMsgId = generateId();
    const chatRequestId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: assistantMsgId,
      role: 'assistant',
      type: 'text',
      content: '',
      payload: {
        status: researchMode === 'deep' ? 'Initiating Deep Research...' : 'Thinking...',
        lifecycle: 'pending',
        isSupportReady: false,
      }
    }]);

    if (chatAbortControllerRef.current) {
      chatAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    chatAbortControllerRef.current = controller;

    try {
      deepResearchFollowUpContentRef.current = null;
      const requestAttachments: Attachment[] = [
        ...(deepResearchFollowUpContent
          ? [{
              id: `deep-report-${documentId}`,
              filename: 'deep-research-report.md',
              r2Key: '',
              publicUrl: '',
              contentType: 'text/markdown',
              extractedText: deepResearchFollowUpContent.slice(0, 250_000),
              uploadedAt: new Date().toISOString(),
            }]
          : []),
        ...(uploadedAttachment ? [uploadedAttachment] : []),
      ];
      const res = await directFetch(getStrategistChatPath(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          requestId: chatRequestId,
          messages: updatedMessages,
          mode: researchMode,
          notesSummary,
          attachments: requestAttachments,
          enableSearch,
          sessionId: currentSessionId,
        }),
      });

      if (researchMode === 'deep') setResearchMode('fast');

      if (!res.ok) {
        if (res.status === 403) {
          const errData = await res.json().catch(() => ({}));
          if (errData.code === 'INSUFFICIENT_CREDITS' || errData.code === 'AUTH_REQUIRED') {
            setIsTyping(false);
            setPaywallMessage(errData.message || 'Access denied.');
            setPaywallOpen(true);
            setMessages(prev => prev.filter(m => m.id !== newMsg.id && m.id !== assistantMsgId));
            return;
          }
        }
        throw new Error(await getResponseErrorMessage(res, `Strategist request failed (${res.status})`));
      }
      if (res.status === 202) {
        throw new Error('Strategist request is still processing');
      }
      if (!res.body) throw new Error('No body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let currentContent = '';
      let buf = '';
      let receivedDone = false;
      let deepResearchStarted = false;

      while (!done) {
        const { value, done: readerDone } = await readWithTimeout(
          reader,
          45_000,
          (reason) => controller.abort(reason)
        );
        done = readerDone;
        if (value) {
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';

          for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
              const dataStr = line.trim().slice(6);
              const parsedEvent = parseStrategistSseLine(line);
              if (parsedEvent?.type === 'error') {
                throw new Error(getStrategistStreamError(parsedEvent));
              }
              try {
                const data = JSON.parse(dataStr);
                if (data.type === 'session_init') {
                  setCurrentSessionId(data.sessionId);
                  loadSessions();
                } else if (data.type === 'deep_research_started') {
                  deepResearchStarted = true;
                  deepResearchMessageIdRef.current = assistantMsgId;
                  deepResearchCancelTokenRef.current = typeof data.cancel_token === 'string'
                    ? data.cancel_token
                    : null;
                  setActiveDeepResearchId(data.interaction_id);
                  setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, payload: { ...m.payload, status: "Deep Research in progress..." } } : m));
                } else if (data.type === 'status') {
                  setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, payload: { ...m.payload, status: data.message } } : m));
                } else if (data.type === 'thinking' && data.chunk) {
                  const thinkingKind: StrategistThinkingKind =
                    data.kind === 'grounding' ? 'grounding' : 'reasoning';
                  enqueueStrategistThinking(
                    assistantMsgId,
                    thinkingKind,
                    data.chunk
                  );
                } else if (data.type === 'text') {
                  currentContent += data.chunk;
                  const { displayContent, suggestions } = extractDynamicSuggestions(currentContent);
                  enqueueStrategistContent(
                    assistantMsgId,
                    displayContent,
                    suggestions
                  );
                } else if (data.type === 'replace_text') {
                  currentContent = data.text;
                  const { displayContent, suggestions } = extractDynamicSuggestions(currentContent);
                  enqueueStrategistContent(
                    assistantMsgId,
                    displayContent,
                    suggestions
                  );
                } else if (data.type === 'sources') {
                  if (data.sources && data.sources.length > 0) {
                    setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, payload: { ...m.payload, sources: data.sources } } : m));
                  }
                } else if (data.type === 'done') {
                  receivedDone = true;
                }
              } catch { /* skip */ }
            }
          }
        }
      }

      if (controller.signal.aborted) {
        dropStrategistTypewriter(assistantMsgId);
        setMessages(prev => prev.flatMap(m => {
          if (m.id !== assistantMsgId) return [m];
          return m.content.trim()
            ? [{ ...m, payload: { ...m.payload, status: undefined, lifecycle: 'cancelled', isContentAnimating: false } }]
            : [];
        }));
        return;
      }

      if (!receivedDone) {
        throw new Error('Connection lost prematurely. Please retry.');
      }

      const sugMatch = currentContent.match(/\[SUGGESTIONS:\s*([\s\S]*?)\](?![^\]]*\])/);
      if (sugMatch) {
        const extractedSuggestions = sugMatch[1].split('|').map(s => s.trim());
        currentContent = currentContent.replace(sugMatch[0], '').trim();
        enqueueStrategistContent(
          assistantMsgId,
          currentContent,
          extractedSuggestions
        );
      } else {
        const cleaned = currentContent.replace(/\[SUGGESTIONS:[\s\S]*/g, '').trim();
        if (cleaned !== currentContent) {
          currentContent = cleaned;
          enqueueStrategistContent(
            assistantMsgId,
            currentContent,
            undefined
          );
        }
      }

      if (!deepResearchStarted) {
        completeStrategistStream(assistantMsgId);
      }
      fetchCredits();
    } catch (error) {
      if (controller.signal.aborted && !(error instanceof StreamIdleTimeoutError)) {
        console.log('Chat stream aborted.');
        dropStrategistTypewriter(assistantMsgId);
        setMessages(prev => prev.flatMap(m => {
          if (m.id !== assistantMsgId) return [m];
          return m.content.trim()
            ? [{ ...m, payload: { ...m.payload, status: undefined, lifecycle: 'cancelled', isContentAnimating: false } }]
            : [];
        }));
        return;
      }
      const recovery = await recoverStrategistChatRequest(
        directFetch,
        chatRequestId,
        { signal: controller.signal }
      );
      if (controller.signal.aborted) {
        dropStrategistTypewriter(assistantMsgId);
        setMessages(prev => prev.filter(message => message.id !== assistantMsgId));
        return;
      }
      if (recovery?.status === 'completed') {
        setCurrentSessionId(recovery.result.sessionId);
        loadSessions();
        const { displayContent, suggestions } = extractDynamicSuggestions(
          recovery.result.text
        );
        dropStrategistTypewriter(assistantMsgId);
        setMessages(prev => prev.map(item => item.id === assistantMsgId
          ? {
              ...item,
              payload: {
                ...item.payload,
                status: undefined,
                suggestions,
                sources: recovery.result.sources,
                isSupportReady: false,
              },
            }
          : item));
        enqueueStrategistContent(
          assistantMsgId,
          displayContent,
          suggestions
        );
        completeStrategistStream(assistantMsgId);
        fetchCredits();
        return;
      }

      const message = recovery?.status === 'failed'
        ? recovery.error.message
        : error instanceof Error
          ? error.message
          : 'Failed to send message';
      toast.error(message);
      dropStrategistTypewriter(assistantMsgId);
      setMessages(prev => prev.map(item => item.id === assistantMsgId
        ? {
            ...item,
            content: item.content.trim() || message,
            payload: { ...item.payload, status: undefined, lifecycle: 'error', isContentAnimating: false },
          }
        : item));
    } finally {
      setIsTyping(false);
      chatAbortControllerRef.current = null;
    }
  }, [chatInput, messages, currentPlan, savedNotes, researchMode, uploadedAttachment, enableSearch, deepResearchReports, documentId, tReport, handleProceedToEditor, handleSaveToNotesOnly, generatePlan, fetchCredits, currentSessionId, loadSessions, setMessages, setCurrentSessionId, setActiveDeepResearchId, setResearchMode]);

  return {
    messages,
    chatInput,
    setChatInput,
    isTyping: isTyping || Boolean(activeDeepResearchId),
    handleSend,
    handleRewrite,
    savedNotes,
    saveNote,
    setSavedNotes: updateSavedNotes,
    uploadedAttachment,
    setUploadedAttachment,
    currentPlan,
    handleProceedToEditor,

    quickDraftMode,
    openQuickDraft,
    closeQuickDraft,
    quickDraftTopic,
    setQuickDraftTopic,
    quickDraftOutline,
    setQuickDraftOutline,
    quickDraftReference,
    setQuickDraftReference,
    quickDraftOutput,
    isGeneratingQuickDraft,
    submitQuickDraft,
    quickDraftError,
    collectedSources,
    isShowingAllSources,
    setIsShowingAllSources,
    deepResearchReports,
    maxDeepResearchReports: MAX_DEEP_RESEARCH_REPORTS,
    prepareDeepResearchFollowUp,
    deleteDeepResearchReport,
    researchMode,
    setResearchMode,
    enableSearch,
    setEnableSearch,
    credits,
    paywallOpen,
    setPaywallOpen,
    paywallMessage,
    copiedMessageId,
    handleCopy,
    showAttachMenu,
    setShowAttachMenu,
    handleFileUpload,
    showSlashMenu,
    setShowSlashMenu,
    slashMenuIndex,
    setSlashMenuIndex,
    showResearchMenu,
    setShowResearchMenu,
    generatePlan,
    currentSessionId,
    setCurrentSessionId,
    sessions,
    isSessionsLoading,
    loadSessions,
    selectSession,
    renameSession,
    togglePinSession,
    deleteSession,
    startNewChat,
    cancelChat,
  };
}
