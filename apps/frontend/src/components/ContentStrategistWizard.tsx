'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, Upload, Link as LinkIcon, Search, X, FileText, Rocket, ExternalLink, Newspaper, Loader2, List, Bookmark, Check, Edit3, Target, ChevronDown, ChevronLeft, Copy, Download, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';

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
  savedAt: string; // ISO timestamp
};

export type Attachment = {
  id: string;
  filename: string;
  r2Key: string;
  publicUrl: string;
  contentType: string;
  extractedText: string;
  uploadedAt: string; // ISO timestamp
};

export type ChatMessageType = 'text' | 'welcome' | 'recommendations' | 'plan';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  type: ChatMessageType;
  content: string;
  payload?: {
    status?: string;
    suggestions?: string[];
    sources?: { url: string; domain: string; title?: string; description?: string }[];
  };
};

interface ContentStrategistWizardProps {
  onComplete: (topic: string, outline: string, draft: string, notes: ResearchNote[], attachments: Attachment[]) => void;
  onCancel: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

export default function ContentStrategistWizard({ onComplete, onCancel }: ContentStrategistWizardProps) {
  const { user } = useUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea whenever chatInput changes (including programmatic updates
  // from prompt templates inserted via the + menu — not just user keystrokes).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [chatInput]);

  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);
  const [showResearchMenu, setShowResearchMenu] = useState(false);

  const slashCommands = [
    { id: 'generate-plan', label: 'Generate Plan', icon: <FileText className="w-4 h-4" /> },
    { id: 'open-editor', label: 'Open Editor', icon: <Edit3 className="w-4 h-4" /> },
    { id: 'research-topic', label: 'Research Topic', icon: <Search className="w-4 h-4" /> },
    { id: 'seo-strategy', label: 'SEO Strategy', icon: <Target className="w-4 h-4" /> },
  ];

  const executeSlashCommand = (id: string) => {
    setShowSlashMenu(false);
    
    if (id === 'generate-plan') {
      setChatInput('Draft a plan for: ');
    } else if (id === 'open-editor') {
      if (currentPlan) {
        onComplete(currentPlan.angle, currentPlan.outline, currentPlan.draft, savedNotes, uploadedAttachment ? [uploadedAttachment] : []);
      } else {
        toast.error("No plan available to open editor.");
        setChatInput('');
      }
    } else if (id === 'research-topic') {
      setChatInput('research topic: ');
    } else if (id === 'seo-strategy') {
      setChatInput('seo strategy for: ');
    }
    
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [researchMode, setResearchMode] = useState<'fast' | 'deep'>('fast');
  const [enableSearch, setEnableSearch] = useState(true);
  const [credits, setCredits] = useState<number | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallMessage, setPaywallMessage] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const fetchCredits = () => {
    fetch('/api/workspace/config')
      .then(res => res.json())
      .then(data => {
        if (data && data.plan) {
          setCredits(data.plan.creditsRemaining);
        }
      })
      .catch(err => console.error('Failed to load credits:', err));
  };

  useEffect(() => {
    fetchCredits();
  }, []);

  const [collectedSources, setCollectedSources] = useState<{ url: string; domain: string; title?: string; description?: string }[]>([]);
  const [isShowingAllSources, setIsShowingAllSources] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PreEditorPlan | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const researchMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        showResearchMenu &&
        researchMenuRef.current &&
        !researchMenuRef.current.contains(target)
      ) {
        setShowResearchMenu(false);
      }
      if (
        showAttachMenu &&
        attachMenuRef.current &&
        !attachMenuRef.current.contains(target)
      ) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [showResearchMenu, showAttachMenu]);

  const [activeDeepResearchId, setActiveDeepResearchId] = useState<string | null>(null);
  const [deepResearchReport, setDeepResearchReport] = useState<string | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);

  // Research Notes — NotebookLM approach
  const SESSION_KEY = 'eai_research_notes';
  const MAX_NOTES = 10;
  const [savedNotes, setSavedNotes] = useState<ResearchNote[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]'); } catch { return []; }
  });
  const [uploadedAttachment, setUploadedAttachment] = useState<Attachment | null>(null);
  const savedNoteIds = useMemo(() => new Set(savedNotes.map(n => n.id)), [savedNotes]); // eslint-disable-line react-hooks/preserve-manual-memoization

  // Quick Draft attach-menu modal state
  const [quickDraftMode, setQuickDraftMode] = useState<'topic' | 'outline' | 'reference' | 'press_release' | null>(null);
  const [quickDraftTopic, setQuickDraftTopic] = useState('');
  const [quickDraftOutline, setQuickDraftOutline] = useState('');
  const [quickDraftReference, setQuickDraftReference] = useState('');
  const [quickDraftOutput, setQuickDraftOutput] = useState('');
  const [isGeneratingQuickDraft, setIsGeneratingQuickDraft] = useState(false);
  const [quickDraftError, setQuickDraftError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeDeepResearchId) return;

    let pollCount = 0;
    const MAX_POLLS = 180; // 30 minutes

    const interval = setInterval(async () => {
      if (pollCount >= MAX_POLLS) {
        clearInterval(interval);
        setActiveDeepResearchId(null);
        setMessages(prev => [...prev, {
          id: generateId(),
          role: 'assistant',
          type: 'text',
          content: "Deep Research timed out. Please try again."
        }]);
        setIsTyping(false);
        return;
      }
      pollCount++;
      try {
        const res = await fetch(`/api/strategist/chat/status/${activeDeepResearchId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.state === 'COMPLETED' && data.output) {
            setDeepResearchReport(data.output);
            setActiveDeepResearchId(null);
            
            setMessages(prev => [...prev, {
              id: generateId(),
              role: 'assistant',
              type: 'text',
              content: "My Deep Research is complete. I've prepared a comprehensive report for you. Click the report card on the right to view it."
            }]);
            setIsTyping(false);
          } else if (data.state === 'FAILED') {
            setActiveDeepResearchId(null);
            setMessages(prev => [...prev, {
              id: generateId(),
              role: 'assistant',
              type: 'text',
              content: "Deep Research encountered an error and failed to complete."
            }]);
            setIsTyping(false);
          }
        }
      } catch (e) {
        console.error(e);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [activeDeepResearchId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (!isTyping && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isTyping]);

  // Sync research notes to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(savedNotes));
  }, [savedNotes, SESSION_KEY]);


  const appendMessage = (msg: Omit<ChatMessage, 'id'>) => {
    setMessages(prev => [...prev, { ...msg, id: generateId() }]);
  };

  const openQuickDraft = (mode: 'topic' | 'outline' | 'reference' | 'press_release') => {
    setQuickDraftMode(mode);
    setQuickDraftTopic('');
    setQuickDraftOutline('');
    setQuickDraftReference('');
    setQuickDraftOutput('');
    setQuickDraftError(null);
    setIsGeneratingQuickDraft(false);
    setShowAttachMenu(false);
  };

  const closeQuickDraft = () => {
    setQuickDraftMode(null);
    setQuickDraftTopic('');
    setQuickDraftOutline('');
    setQuickDraftReference('');
    setQuickDraftOutput('');
    setQuickDraftError(null);
    setIsGeneratingQuickDraft(false);
  };

  const saveNote = (msg: ChatMessage) => {
    if (savedNoteIds.has(msg.id)) return;
    if (msg.content.length < 50) {
      toast.info('Content is too short to save as a note.');
      return;
    }
    if (savedNotes.length >= MAX_NOTES) {
      toast.warning('Maximum of 10 notes reached. Delete some notes in the right panel to add a new one.');
      return;
    }
    const note: ResearchNote = {
      id: msg.id,
      content: msg.content,
      sources: msg.payload?.sources || [],
      savedAt: new Date().toISOString(),
    };
    setSavedNotes(prev => [...prev, note]);
    toast.success('✅ Note saved successfully');
  };

  const handleCopy = (text: string, msgId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(msgId);
    toast.success('Copied to clipboard');
    setTimeout(() => {
      setCopiedMessageId(null);
    }, 2000);
  };

  const handleDownload = (text: string) => {
    const cleanText = text.replace(/\[SUGGESTIONS:[\s\S]*?\]/g, ''); // strip suggestions if any
    const blob = new Blob([cleanText], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'editorial_recommendation.md');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Downloaded as Markdown');
  };

  const handleRewrite = async (msgId: string) => {
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
          return `Note ${idx+1}: "${snippet}..."`;
        }).join(' | ')}]`
      : undefined;

    const assistantMsgId = generateId();
    setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', type: 'text', content: '' }]);

    try {
      const res = await fetch(`/api/strategist/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesBefore,
          mode: researchMode,
          notesSummary,
          attachments: uploadedAttachment ? [uploadedAttachment] : [],
          enableSearch
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
        throw new Error('API Error');
      }

      if (!res.body) throw new Error('No body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let currentContent = '';
      let buffer = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
              const dataStr = line.trim().slice(6);
              try {
                const data = JSON.parse(dataStr);
                if (data.type === 'chunk') {
                  // eslint-disable-next-line react-hooks/immutability
                  currentContent += data.chunk;
                  setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: currentContent } : m));
                } else if (data.type === 'replace_text') {
                  currentContent = data.text;
                  setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: currentContent } : m));
                } else if (data.type === 'sources') {
                  if (data.sources && data.sources.length > 0) {
                    setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, payload: { ...m.payload, sources: data.sources } } : m));
                  }
                }
              } catch {}
            }
          }
        }
      }

      const sugMatch = currentContent.match(/\[SUGGESTIONS:\s*([\s\S]*?)\](?![^\]]*\])/);
      if (sugMatch) {
         const extractedSuggestions = sugMatch[1].split('|').map(s => s.trim());
         currentContent = currentContent.replace(sugMatch[0], '').trim();
         setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: currentContent, payload: { ...m.payload, suggestions: extractedSuggestions } } : m));
      }
      
      fetchCredits();
    } catch {
      toast.error('Failed to rewrite message');
      setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
    } finally {
      setIsTyping(false);
    }
  };

  const submitQuickDraft = async () => {
    if (!quickDraftTopic.trim() || isGeneratingQuickDraft || !quickDraftMode) return;

    setIsGeneratingQuickDraft(true);
    setQuickDraftOutput('');
    setQuickDraftError(null);

    const isOutlineMode = quickDraftMode === 'outline';
    const body: Record<string, unknown> = {
      topic: quickDraftTopic,
      mode: isOutlineMode ? 'outline' : 'draft',
      draftMode: isOutlineMode ? 'topic' : quickDraftMode,
      provider: 'gemini',
    };

    if (!isOutlineMode && quickDraftOutline.trim()) {
      body.outline = quickDraftOutline;
    }
    if ((quickDraftMode === 'reference' || quickDraftMode === 'press_release') && quickDraftReference.trim()) {
      body.referenceText = quickDraftReference;
    }

    try {
      const res = await fetch(`/api/strategist/quick-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const result = await res.json().catch(() => null);
        throw new Error(result?.error || `Quick draft failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Response reader not available');

      const decoder = new TextDecoder();
      let buffer = '';
      let output = '';
      let analysisLogId: string | undefined;

      while (true) {
        const { done, value } = await reader.read();
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
          if (event.type === 'draft_chunk') {
            output += event.data as string;
            setQuickDraftOutput(output);
          } else if (event.type === 'error') {
            throw new Error(event.data as string);
          } else if (event.type === 'complete') {
            const data = event.data as { analysisLogId?: string };
            analysisLogId = data?.analysisLogId;
          }
        }
      }

      // Surface the result as a chat message and populate the blueprint panel
      appendMessage({
        role: 'user',
        type: 'text',
        content: `Quick draft request (${quickDraftMode.replace('_', ' ')}): ${quickDraftTopic}`,
      });

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

      if (analysisLogId) {
        console.log('[quick-draft] saved log:', analysisLogId);
      }

      closeQuickDraft();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Quick draft failed';
      setQuickDraftError(message);
      toast.error(message);
    } finally {
      setIsGeneratingQuickDraft(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Frontend Size Validation (Gate 1: Max 10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File size exceeds the maximum limit of 10MB.');
      return;
    }

    const loadingToast = toast.loading('Uploading and extracting file content...');
    setShowAttachMenu(false);
    try {
      // 2. Request presigned URL
      const presignedRes = await fetch('/api/storage/presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'text/plain', // fallback if empty
        }),
      });

      if (!presignedRes.ok) {
        const errData = await presignedRes.json();
        throw new Error(errData.error || 'Failed to get upload authorization');
      }

      const { uploadUrl, fileKey, publicUrl } = await presignedRes.json();

      // 3. Upload file directly to Cloudflare R2
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'text/plain',
        },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error('Failed to upload file to storage');
      }

      // 4. Request text extraction from backend
      const extractRes = await fetch('/api/storage/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileKey,
          contentType: file.type || 'text/plain',
          filename: file.name,
          publicUrl,
        }),
      });

      if (!extractRes.ok) {
        const errData = await extractRes.json();
        throw new Error(errData.error || 'Failed to extract text from file');
      }

      const { attachment } = await extractRes.json();
      
      // Replace existing attachment (V1 Replace Behavior)
      setUploadedAttachment(attachment);

      toast.success('File uploaded and processed successfully!', { id: loadingToast });
    } catch (err) {
      console.error('[handleFileUpload ERROR]', err);
      const msg = err instanceof Error ? err.message : 'Failed to attach file';
      toast.error(msg, { id: loadingToast });
    } finally {
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const generatePlan = async (recommendationText: string, history: ChatMessage[]) => {
    setIsTyping(true);
    const assistantMsgId = generateId();
    // Pre-insert empty assistant message with status payload
    setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', type: 'text', content: '', payload: { status: 'Generating Editorial Blueprint...' } }]);

    try {
      const res = await fetch(`/api/strategist/generate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendation: recommendationText, history }), 
      });
      
      if (!res.ok) throw new Error('Plan generation failed');
      const data = await res.json();
      if (data.plan) {
        setCurrentPlan(data.plan);
        if (data.plan?.sources && data.plan.sources.length > 0) {
          const fakeDomains = data.plan.sources.map((url: string) => {
            let domain = 'Source';
            try {
              domain = new URL(url).hostname.replace('www.', '');
            } catch {}
            return { url, domain };
          });
          setCollectedSources(prev => {
            const existing = new Set(prev.map(s => s.url));
            return [...prev, ...fakeDomains.filter((s: { url: string; domain: string }) => !existing.has(s.url))];
          });
        }
      }  
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
        id: assistantMsgId,
        role: 'assistant',
        type: 'text',
        content: data.reply,
        payload: { suggestions: data.suggestions }
      } : m));
    } catch {
      toast.error('Failed to generate draft plan');
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
        id: assistantMsgId,
        role: 'assistant',
        type: 'text',
        content: 'I failed to generate the plan. Please try selecting it again.'
      } : m));
    } finally {
      setIsTyping(false);
    }
  };

  const handleSend = async (forcedText?: string) => {
    const textToSend = forcedText ?? chatInput;
    if (!textToSend.trim()) return;

    if (textToSend === 'Proceed to Editor' && currentPlan) {
      onComplete(currentPlan.angle, currentPlan.outline, currentPlan.draft, savedNotes, uploadedAttachment ? [uploadedAttachment] : []);
      return;
    }

    if (!forcedText) {
      setChatInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
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

    // Detect draft-generation intent in Indonesian and English.
    // Triggers generatePlan instead of Fast Mode chat.
    const DRAFT_INTENT_PATTERN = /\b(buat(kan)?|tulis(kan)?|generate|write|create|bikin)\b.{0,30}\bdraft\b|\bdraft\b.{0,20}\bartikel\b/i;
    if (DRAFT_INTENT_PATTERN.test(messageText) || messageText.toLowerCase().startsWith('draft')) {
      generatePlan(messageText, updatedMessages);
      return;
    }

    const notesSummary = savedNotes.length > 0 
      ? `[SAVED NOTES CONTEXT: ${savedNotes.length} notes saved. Snippets: ${savedNotes.map((n, idx) => {
          const cleanText = n.content.replace(/\s*\[\d+\]\([^)]+\)/g, '');
          const snippet = cleanText.slice(0, 80).replace(/\n/g, ' ');
          return `Note ${idx+1}: "${snippet}..."`;
        }).join(' | ')}]`
      : undefined;

    const assistantMsgId = generateId();
    // Pre-insert empty assistant message with status payload
    setMessages(prev => [
      ...prev,
      {
        id: assistantMsgId,
        role: 'assistant',
        type: 'text',
        content: '',
        payload: {
          status: researchMode === 'deep' ? 'Initiating Deep Research...' : 'Thinking...'
        }
      }
    ]);

    try {
      const res = await fetch(`/api/strategist/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages,
          mode: researchMode,
          notesSummary,
          attachments: uploadedAttachment ? [uploadedAttachment] : [],
          enableSearch,
        }),
      });
      
      // Auto-revert to fast mode so they can chat normally while Deep Research runs in background
      if (researchMode === 'deep') {
        setResearchMode('fast');
      }

      if (!res.ok) {
        if (res.status === 403) {
          const errData = await res.json().catch(() => ({}));
          if (errData.code === 'INSUFFICIENT_CREDITS' || errData.code === 'AUTH_REQUIRED') {
            setIsTyping(false);
            setPaywallMessage(errData.message || 'Access denied.');
            setPaywallOpen(true);
            
            // Remove both the user message and the loading assistant message so they can re-try
            setMessages(prev => prev.filter(m => m.id !== newMsg.id && m.id !== assistantMsgId));
            return;
          }
        }
        throw new Error('API Error');
      }
      if (!res.body) throw new Error('No body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      
      let currentContent = '';
      let buffer = '';
      
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
              const dataStr = line.trim().slice(6);
              try {
                const data = JSON.parse(dataStr);
                if (data.type === 'deep_research_started') {
                   setActiveDeepResearchId(data.interaction_id);
                   setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, payload: { ...m.payload, status: "Deep Research in progress (this may take up to 30 minutes)..." } } : m));
                } else if (data.type === 'status') {
                   setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, payload: { ...m.payload, status: data.message } } : m));
                 } else if (data.type === 'text') {
                   // eslint-disable-next-line react-hooks/immutability
                   currentContent += data.chunk;
                   setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: currentContent, payload: { ...m.payload, status: undefined } } : m));
                 } else if (data.type === 'replace_text') {
                   currentContent = data.text;
                   setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: currentContent, payload: { ...m.payload, status: undefined } } : m));
                } else if (data.type === 'sources') {
                   if (data.sources && data.sources.length > 0) {
                     setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, payload: { ...m.payload, sources: data.sources } } : m));
                   }
                }
              } catch {
              }
            }
          }
        }
      }

      // Match [SUGGESTIONS: ...] up to the last closing bracket (using negative lookahead
      // to prevent getting cut off by nested brackets like [Specific Function] inside a suggestion)
      const sugMatch = currentContent.match(/\[SUGGESTIONS:\s*([\s\S]*?)\](?![^\]]*\])/);
      if (sugMatch) {
         const extractedSuggestions = sugMatch[1].split('|').map(s => s.trim());
         currentContent = currentContent.replace(sugMatch[0], '').trim();
         setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: currentContent, payload: { ...m.payload, suggestions: extractedSuggestions } } : m));
      }
      
      fetchCredits();
    } catch {
      toast.error('Failed to send message');
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-[var(--background)] flex flex-col animate-in fade-in zoom-in-95 duration-200 z-50">
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <button 
            onClick={onCancel} 
            className="absolute top-4 left-4 z-50 p-2 bg-[var(--surface-1)]/50 hover:bg-[var(--surface-2)] backdrop-blur-md rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors border border-[var(--border)] shadow-sm"
            title="Go Back"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
          </button>
          
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <h2 className="text-3xl font-bold mb-8">Hi {user?.firstName || 'there'}, what shall we build?</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl">
                {['Analyze my blog data', 'Research industry trends', 'Brainstorm content ideas'].map((s) => (
                    <button key={s} onClick={() => handleSend(s)} className="px-6 py-3 rounded-full hover:bg-[var(--surface-3)] transition-all text-center">
                      <p className="font-medium text-[var(--foreground)]">{s}</p>
                    </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto pt-14" ref={scrollContainerRef}>
              <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-8 pb-10">
                <AnimatePresence initial={false}>
                  {messages.map((msg, i) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      {msg.payload?.status && (
                        <div className="px-5 py-3.5 flex gap-3 items-center shadow-sm w-fit mb-2">
                          <div className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--primary)] opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--primary)]"></span>
                          </div>
                          <span className="text-[14px] text-[var(--muted-foreground)] font-medium animate-pulse">{msg.payload.status}</span>
                        </div>
                      )}

                      {msg.content && (
                        <div className={`max-w-[85%] text-[15px] leading-relaxed break-words ${
                          msg.role === 'user' 
                            ? 'bg-[var(--surface-2)] text-[var(--foreground)] rounded-3xl px-5 py-3 shadow-sm whitespace-pre-wrap' 
                            : 'bg-transparent text-[var(--foreground)] py-2'
                        }`}>
                          {msg.role === 'assistant' ? (
                            <>
                              <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-p:my-1.5 prose-li:my-0.5 prose-headings:my-2 prose-strong:text-[var(--foreground)] prose-a:bg-[var(--surface-3)] prose-a:text-[var(--foreground)] prose-a:px-1.5 prose-a:py-0.5 prose-a:rounded-md prose-a:no-underline prose-a:text-[11px] prose-a:font-medium text-[var(--foreground)]">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {msg.content + (isTyping && i === messages.length-1 ? ' ▍' : '')}
                                </ReactMarkdown>
                              </div>
                              {msg.payload?.sources && (
                                <div className="flex items-center gap-3 mt-4 mb-2">
                                  <button onClick={() => { setCollectedSources(msg.payload!.sources!); setIsShowingAllSources(false); }} className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-all border border-[var(--border)]">
                                    <span className="text-[13px]">{msg.payload.sources.length} sources</span>
                                  </button>
                                </div>
                              )}
                              {msg.payload?.suggestions && (
                                <div className="flex flex-col items-start gap-2 mt-4">
                                  {msg.payload.suggestions.map((sug: string, i: number) => (
                                    <button key={i} onClick={() => handleSend(sug)} className="text-left py-1.5 px-4 rounded-full bg-[var(--surface-2)]/80 hover:bg-[var(--surface-3)] transition-colors text-sm font-medium border border-[var(--border)]">
                                      {sug}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {/* Actions row — visible after streaming, min 50 chars */}
                              {!isTyping && msg.content.length >= 50 && (
                                <div className="flex flex-wrap items-center gap-2 mt-4">
                                  {savedNoteIds.has(msg.id) ? (
                                    <span className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--success)] px-3 py-1.5 bg-[var(--surface-3)] border border-[var(--border)] rounded-full">
                                      <Check className="w-3 h-3 text-[var(--success)]" /> Saved
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => saveNote(msg)}
                                      className="flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] rounded-full px-3 py-1.5 hover:bg-[var(--surface-2)] transition-all cursor-pointer"
                                    >
                                      <Bookmark className="w-3 h-3" /> Save to Notes
                                    </button>
                                  )}

                                  <button
                                    onClick={() => handleCopy(msg.content, msg.id)}
                                    className="flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] rounded-full px-3 py-1.5 hover:bg-[var(--surface-2)] transition-all cursor-pointer"
                                    title="Copy response to clipboard"
                                  >
                                    {copiedMessageId === msg.id ? (
                                      <>
                                        <Check className="w-3 h-3 text-[var(--success)]" /> Copied
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3" /> Copy
                                      </>
                                    )}
                                  </button>

                                  <button
                                    onClick={() => handleDownload(msg.content)}
                                    className="flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] rounded-full px-3 py-1.5 hover:bg-[var(--surface-2)] transition-all cursor-pointer"
                                    title="Download as Markdown"
                                  >
                                    <Download className="w-3 h-3" /> Download
                                  </button>

                                  <button
                                    onClick={() => handleRewrite(msg.id)}
                                    className="flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] rounded-full px-3 py-1.5 hover:bg-[var(--surface-2)] transition-all cursor-pointer"
                                    title="Regenerate this response"
                                  >
                                    <RotateCcw className="w-3 h-3" /> Rewrite
                                  </button>
                                </div>
                              )}
                            </>
                          ) : (
                            <p>{msg.content}</p>
                          )}
                        </div>
                      )}
                    </motion.div>
                  ))}
                  <div key="messages-end" ref={messagesEndRef} className="h-4" />
                </AnimatePresence>
              </div>
            </div>
          )}

          <div className="p-4 bg-[var(--background)] pb-6 z-10 relative">
            <div className="max-w-4xl mx-auto">
               {/* Actions Row */}
              <div className="flex justify-center mb-3">
                {messages.length >= 2 && !currentPlan && (
                  <button 
                    onClick={() => {
                      const newMsg: ChatMessage = { id: generateId(), role: 'user', type: 'text', content: "Generate the final blueprint based on our discussion." };
                      const updatedMessages = [...messages, newMsg];
                      setMessages(updatedMessages);
                      generatePlan("Generate the final blueprint based on our discussion.", updatedMessages);
                    }}
                    disabled={isTyping}
                    className="bg-[var(--primary)] text-[var(--background)] px-4 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 shadow-sm hover:opacity-90 disabled:opacity-50"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Generate Blueprint
                  </button>
                )}
              </div>

              {/* Compact Sources Panel - Mobile (Inline above Input Form) */}
              <AnimatePresence>
                {collectedSources.length > 0 && !currentPlan && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="lg:hidden w-full max-w-xl mx-auto mb-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-3.5 shadow-sm flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border)]">
                      <div className="flex items-center gap-2">
                        <Search className="w-3.5 h-3.5 text-[var(--primary)]" />
                        <span className="text-[12px] font-bold text-[var(--foreground)]">
                          Research Sources ({collectedSources.length})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setCollectedSources([]); setIsShowingAllSources(false); }}
                        className="p-1 hover:bg-[var(--surface-3)] rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Source List */}
                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                      {(isShowingAllSources ? collectedSources : collectedSources.slice(0, 2)).map((source, i) => {
                        try {
                          const domain = source.domain;
                          const title = source.title || `${domain}`;
                          
                          return (
                            <a
                              key={i}
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--surface-3)] transition-colors group text-left"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                                className="w-3.5 h-3.5 rounded-full shrink-0"
                                alt={domain}
                              />
                              <div className="flex-1 min-w-0">
                                <h4 className="text-[12px] font-semibold text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors truncate">
                                  {title}
                                </h4>
                                <span className="text-[10px] text-[var(--muted-foreground)] truncate block">
                                  {domain}
                                </span>
                              </div>
                            </a>
                          );
                        } catch {
                          return null;
                        }
                      })}
                    </div>

                    {/* Show All / Show Less button */}
                    {collectedSources.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setIsShowingAllSources(!isShowingAllSources)}
                        className="mt-2 text-center w-full py-1.5 text-[11px] font-bold text-[var(--primary)] hover:underline border-t border-[var(--border)] pt-2"
                      >
                        {isShowingAllSources ? "Show Less" : `Show All (${collectedSources.length - 2} more)`}
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="w-full max-w-xl mx-auto relative flex flex-col bg-[var(--surface-2)] rounded-3xl p-1.5 transition-all shadow-sm">
                {/* Slash Command Menu */}
                <AnimatePresence>
                  {showSlashMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-full left-0 mb-2 w-64 bg-[var(--surface-1)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden py-1 z-50"
                    >
                      <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Commands</div>
                      {slashCommands.map((cmd, idx) => (
                        <button
                          key={cmd.id}
                          type="button"
                          onClick={() => executeSlashCommand(cmd.id)}
                          className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${slashMenuIndex === idx ? 'bg-[var(--surface-2)] text-[var(--foreground)]' : 'hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
                        >
                          <div className="text-[var(--primary)]">{cmd.icon}</div>
                          <span>{cmd.label}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
                {uploadedAttachment && (
                  <div className="mx-3 mt-2 mb-1.5 flex items-center justify-between bg-[var(--surface-3)] border border-[var(--border)] rounded-xl px-3 py-1.5 text-xs animate-fade-in">
                    <div className="flex items-center gap-2 text-[var(--foreground)] font-medium truncate">
                      <span className="shrink-0 text-sm">📎</span>
                      <span className="truncate max-w-[200px]" title={uploadedAttachment.filename}>{uploadedAttachment.filename}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--surface-1)] text-[var(--muted-foreground)] font-bold uppercase shrink-0 border border-[var(--border)]">
                        {uploadedAttachment.contentType.split('/').pop()}
                      </span>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setUploadedAttachment(null)}
                      className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1 hover:bg-[var(--surface-4)] rounded-md transition-colors shrink-0"
                      title="Remove attachment"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <textarea
                  ref={textareaRef}
                  value={chatInput}
                  onChange={e => {
                    const val = e.target.value;
                    setChatInput(val);
                    
                    if (val === '/') {
                      setShowSlashMenu(true);
                      setSlashMenuIndex(0);
                    } else if (!val.startsWith('/')) {
                      setShowSlashMenu(false);
                    }

                    if (textareaRef.current) {
                      textareaRef.current.style.height = 'auto';
                      const newHeight = textareaRef.current.scrollHeight;
                      textareaRef.current.style.height = `${newHeight}px`;
                    }
                  }}
                  onKeyDown={(e) => {
                    if (showSlashMenu) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setSlashMenuIndex((prev) => (prev + 1) % slashCommands.length);
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setSlashMenuIndex((prev) => (prev - 1 + slashCommands.length) % slashCommands.length);
                        return;
                      }
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        executeSlashCommand(slashCommands[slashMenuIndex].id);
                        return;
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setShowSlashMenu(false);
                        return;
                      }
                    }

                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask your ideas.."
                  className="w-full block bg-transparent border-0 focus:border-0 focus:ring-0 focus:outline-none outline-none resize-none min-h-[44px] max-h-[200px] text-[15px] px-3 pt-2.5 pb-1"
                  rows={1}
                  disabled={isTyping}
                  autoFocus
                />

                <div className="flex justify-between items-center w-full mt-1 px-1.5 pb-1.5">
                  <div className="flex items-center gap-1">
                    <div ref={attachMenuRef} className="relative">
                      <button type="button" onClick={() => setShowAttachMenu(!showAttachMenu)} className="w-9 h-9 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-3)] rounded-full transition-colors flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                      </button>
                      
                      <AnimatePresence>
                        {showAttachMenu && (
                          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute bottom-full left-0 mb-2 w-56 bg-[var(--surface-1)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden py-1 z-50">
                             <TooltipProvider delay={300}>
                              <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Analyze</div>

                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <button type="button" onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--surface-2)] flex items-center gap-2">
                                      <Upload className="w-4 h-4" /> Upload File
                                    </button>
                                  }
                                />
                                <TooltipContent side="right" sideOffset={12} className="p-0 w-56 flex-col items-stretch bg-[var(--surface-1)] text-[var(--foreground)] border border-[var(--border)] shadow-xl rounded-xl">
                                  <div className="p-3.5">
                                    <p className="font-semibold text-[13px] mb-1">Upload File</p>
                                    <p className="text-[12px] text-[var(--muted-foreground)] leading-relaxed">Attach a data file and EAI will extract and analyze its content to inform your editorial strategy.</p>
                                    <div className="flex gap-1 mt-2.5">
                                      {['.csv', '.pdf', '.txt'].map(f => (
                                        <span key={f} className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-[var(--surface-3)] border border-[var(--border)] text-[var(--muted-foreground)]">{f}</span>
                                      ))}
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <button type="button" onClick={() => { setChatInput(prev => prev + (prev ? '\n' : '') + 'Please read and analyze my blog at: https://'); setShowAttachMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--surface-2)] flex items-center gap-2">
                                      <LinkIcon className="w-4 h-4" /> Blog URL
                                    </button>
                                  }
                                />
                                <TooltipContent side="right" sideOffset={12} className="p-0 w-56 flex-col items-stretch bg-[var(--surface-1)] text-[var(--foreground)] border border-[var(--border)] shadow-xl rounded-xl">
                                  <div className="p-3.5">
                                    <p className="font-semibold text-[13px] mb-1">Analyze Blog</p>
                                    <p className="text-[12px] text-[var(--muted-foreground)] leading-relaxed">Paste your blog URL and EAI will read its published content to generate tailored content recommendations.</p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <button type="button" onClick={() => { setChatInput(prev => prev + (prev ? '\n' : '') + 'Here are my manual metrics:\n- Page views: \n- Bounce rate: '); setShowAttachMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--surface-2)] flex items-center gap-2">
                                      <FileText className="w-4 h-4" /> Manual Metrics
                                    </button>
                                  }
                                />
                                <TooltipContent side="right" sideOffset={12} className="p-0 w-56 flex-col items-stretch bg-[var(--surface-1)] text-[var(--foreground)] border border-[var(--border)] shadow-xl rounded-xl">
                                  <div className="p-3.5">
                                    <p className="font-semibold text-[13px] mb-1">Enter Traffic Metrics</p>
                                    <p className="text-[12px] text-[var(--muted-foreground)] leading-relaxed">Provide page views, bounce rate, and other traffic data. EAI factors them in when prioritizing your content strategy.</p>
                                    <div className="flex gap-1 mt-2.5 flex-wrap">
                                      {['Page views', 'Bounce rate', 'Sessions'].map(m => (
                                        <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-3)] border border-[var(--border)] text-[var(--muted-foreground)]">{m}</span>
                                      ))}
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>

                              <div className="my-1 border-t border-[var(--border)]" />
                              <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Quick Draft</div>

                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <button type="button" onClick={() => openQuickDraft('topic')} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--surface-2)] flex items-center gap-2">
                                      <FileText className="w-4 h-4" /> Topic
                                    </button>
                                  }
                                />
                                <TooltipContent side="right" sideOffset={12} className="p-0 w-56 flex-col items-stretch bg-[var(--surface-1)] text-[var(--foreground)] border border-[var(--border)] shadow-xl rounded-xl">
                                  <div className="p-3.5">
                                    <p className="font-semibold text-[13px] mb-1">Draft from Topic</p>
                                    <p className="text-[12px] text-[var(--muted-foreground)] leading-relaxed">Describe a topic and EAI will generate a complete, publication-ready article draft tailored to your editorial profile.</p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <button type="button" onClick={() => openQuickDraft('outline')} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--surface-2)] flex items-center gap-2">
                                      <List className="w-4 h-4" /> Outline
                                    </button>
                                  }
                                />
                                <TooltipContent side="right" sideOffset={12} className="p-0 w-56 flex-col items-stretch bg-[var(--surface-1)] text-[var(--foreground)] border border-[var(--border)] shadow-xl rounded-xl">
                                  <div className="p-3.5">
                                    <p className="font-semibold text-[13px] mb-1">Generate Outline</p>
                                    <p className="text-[12px] text-[var(--muted-foreground)] leading-relaxed">EAI creates a structured article outline with headings, subheadings, and key discussion points ready to develop.</p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <button type="button" onClick={() => openQuickDraft('reference')} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--surface-2)] flex items-center gap-2">
                                      <LinkIcon className="w-4 h-4" /> Reference
                                    </button>
                                  }
                                />
                                <TooltipContent side="right" sideOffset={12} className="p-0 w-56 flex-col items-stretch bg-[var(--surface-1)] text-[var(--foreground)] border border-[var(--border)] shadow-xl rounded-xl">
                                  <div className="p-3.5">
                                    <p className="font-semibold text-[13px] mb-1">Add Reference</p>
                                    <p className="text-[12px] text-[var(--muted-foreground)] leading-relaxed">Provide a URL or paste text from a source. EAI will summarize it and save it as a cited research note.</p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <button type="button" onClick={() => openQuickDraft('press_release')} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--surface-2)] flex items-center gap-2">
                                      <Newspaper className="w-4 h-4" /> Press Release
                                    </button>
                                  }
                                />
                                <TooltipContent side="right" sideOffset={12} className="p-0 w-56 flex-col items-stretch bg-[var(--surface-1)] text-[var(--foreground)] border border-[var(--border)] shadow-xl rounded-xl">
                                  <div className="p-3.5">
                                    <p className="font-semibold text-[13px] mb-1">Draft Press Release</p>
                                    <p className="text-[12px] text-[var(--muted-foreground)] leading-relaxed">Share your announcement details and EAI will write a professional, publish-ready press release for your newsroom.</p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <input type="file" accept=".csv,.pdf,.txt" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                    </div>

                    {/* Research Mode Dropdown */}
                    <div ref={researchMenuRef} className="relative inline-block">
                      <button
                        type="button"
                        onClick={() => setShowResearchMenu(!showResearchMenu)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-full hover:bg-[var(--surface-3)] text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all cursor-pointer"
                      >
                        <span>{researchMode === 'fast' ? 'Fast' : 'Deep'}</span>
                        <ChevronDown className="w-3.5 h-3.5 transition-transform duration-200" style={{ transform: showResearchMenu ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                      </button>

                      <AnimatePresence>
                        {showResearchMenu && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute bottom-full left-0 mb-2 w-36 bg-[var(--surface-1)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden py-1.5 z-50 flex flex-col"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setResearchMode('fast');
                                setShowResearchMenu(false);
                              }}
                              className={`w-full text-left px-4 py-2 text-xs font-semibold transition-colors hover:bg-[var(--surface-2)] ${
                                researchMode === 'fast' ? 'text-[var(--primary)] bg-[var(--primary-muted,rgba(var(--primary-rgb,59,130,246),.08))]' : 'text-[var(--foreground)]'
                              }`}
                            >
                              Fast Research
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setResearchMode('deep');
                                setShowResearchMenu(false);
                              }}
                              className={`w-full text-left px-4 py-2 text-xs font-semibold transition-colors hover:bg-[var(--surface-2)] ${
                                researchMode === 'deep' ? 'text-[var(--primary)] bg-[var(--primary-muted,rgba(var(--primary-rgb,59,130,246),.08))]' : 'text-[var(--foreground)]'
                              }`}
                            >
                              Deep Research
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {researchMode === 'fast' && (
                      <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full hover:bg-[var(--surface-3)] text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={enableSearch}
                          onChange={(e) => setEnableSearch(e.target.checked)}
                          className="w-3.5 h-3.5 rounded-md border-[var(--border)] bg-transparent text-[var(--primary)] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                        />
                        <span className="flex items-center gap-1">
                          Google Search
                        </span>
                      </label>
                    )}

                    {credits !== null && (
                      <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[var(--surface-3)] border border-[var(--border)] text-[10px] font-bold text-[var(--muted-foreground)] select-none">
                        🪙 {credits} Credits
                      </span>
                    )}
                  </div>
                  
                  <button 
                    type="submit" 
                    disabled={!chatInput.trim() || isTyping} 
                    className="w-9 h-9 rounded-full bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 disabled:opacity-30 transition-opacity shadow-sm flex items-center justify-center"
                  >
                    <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
                  </button>
                </div>
              </form>
              <div className="text-center mt-2">
                <span className="text-[9px] text-[var(--muted-foreground)] uppercase tracking-wider font-semibold">EAI can make mistakes. Check important info.</span>
              </div>
            </div>
          </div>
        </div>
        {/* Blueprint Panel */}
        {currentPlan && (
          <div className="w-full lg:w-96 border-l border-[var(--border)] flex absolute lg:relative inset-y-0 right-0 flex-col animate-in slide-in-from-right duration-300 bg-[var(--background)] z-50 lg:z-10 shadow-2xl lg:shadow-none">
            <div className="p-4 flex items-center justify-between shrink-0 border-b border-[var(--border)]">
              <h3 className="font-semibold text-[14px] flex items-center gap-2 text-[var(--foreground)]">
                <FileText className="w-4 h-4" />
                Draft Blueprint
              </h3>
              {savedNotes.length > 0 && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'var(--primary-muted, rgba(var(--primary-rgb,59,130,246),.12))', color: 'var(--primary)' }}>
                  📋 {savedNotes.length} Notes
                </span>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              <div>
                <span className="text-[11px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-2 block">Angle / Topic</span>
                <p className="text-[14px] text-[var(--foreground)] font-medium leading-relaxed">{currentPlan.angle}</p>
              </div>

              <div>
                <span className="text-[11px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-2 block">Target Audience</span>
                <p className="text-[13px] text-[var(--foreground)] leading-relaxed">{currentPlan.audience}</p>
              </div>

              {currentPlan.seoIntent && (
                <div>
                  <span className="text-[11px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-2 block">SEO Intent</span>
                  <div className="inline-block px-2.5 py-1 bg-[var(--surface-2)] text-[var(--foreground)] rounded-md text-[12px] font-medium border border-[var(--border)]">
                    {currentPlan.seoIntent}
                  </div>
                </div>
              )}

              <div>
                <span className="text-[11px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-3 block">Outline Structure</span>
                <div className="space-y-2">
                  {currentPlan.outline.split('\n').filter((line: string) => line.trim()).map((line: string, i: number) => (
                    <div key={i} className="flex gap-3 items-start p-3 bg-[var(--surface-1)] border border-[var(--border)] rounded-lg">
                      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-[var(--foreground)] text-[var(--background)] text-[10px] font-bold shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <span className="text-[13px] text-[var(--foreground)] leading-relaxed">{line.replace(/^-\s*/, '')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-[var(--border)] bg-[var(--surface-1)] shrink-0 flex flex-col gap-2">
              <button
                onClick={() => onComplete(currentPlan.angle, currentPlan.outline, currentPlan.draft, savedNotes, uploadedAttachment ? [uploadedAttachment] : [])}
                className="w-full py-2.5 bg-[var(--foreground)] text-[var(--background)] font-medium text-[14px] rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <Rocket className="w-4 h-4" />
                Proceed to Editor
              </button>
              <button
                onClick={() => {
                  setCurrentPlan(null);
                  const newMsg: ChatMessage = { id: generateId(), role: 'user', type: 'text', content: "I want to revise the blueprint with different data. Please forget the previous draft idea." };
                  setMessages(prev => [...prev, newMsg]);
                  generatePlan("Revise the blueprint with new instructions.", [...messages, newMsg]);
                }}
                className="w-full py-2.5 bg-transparent text-[var(--foreground)] border border-[var(--border)] font-medium text-[13px] rounded-lg hover:bg-[var(--surface-2)] transition-colors"
              >
                Revise Blueprint
              </button>
            </div>
          </div>
        )}

        {/* Sources Panel */}
        {collectedSources.length > 0 && !currentPlan && (
          <div className="w-80 border-l border-[var(--border)] hidden lg:flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-4 flex items-center justify-between shrink-0">
              <h3 className="font-semibold text-[13px] flex items-center gap-2">
                <Search className="w-4 h-4 text-[var(--primary)]" />
                Research Sources
              </h3>
              <button onClick={() => { setCollectedSources([]); setIsShowingAllSources(false); }} className="p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] rounded-md transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pt-2 space-y-2">
              {collectedSources.map((source, i) => {
                try {
                  const domain = source.domain;
                  // Use dummy content if title/description are missing to match the requested premium layout
                  const title = source.title || `Artikel terkait dari ${domain}`;
                  const description = source.description || source.url;
                  
                  return (
                    <a key={i} href={source.url} target="_blank" rel="noreferrer" className="flex flex-col gap-1.5 p-3 rounded-xl hover:bg-[var(--surface-2)] transition-colors group">
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} className="w-4 h-4 rounded-full" alt={domain} />
                        <span className="text-[12px] text-[var(--muted-foreground)] font-medium">{domain}</span>
                      </div>
                      <h4 className="text-[14px] font-semibold text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors leading-snug">{title}</h4>
                      <p className="text-[13px] text-[var(--muted-foreground)] line-clamp-3 leading-relaxed">{description}</p>
                    </a>
                  );
                } catch {
                  return null;
                }
              })}
            </div>
          </div>
        )}


        
        {/* Deep Research Small Card / NotebookLM Studio Style */}
        {deepResearchReport && !collectedSources.length && !currentPlan && (
          <div className="w-80 border-l border-[var(--border)] hidden lg:flex flex-col animate-in slide-in-from-right duration-300 bg-[var(--surface-1)]">
            <div className="p-4">
              <h3 className="font-semibold text-[13px] flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-[var(--primary)]" />
                Research Report
              </h3>
              
              <button 
                onClick={() => setIsReportOpen(true)}
                className="w-full text-left p-4 rounded-xl bg-gradient-to-br from-[var(--surface-2)] to-[var(--background)] border border-[var(--border)] hover:border-[var(--primary)]/50 hover:shadow-md transition-all group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-16 h-16 bg-[var(--primary)]/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-150"></div>
                <h4 className="font-semibold text-[15px] mb-2 text-[var(--foreground)] relative z-10 flex items-center gap-2">
                  Comprehensive Analysis
                  <ExternalLink className="w-3.5 h-3.5 text-[var(--muted-foreground)] group-hover:text-[var(--primary)]" />
                </h4>
                <p className="text-[13px] text-[var(--muted-foreground)] line-clamp-3 leading-relaxed relative z-10">
                  {deepResearchReport.replace(/[#*`]/g, '').slice(0, 120)}...
                </p>
                <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between relative z-10">
                  <span className="text-[11px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Status: Complete</span>
                  <span className="text-[12px] font-medium text-[var(--primary)] flex items-center gap-1 group-hover:underline">
                    View Full
                  </span>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full Screen Deep Research Modal */}
      <AnimatePresence>
        {isReportOpen && deepResearchReport && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-12 bg-black/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-[var(--background)] w-full max-w-5xl h-full max-h-full rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-[var(--border)] relative"
            >
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-[var(--border)] bg-[var(--surface-1)] shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[var(--primary)]/10 text-[var(--primary)] rounded-lg">
                    <Rocket className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Deep Research Report</h2>
                    <p className="text-sm text-[var(--muted-foreground)]">Generated by EAI Copilot</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsReportOpen(false)}
                  className="p-2 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 sm:p-10 bg-[var(--background)]">
                <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-4xl mx-auto prose-headings:text-[var(--foreground)] prose-p:leading-relaxed prose-a:text-[var(--primary)]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {deepResearchReport}
                  </ReactMarkdown>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Draft Modal */}
      <AnimatePresence>
        {quickDraftMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-[var(--background)] w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-[var(--border)]"
            >
              <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--surface-1)] shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[var(--primary)]/10 text-[var(--primary)] rounded-lg">
                    {quickDraftMode === 'topic' && <FileText className="w-5 h-5" />}
                    {quickDraftMode === 'outline' && <List className="w-5 h-5" />}
                    {quickDraftMode === 'reference' && <LinkIcon className="w-5 h-5" />}
                    {quickDraftMode === 'press_release' && <Newspaper className="w-5 h-5" />}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold capitalize">{quickDraftMode.replace('_', ' ')} Quick Draft</h2>
                    <p className="text-sm text-[var(--muted-foreground)]">Generate a starting point for your article.</p>
                  </div>
                </div>
                <button
                  onClick={closeQuickDraft}
                  disabled={isGeneratingQuickDraft}
                  className="p-2 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Topic / Core Idea</label>
                  <textarea
                    value={quickDraftTopic}
                    onChange={e => setQuickDraftTopic(e.target.value)}
                    placeholder="What should the article be about?"
                    rows={2}
                    disabled={isGeneratingQuickDraft}
                    className="w-full bg-transparent border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 resize-none"
                  />
                </div>

                {quickDraftMode === 'outline' && (
                  <div>
                    <label className="block text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Existing Points (optional)</label>
                    <textarea
                      value={quickDraftOutline}
                      onChange={e => setQuickDraftOutline(e.target.value)}
                      placeholder="Add any points you want included, one per line..."
                      rows={4}
                      disabled={isGeneratingQuickDraft}
                      className="w-full bg-transparent border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 resize-none"
                    />
                  </div>
                )}

                {(quickDraftMode === 'reference' || quickDraftMode === 'press_release') && (
                  <div>
                    <label className="block text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">
                      {quickDraftMode === 'press_release' ? 'Source / Announcement Notes' : 'Reference Material'}
                    </label>
                    <textarea
                      value={quickDraftReference}
                      onChange={e => setQuickDraftReference(e.target.value)}
                      placeholder={quickDraftMode === 'press_release' ? "Paste the announcement, facts, or key quotes..." : "Paste reference text or notes..."}
                      rows={5}
                      disabled={isGeneratingQuickDraft}
                      className="w-full bg-transparent border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 resize-none"
                    />
                  </div>
                )}

                {quickDraftMode === 'topic' && (
                  <div>
                    <label className="block text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Angle or Sub-points (optional)</label>
                    <textarea
                      value={quickDraftOutline}
                      onChange={e => setQuickDraftOutline(e.target.value)}
                      placeholder="Optional angle, sub-topics, or takeaways..."
                      rows={3}
                      disabled={isGeneratingQuickDraft}
                      className="w-full bg-transparent border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 resize-none"
                    />
                  </div>
                )}

                {quickDraftOutput && (
                  <div>
                    <label className="block text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Preview Output</label>
                    <div className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--surface-1)] max-h-60 overflow-y-auto whitespace-pre-wrap">
                      {quickDraftOutput}
                    </div>
                  </div>
                )}

                {quickDraftError && (
                  <p className="text-sm text-[var(--error)]">{quickDraftError}</p>
                )}
              </div>

              <div className="p-4 border-t border-[var(--border)] bg-[var(--surface-1)] shrink-0 flex justify-end gap-2">
                <button
                  onClick={closeQuickDraft}
                  disabled={isGeneratingQuickDraft}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={submitQuickDraft}
                  disabled={!quickDraftTopic.trim() || isGeneratingQuickDraft}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                >
                  {isGeneratingQuickDraft && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isGeneratingQuickDraft ? 'Generating…' : 'Generate'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {paywallOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-[9999]"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[var(--surface-1)] border border-[var(--border)] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-[var(--primary)]/10 text-[var(--primary)] rounded-full flex items-center justify-center mx-auto mb-4 text-3xl select-none">
                  🪙
                </div>
                <h3 className="text-xl font-bold text-[var(--foreground)] mb-2">
                  Access Restricted
                </h3>
                <p className="text-sm text-[var(--muted-foreground)] mb-6 leading-relaxed">
                  {paywallMessage || "You have run out of credits. Please refill your balance or upgrade your plan to continue using this premium feature."}
                </p>
                <div className="flex flex-col gap-2.5">
                  <Link
                    href="/pricing"
                    className="w-full py-2.5 px-4 text-sm font-semibold rounded-xl bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 transition-opacity text-center flex items-center justify-center gap-1.5"
                  >
                    Refill & Upgrade
                  </Link>
                  <button
                    type="button"
                    onClick={() => setPaywallOpen(false)}
                    className="w-full py-2.5 px-4 text-sm font-medium rounded-xl border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--surface-2)] transition-colors text-center"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
