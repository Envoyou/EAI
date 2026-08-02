'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from 'react';
import type { AnalysisResult, ArticleMetadata, ResearchNote, Attachment } from '@eai/shared';
import type { EditorialOptions, AnalysisSpeed } from '../types';
import { DEMO_TEXT_ID, DEMO_TEXT_EN } from '../constants';
import {
  AppSettings,
  DEFAULT_APP_SETTINGS,
  SETTINGS_STORAGE_KEY,
  applyDefaultMetadata,
  normalizeAppSettings,
} from '@/lib/preferences';
import type { PanelTab } from '@/components/PanelTabBar';

const DOCUMENT_RECOVERY_KEYS = [
  'eai-draft',
  'eai-metadata',
  'eai-analysis',
  'eai-active-history-id',
  'eai-source-draft',
] as const;

export function useWorkspaceStorage({
  mode,
  startNewDraft = false,
}: {
  mode: 'demo' | 'workspace';
  startNewDraft?: boolean;
}) {
  const [workspaceChecking, setWorkspaceChecking] = useState(true);
  const [editorialOptions, setEditorialOptions] = useState<EditorialOptions>({
    brandName: 'Envoyou',
    categories: [],
    articleTypes: [],
    sourcePolicy: 'standard',
    isPersonal: false,
    maxTextLength: 15000,
    cmsExportEnabled: false,
    activePlan: 'free',
  });

  const [draft, setDraft] = useState(() => {
    if (mode !== 'demo') return '';
    if (typeof navigator === 'undefined') return '';
    const isIndo = navigator.language.toLowerCase().startsWith('id');
    return isIndo ? DEMO_TEXT_ID : DEMO_TEXT_EN;
  });

  const [metadata, setMetadata] = useState<ArticleMetadata>({});
  const [analysis, setAnalysis] = useState<AnalysisResult>({ status: 'idle' });
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [draftHistory, setDraftHistory] = useState<string[]>([]);
  const [sourceDraft, setSourceDraft] = useState('');
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);

  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoRefineCount, setDemoRefineCount] = useState(0);

  const [activeTab, setActiveTab] = useState<PanelTab>('draft');
  const [leftPanelOpen, setLeftPanelOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth > 1024;
  });
  const [rightPanelOpen, setRightPanelOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth > 1024;
  });
  const [layoutReversed, setLayoutReversed] = useState(false);

  const [researchNotes, setResearchNotes] = useState<ResearchNote[]>(() => {
    if (startNewDraft) return [];
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(sessionStorage.getItem('eai_research_notes') || '[]');
    } catch {
      return [];
    }
  });

  const [hasNotes, setHasNotes] = useState(() => {
    if (startNewDraft) return false;
    if (typeof window === 'undefined') return false;
    try {
      const notes = JSON.parse(sessionStorage.getItem('eai_research_notes') || '[]');
      return notes.length > 0;
    } catch {
      return false;
    }
  });

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [analysisSpeed, setAnalysisSpeed] = useState<AnalysisSpeed>('publish');
  const [isLoaded, setIsLoaded] = useState(false);

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
      const savedDraft = startNewDraft ? null : localStorage.getItem('eai-draft');
      const savedMeta = startNewDraft ? null : localStorage.getItem('eai-metadata');
      const savedAnalysis = startNewDraft ? null : localStorage.getItem('eai-analysis');
      const savedHistoryId = startNewDraft ? null : localStorage.getItem('eai-active-history-id');
      const savedSourceDraft = startNewDraft ? null : localStorage.getItem('eai-source-draft');
      const savedActiveTab = localStorage.getItem('eai-active-tab');
      const savedShowLeftSidebar = localStorage.getItem('eai-show-left-sidebar');
      const savedShowSidebar = localStorage.getItem('eai-show-feedback-sidebar');
      const savedSpeed = localStorage.getItem('eai-analysis-speed');
      const savedDemoCount = localStorage.getItem('eai-demo-refine-count');

      setAppSettings(nextSettings);
      if (startNewDraft) {
        DOCUMENT_RECOVERY_KEYS.forEach(key => localStorage.removeItem(key));
        sessionStorage.removeItem('eai_research_notes');
        setMetadata(applyDefaultMetadata(nextSettings.defaultMetadata));
      }
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
      if (startNewDraft) setActiveTab('draft');
      else if (savedActiveTab !== null) setActiveTab(savedActiveTab as PanelTab);
      if (savedShowLeftSidebar !== null) {
        setLeftPanelOpen(savedShowLeftSidebar === 'true');
      } else if (window.innerWidth <= 1024) {
        setLeftPanelOpen(false);
      }
      if (savedShowSidebar !== null) {
        setRightPanelOpen(savedShowSidebar === 'true');
      } else if (window.innerWidth <= 1024) {
        setRightPanelOpen(false);
      }

      const savedLayoutReversed = localStorage.getItem('eai-layout-reversed');
      if (savedLayoutReversed !== null) setLayoutReversed(savedLayoutReversed === 'true');

      if (savedSpeed === 'fast' || savedSpeed === 'publish') setAnalysisSpeed(savedSpeed as AnalysisSpeed);
      if (savedDemoCount !== null) setDemoRefineCount(parseInt(savedDemoCount, 10) || 0);

      setIsLoaded(true);
    }
  }, [startNewDraft]);

  // Autosave settings to localStorage
  useEffect(() => {
    if (isLoaded && typeof window !== 'undefined') {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(appSettings));
    }
  }, [appSettings, isLoaded]);

  // Autosave draft, metadata, analysis, history, sourceDraft to localStorage
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
      localStorage.setItem('eai-show-left-sidebar', String(leftPanelOpen));
      localStorage.setItem('eai-show-feedback-sidebar', String(rightPanelOpen));
      localStorage.setItem('eai-analysis-speed', analysisSpeed);
      localStorage.setItem('eai-layout-reversed', String(layoutReversed));
    }
  }, [leftPanelOpen, rightPanelOpen, analysisSpeed, layoutReversed, isLoaded]);

  return {
    workspaceChecking,
    setWorkspaceChecking,
    editorialOptions,
    setEditorialOptions,
    draft,
    setDraft,
    metadata,
    setMetadata,
    analysis,
    setAnalysis,
    activeHistoryId,
    setActiveHistoryId,
    draftHistory,
    setDraftHistory,
    sourceDraft,
    setSourceDraft,
    appSettings,
    setAppSettings,
    isDemoMode,
    setIsDemoMode,
    demoRefineCount,
    setDemoRefineCount,
    activeTab,
    setActiveTab,
    leftPanelOpen,
    setLeftPanelOpen,
    rightPanelOpen,
    setRightPanelOpen,
    layoutReversed,
    setLayoutReversed,
    researchNotes,
    setResearchNotes,
    hasNotes,
    setHasNotes,
    attachments,
    setAttachments,
    analysisSpeed,
    setAnalysisSpeed,
    isLoaded,
  };
}
