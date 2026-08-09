import { getTranslations } from 'next-intl/server';
import { SavedArticlesLibrary } from '@/components/SavedArticlesLibrary';
import { WorkspacePageShell } from '@/components/WorkspacePageShell';

export default async function SavedArticlesPage() {
  const t = await getTranslations('SavedArticlesPage.scope.library');
  return (
    <WorkspacePageShell title={t('title')} description={t('description')} currentPage="articles" sidebar={null}>
      <SavedArticlesLibrary scope="library" />
    </WorkspacePageShell>
  );
}
