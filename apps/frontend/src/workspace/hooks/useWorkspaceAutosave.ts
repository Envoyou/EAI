'use client';

import { useEffect, Dispatch, SetStateAction } from 'react';
import type { ArticleMetadata, ResearchNote } from '@eai/shared';

interface UseWorkspaceAutosaveProps {
  draft: string;
  researchNotes: ResearchNote[];
  metadata: ArticleMetadata;
  activeHistoryId: string | null;
  isLoaded: boolean;
  isDemoMode: boolean;
  setIsSavingToCloud: Dispatch<SetStateAction<boolean>>;
  setActiveHistoryId: Dispatch<SetStateAction<string | null>>;
}

export function useWorkspaceAutosave({
  draft,
  researchNotes,
  metadata,
  activeHistoryId,
  isLoaded,
  isDemoMode,
  setIsSavingToCloud,
  setActiveHistoryId,
}: UseWorkspaceAutosaveProps) {
  // Autosave to cloud database (debounced)
  useEffect(() => {
    if (!isLoaded || !activeHistoryId || isDemoMode) return;

    const controller = new AbortController();
    setIsSavingToCloud(true);

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/history/${activeHistoryId}/autosave`, {
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
          if (typeof window !== 'undefined') {
            localStorage.removeItem('eai-active-history-id');
          }
        } else if (!response.ok) {
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
  }, [draft, researchNotes, metadata, activeHistoryId, isLoaded, isDemoMode, setIsSavingToCloud, setActiveHistoryId]);
}
