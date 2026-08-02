'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { fetchWithTimeout } from '@/lib/fetch-utils';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EAILoaderStatusIcon } from '@/components/ui/icons/status';
import { AddDocumentActionIcon, SearchActionIcon } from '@/components/ui/icons/actions';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { WorkspaceLibraryIcon } from '@/components/ui/icons/content';
import { ForwardNavigationIcon } from '@/components/ui/icons/navigation';
import {
  getCurrentArticleHistoryItems,
  getHistoryItemPresentation,
  type HistoryItem,
  type HistoryStage,
  type HistoryItemPresentation,
} from '@/components/document-history-utils';
import { Checkbox } from '@/components/ui/checkbox';
import { DeleteDocumentDialog } from '@/components/document-history/DeleteDocumentDialog';
import { DeleteActionIcon } from '@/components/ui/icons/actions';
import { toast } from 'sonner';

type LibraryFilter = 'all' | HistoryStage;

const stageBadge: Record<HistoryStage, BadgeVariant> = {
  draft: 'muted',
  review: 'warning',
  blocked: 'danger',
  ready: 'success',
};

const destinationFor = (presentation: HistoryItemPresentation, id: string) => {
  const query = `?history=${encodeURIComponent(id)}`;
  if (presentation.stage === 'ready') {
    return presentation.hasPublicationMetadata ? `/publication${query}` : `/review${query}`;
  }
  // Draft, review (needs_review), blocked -> all go to editor
  return `/editor${query}`;
};

export function SavedArticlesLibrary({ scope = 'all' }: { scope?: 'all' | 'review' | 'publication' }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('SavedArticlesPage');
  const tHistory = useTranslations('DocumentHistory');
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    fetchWithTimeout('/api/history?limit=100&view=current')
      .then(async response => {
        if (!response.ok) throw new Error('history');
        const result = await response.json();
        if (active) setItems(Array.isArray(result) ? result : result.data ?? []);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const presentations = useMemo(() => getCurrentArticleHistoryItems(items).map(item => ({
    item,
    presentation: getHistoryItemPresentation(item, tHistory('untitledArticle')),
  })), [items, tHistory]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(locale);
    return presentations.filter(({ presentation }) => {
      if (
        scope === 'review'
        && (
          (presentation.stage !== 'review' && presentation.stage !== 'blocked')
          || (
            presentation.hasFindingSnapshot
            && presentation.unresolvedFindingCount === 0
          )
        )
      ) return false;
      if (
        scope === 'publication'
        && (
          presentation.stage !== 'ready'
          || (
            presentation.hasFindingSnapshot
            && presentation.unresolvedFindingCount > 0
          )
        )
      ) return false;
      if (filter !== 'all' && presentation.stage !== filter) return false;
      return !normalizedQuery
        || presentation.title.toLocaleLowerCase(locale).includes(normalizedQuery);
    });
  }, [filter, locale, presentations, query, scope]);

  const groupedFiltered = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { dateStyle: 'long' });
    const result: Array<{
      dateStr: string;
      latestUpdate: number;
      items: typeof filtered;
    }> = [];

    filtered.forEach(itemInfo => {
      // Group by createdAt, but use updatedAt for latest edit
      const dateStr = formatter.format(new Date(itemInfo.item.createdAt));
      const group = result.find(g => g.dateStr === dateStr);
      const updatedAtMs = new Date(itemInfo.item.createdAt).getTime();
      
      if (group) {
        group.items.push(itemInfo);
        if (updatedAtMs > group.latestUpdate) {
          group.latestUpdate = updatedAtMs;
        }
      } else {
        result.push({ dateStr, latestUpdate: updatedAtMs, items: [itemInfo] });
      }
    });

    return result;
  }, [filtered, locale]);



  const toggleGroup = (dateStr: string) => {
    setCollapsedGroups(prev => ({ ...prev, [dateStr]: !prev[dateStr] }));
  };

  const counts = useMemo(() => ({
    all: presentations.length,
    draft: presentations.filter(entry => entry.presentation.stage === 'draft').length,
    review: presentations.filter(entry => entry.presentation.stage === 'review').length,
    blocked: presentations.filter(entry => entry.presentation.stage === 'blocked').length,
    ready: presentations.filter(entry => entry.presentation.stage === 'ready').length,
  }), [presentations]);

  const toggleSelection = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSingleDelete = async () => {
    if (!itemToDelete) return;
    try {
      const response = await fetchWithTimeout('/api/history/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [itemToDelete], deleteFamily: true }),
      });
      if (!response.ok) throw new Error('Failed to delete');
      
      const itemData = items.find(i => i.id === itemToDelete);
      const familyKey = itemData?.metadata?.sourceRef?.trim() || itemToDelete;

      setItems(prev => prev.filter(item => {
        const iKey = item.metadata?.sourceRef?.trim() || item.id;
        return iKey !== familyKey;
      }));
      setItemToDelete(null);
      toast.success(t('deleteSuccess'));
    } catch {
      toast.error(t('deleteFailed'));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      const response = await fetchWithTimeout('/api/history/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), deleteFamily: true }),
      });
      if (!response.ok) throw new Error('Failed to bulk delete');
      
      const familyKeys = items
        .filter(item => selectedIds.has(item.id))
        .map(item => item.metadata?.sourceRef?.trim() || item.id);
        
      setItems(prev => prev.filter(item => {
        const iKey = item.metadata?.sourceRef?.trim() || item.id;
        return !familyKeys.includes(iKey);
      }));
      setSelectedIds(new Set());
      setBulkDeleteConfirmOpen(false);
      toast.success(t('deleteSuccess'));
    } catch {
      toast.error(t('deleteFailed'));
    }
  };

  if (loading) {
    return <div className="flex min-h-[320px] items-center justify-center"><EAILoaderStatusIcon className="h-6 w-6" /></div>;
  }

  if (error) {
    return (
      <div className="ui-state-card mx-auto max-w-xl p-8 text-center">
        <WorkspaceLibraryIcon className="mx-auto h-7 w-7 text-[var(--muted-foreground)]" />
        <h2 className="mt-3 text-sm font-semibold">{t('loadErrorTitle')}</h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">{t('loadErrorDescription')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">{t(`scope.${scope}.eyebrow`)}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)]">{t(`scope.${scope}.title`)}</h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">{t(`scope.${scope}.description`)}</p>
        </div>
        {scope === 'all' && <Button type="button" variant="primary" size="sm" onClick={() => router.push('/editor?new=1')}>
          <AddDocumentActionIcon className="h-4 w-4" />
          {t('newArticle')}
        </Button>}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <SearchActionIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <Input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchLabel')}
            className="pl-9"
          />
        </div>
        {scope === 'all' && <div className="flex max-w-full gap-1 overflow-x-auto" aria-label={t('filterLabel')}>
          {(['all', 'draft', 'review', 'blocked', 'ready'] as const).map(key => (
            <Button
              key={key}
              type="button"
              variant={filter === key ? 'surface' : 'muted'}
              size="xs"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className="shrink-0"
            >
              {t(`filter.${key}`)}
              <span className="font-mono text-[10px] text-[var(--muted-foreground)]">{counts[key]}</span>
            </Button>
          ))}
        </div>}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-[var(--border)] px-6 py-16 text-center">
          <WorkspaceLibraryIcon className="mx-auto h-8 w-8 text-[var(--muted-foreground)]" />
          <h2 className="mt-3 text-sm font-semibold">{t(`scope.${scope}.emptyTitle`)}</h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">{t(`scope.${scope}.emptyDescription`)}</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {groupedFiltered.map((group, index) => {
            const isCollapsed = collapsedGroups[group.dateStr] !== undefined ? collapsedGroups[group.dateStr] : index !== 0;
            const timeFormatter = new Intl.DateTimeFormat(locale, { timeStyle: 'short' });
            const formattedTime = timeFormatter.format(new Date(group.latestUpdate));

            return (
              <div key={group.dateStr} className="flex flex-col gap-3">
                <div 
                  className="flex items-center gap-3 cursor-pointer group/separator"
                  onClick={() => toggleGroup(group.dateStr)}
                >
                  <div className="flex items-center gap-1.5 shrink-0 text-sm font-semibold text-[var(--foreground)]">
                    {isCollapsed ? <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)]" /> : <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)]" />}
                    {group.dateStr}
                  </div>
                  <div className="h-px bg-[var(--border)] flex-1 transition-colors group-hover/separator:bg-[var(--primary)]/30" />
                  <div className="shrink-0 flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                    <span>{t('itemsCount', { count: group.items.length })}</span>
                    <span>&middot;</span>
                    <span>{t('lastEdit', { time: formattedTime })}</span>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="flex flex-col gap-3">
                    {group.items.map(({ item, presentation }) => {
                      const details = [
                        scope === 'review'
                          ? t('decisionsRemaining', { count: presentation.unresolvedFindingCount })
                          : null,
                        presentation.hasFinalDraft ? tHistory('finalDraftSaved') : tHistory('workingDraftSaved'),
                        presentation.wordCount > 0 ? tHistory('wordCount', { count: presentation.wordCount }) : null,
                        presentation.hasPublicationMetadata ? tHistory('seoSaved') : null,
                        presentation.noteCount > 0 ? tHistory('notesSaved', { count: presentation.noteCount }) : null,
                        presentation.wasExported ? tHistory('exported') : null,
                      ].filter((detail): detail is string => Boolean(detail));
                      
                      return (
                        <article key={item.id} className="flex min-h-44 flex-col rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={selectedIds.has(item.id)}
                                onCheckedChange={(checked) => toggleSelection(item.id, checked === true)}
                              />
                              <Badge variant={stageBadge[presentation.stage]} size="xs">{t(`stage.${presentation.stage}`)}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-[var(--muted-foreground)]">
                                {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(item.createdAt))}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-[var(--muted-foreground)] hover:text-red-500"
                                onClick={(e) => { e.stopPropagation(); setItemToDelete(item.id); }}
                              >
                                <DeleteActionIcon className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <h2 className="mt-3 line-clamp-2 text-sm font-semibold leading-snug text-[var(--foreground)]">{presentation.title}</h2>
                          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--muted-foreground)]">{details.join(' · ')}</p>
                          <div className="mt-auto pt-4">
                            <Button
                              type="button"
                              variant="muted"
                              size="sm"
                              className="w-full justify-between"
                              onClick={() => router.push(destinationFor(presentation, item.id))}
                            >
                              {t(`open.${presentation.stage}`)}
                              <ForwardNavigationIcon className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-full border border-[var(--border)] bg-[var(--background)] px-5 py-3 shadow-xl">
          <span className="text-sm font-medium">{tHistory('itemsSelected', { count: selectedIds.size })}</span>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setBulkDeleteConfirmOpen(true)}
          >
            <DeleteActionIcon className="mr-1.5 h-4 w-4" />
            {tHistory('bulkDelete')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            {tHistory('cancel')}
          </Button>
        </div>
      )}

      <DeleteDocumentDialog
        open={Boolean(itemToDelete)}
        onOpenChange={(open) => { if (!open) setItemToDelete(null); }}
        onConfirm={handleSingleDelete}
      />
      <DeleteDocumentDialog
        open={bulkDeleteConfirmOpen}
        onOpenChange={setBulkDeleteConfirmOpen}
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}
