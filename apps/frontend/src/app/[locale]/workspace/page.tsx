import EditorialWorkspace from '@/components/EditorialWorkspace';

type WorkspaceSearchParams = {
  history?: string | string[];
  title?: string | string[];
  brief?: string | string[];
};

const firstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<WorkspaceSearchParams>;
}) {
  const params = await searchParams;
  return (
    <EditorialWorkspace
      mode="workspace"
      initialHistoryId={firstValue(params.history)?.slice(0, 200)}
      initialTitle={firstValue(params.title)?.slice(0, 500)}
      initialBrief={firstValue(params.brief)?.slice(0, 2_000)}
    />
  );
}
