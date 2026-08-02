import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SavedArticlesLibrary } from '@/components/SavedArticlesLibrary';
import { WorkspacePageShell } from '@/components/WorkspacePageShell';

type WorkspaceSearchParams = {
  history?: string | string[];
  title?: string | string[];
  brief?: string | string[];
};

export default async function WorkspaceHomePage({ searchParams }: { searchParams: Promise<WorkspaceSearchParams> }) {
  const params = await searchParams;
  if (params.history || params.title || params.brief) {
    const forwarded = new URLSearchParams();
    for (const key of ['history', 'title', 'brief'] as const) {
      const value = Array.isArray(params[key]) ? params[key][0] : params[key];
      if (value) forwarded.set(key, value);
    }
    redirect(`/editor?${forwarded.toString()}`);
  }

  const t = await getTranslations('SavedArticlesPage.scope.all');
  return (
    <WorkspacePageShell
      title={t('title')}
      description={t('description')}
      currentPage="workspace"
      sidebar={null}
    >
      <SavedArticlesLibrary />
    </WorkspacePageShell>
  );
}
