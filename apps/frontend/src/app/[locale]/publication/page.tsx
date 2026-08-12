import EditorialWorkspace from '@/components/EditorialWorkspace';
import { SavedArticlesLibrary } from '@/components/SavedArticlesLibrary';
import { WorkspacePageShell } from '@/components/WorkspacePageShell';
import { getTranslations } from 'next-intl/server';
import type { PublicationSeoField } from '@/components/PublicationSeoPanel';

type SearchParams = {
  history?: string | string[];
  seoField?: string | string[];
};

const publicationSeoFields = new Set<PublicationSeoField>([
  'title',
  'slug',
  'excerpt',
  'metaTitle',
  'metaDescription',
  'coverImageAltText',
  'tags',
]);

export default async function PublicationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const history = Array.isArray(params.history) ? params.history[0] : params.history;
  const rawSeoField = Array.isArray(params.seoField) ? params.seoField[0] : params.seoField;
  const seoField = rawSeoField && publicationSeoFields.has(rawSeoField as PublicationSeoField)
    ? rawSeoField as PublicationSeoField
    : undefined;
  if (history) return (
    <EditorialWorkspace
      mode="workspace"
      stage="publication"
      initialHistoryId={history.slice(0, 200)}
      initialPublicationField={seoField}
    />
  );
  const t = await getTranslations('SavedArticlesPage.scope.publication');
  return (
    <WorkspacePageShell title={t('title')} description={t('description')} currentPage="publication" sidebar={null}>
      <SavedArticlesLibrary scope="publication" />
    </WorkspacePageShell>
  );
}
