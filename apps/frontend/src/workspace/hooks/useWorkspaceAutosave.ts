'use client';

import { useEffect, Dispatch, SetStateAction } from 'react';
import type { ArticleMetadata, ArticleSaveState, ResearchNote } from '@eai/shared';
import { fetchWithTimeout } from '@/lib/fetch-utils';

interface UseWorkspaceAutosaveProps {
  draft: string;
  researchNotes: ResearchNote[];
  metadata: ArticleMetadata;
  activeHistoryId: string | null;
  isLoaded: boolean;
  isDemoMode: boolean;
  suspended?: boolean;
  setIsSavingToCloud: Dispatch<SetStateAction<boolean>>;
  setSaveState: Dispatch<SetStateAction<ArticleSaveState>>;
  setActiveHistoryId: Dispatch<SetStateAction<string | null>>;
}

export function useWorkspaceAutosave({
  draft,
  researchNotes,
  metadata,
  activeHistoryId,
  isLoaded,
  isDemoMode,
  suspended = false,
  setIsSavingToCloud,
  setSaveState,
  setActiveHistoryId,
}: UseWorkspaceAutosaveProps) {
  // Autosave to cloud database (debounced)
  useEffect(() => {
    if (!isLoaded || isDemoMode || suspended) {
      setIsSavingToCloud(false);
      return;
    }
    if (!activeHistoryId) {
      setIsSavingToCloud(false);
      setSaveState('local_only');
      return;
    }

    const controller = new AbortController();
    setSaveState('dirty');

    const timer = setTimeout(async () => {
      setIsSavingToCloud(true);
      setSaveState('saving');
      try {
        const response = await fetchWithTimeout(`/api/history/${activeHistoryId}/autosave`, {
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
        if (response.status === 403 || response.status === 404) {
          console.warn('Autosave failed because history ID is unauthorized or not found. Resetting active history ID.');
          setActiveHistoryId(null);
          setSaveState('failed');
          if (typeof window !== 'undefined') {
            localStorage.removeItem('eai-active-history-id');
          }
        } else if (!response.ok) {
          console.error('Failed to autosave draft to cloud');
          setSaveState('failed');
        } else {
          setSaveState('saved');
        }
      } catch (err: unknown) {
        if ((err as Record<string, unknown>)?.name !== 'AbortError') {
          console.error('Error in autosave:', err);
          setSaveState('failed');
        }
      } finally {
        setIsSavingToCloud(false);
      }
    }, 1500);

    return () => {
      clearTimeout(timer);
      controller.abort();
      setIsSavingToCloud(false);
    };
  }, [draft, researchNotes, metadata, activeHistoryId, isLoaded, isDemoMode, suspended, setIsSavingToCloud, setSaveState, setActiveHistoryId]);
}
