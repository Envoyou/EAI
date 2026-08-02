import type { Metadata } from 'next';
import EditorialWorkspace from '@/components/EditorialWorkspace';
import { SavedArticlesLibrary } from '@/components/SavedArticlesLibrary';
import { WorkspacePageShell } from '@/components/WorkspacePageShell';
import { getTranslations } from 'next-intl/server';

type SearchParams = { history?: string | string[] };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('SavedArticlesPage.scope.review');
  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function ReviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const history = Array.isArray(params.history) ? params.history[0] : params.history;
  if (history) return <EditorialWorkspace mode="workspace" stage="review" initialHistoryId={history.slice(0, 200)} />;
  const t = await getTranslations('SavedArticlesPage.scope.review');
  return (
    <WorkspacePageShell title={t('title')} description={t('description')} currentPage="review" sidebar={null}>
      <SavedArticlesLibrary scope="review" />
    </WorkspacePageShell>
  );
}

