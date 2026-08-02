import EditorialWorkspace from '@/components/EditorialWorkspace';

type EditorSearchParams = {
  history?: string | string[];
  title?: string | string[];
  brief?: string | string[];
  new?: string | string[];
};

const firstValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function EditorPage({ searchParams }: { searchParams: Promise<EditorSearchParams> }) {
  const params = await searchParams;
  return (
    <EditorialWorkspace
      mode="workspace"
      stage="editor"
      startNewDraft={firstValue(params.new) === '1'}
      initialHistoryId={firstValue(params.history)?.slice(0, 200)}
      initialTitle={firstValue(params.title)?.slice(0, 500)}
      initialBrief={firstValue(params.brief)?.slice(0, 2_000)}
    />
  );
}
