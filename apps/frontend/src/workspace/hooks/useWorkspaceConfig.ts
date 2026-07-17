'use client';

import { useEffect, Dispatch, SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import type { ArticleMetadata } from '@eai/shared';
import type { EditorialOptions, AnalysisSpeed } from '../types';
import type { AppSettings } from '@/lib/preferences';

interface UseWorkspaceConfigProps {
  mode: 'demo' | 'workspace';
  isDemoMode: boolean;
  setIsDemoMode: Dispatch<SetStateAction<boolean>>;
  editorialOptions: EditorialOptions;
  setEditorialOptions: Dispatch<SetStateAction<EditorialOptions>>;
  setMetadata: Dispatch<SetStateAction<ArticleMetadata>>;
  setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  setWorkspaceChecking: Dispatch<SetStateAction<boolean>>;
  setAnalysisSpeed: Dispatch<SetStateAction<AnalysisSpeed>>;
}

export function useWorkspaceConfig({
  mode,
  setIsDemoMode,
  setEditorialOptions,
  setMetadata,
  setAppSettings,
  setWorkspaceChecking,
  setAnalysisSpeed,
}: UseWorkspaceConfigProps) {
  const router = useRouter();

  // Demo mode options & dark mode class
  useEffect(() => {
    if (mode === 'demo') {
      setIsDemoMode(true);
      setAnalysisSpeed('fast');
      const nextOptions: EditorialOptions = {
        brandName: 'Envoyou (Demo)',
        categories: ['Technology & AI', 'Digital Creator', 'Data & Insight', 'Finance & Investment'],
        articleTypes: ['News & Trend Analysis', 'Opinion / Op-Ed', 'In-Depth Guide / Explainer', 'How-To / Tutorial'],
        sourcePolicy: 'strict',
        isPersonal: true,
        maxTextLength: 5000,
        cmsExportEnabled: false,
        activePlan: 'demo',
      };
      setEditorialOptions(nextOptions);
      setWorkspaceChecking(false);

      const html = document.documentElement;
      const prevClass = html.className;
      html.classList.add('dark');
      return () => {
        html.className = prevClass;
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Non-demo workspace configuration fetching
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
        const nextOptions: EditorialOptions = {
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
  }, [router, mode, setEditorialOptions, setMetadata, setAppSettings, setWorkspaceChecking]);
}
