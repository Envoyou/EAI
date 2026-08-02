'use client';

import { EAILoaderStatusIcon } from '@/components/ui/icons/status';
import { fetchWithTimeout } from '@/lib/fetch-utils';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, FileText } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { AppSidebarShell } from '@/components/AppSidebarShell';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { ActionButton } from '@/components/ui/action-button';
import { Checkbox } from '@/components/ui/checkbox';
import { AdaptiveActionMenu } from '@/components/ui/adaptive-action-menu';
import { DeleteDocumentDialog } from '@/components/document-history/DeleteDocumentDialog';
import { DocumentHistorySearch } from '@/components/document-history/DocumentHistorySearch';
import {
  DeleteActionIcon,
  EditActionIcon,
  MoreActionsIcon,
  PinActionIcon,
} from '@/components/ui/icons/actions';
import {
  getHistoryItemPresentation,
  type HistoryItem,
  type HistoryStage,
} from '@/components/document-history-utils';

interface DocumentHistoryPanelProps {
  onSelect: (id: string) => void;
  onNew: () => void;
  activeId?: string | null;
  refreshTrigger?: number;
  onToggle?: () => void;
  isDemoMode?: boolean;
  sidebarOpen?: boolean;
}

function timeAgo(dateStr: string, locale: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (d > 0) return formatter.format(-d, 'day');
  if (h > 0) return formatter.format(-h, 'hour');
  if (m > 0) return formatter.format(-m, 'minute');
  return formatter.format(0, 'minute');
}

const FILTERS = [
  { key: 'All' },
  { key: 'ready' },
  { key: 'needs_review' },
  { key: 'blocked' },
] as const;

const PAGE_SIZE = 20;

const sortHistoryItems = (items: HistoryItem[]) =>
  [...items].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

export default function DocumentHistoryPanel({
  onSelect,
  onNew,
  activeId,
  refreshTrigger,
  onToggle,
  isDemoMode = false,
  sidebarOpen = true,
}: DocumentHistoryPanelProps) {
  const t = useTranslations('DocumentHistory');
  const locale = useLocale();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');

  const checkUnsavedDraft = useCallback(() => {
    if (typeof window === 'undefined') return false;
    const draft = localStorage.getItem('eai-draft');
    return !!draft && draft.trim().length > 0 && !activeId;
  }, [activeId]);

  const hasUnsavedDraft = checkUnsavedDraft();

  const fetchHistory = async (cursor?: string, append = false) => {
    if (isDemoMode) {
      setLoading(false);
      setHistory([]);
      return;
    }
    if (!append) setLoading(true);
    else setLoadingMore(true);

    try {
      setError(null);
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (activeFilter !== 'All') params.append('filter', activeFilter);
      if (cursor) params.append('cursor', cursor);
      params.append('limit', String(PAGE_SIZE));

      const res = await fetchWithTimeout(`/api/history?${params.toString()}`);
      if (res.ok) {
        const result = await res.json();
        const data = Array.isArray(result) ? result : result.data || [];
        const newNextCursor = result.nextCursor || null;
        if (append) setHistory(prev => sortHistoryItems([...prev, ...data]));
        else setHistory(sortHistoryItems(data));
        setNextCursor(newNextCursor);
      } else {
        setError(t('fetchFailed'));
      }
    } catch {
      setError(t('loadFailed'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => { fetchHistory(); }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger, searchQuery, activeFilter]);

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setItemToDelete(id);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetchWithTimeout(`/api/history/${itemToDelete}`, { method: 'DELETE' });
      if (res.ok) {
        setHistory(prev => prev.filter(item => item.id !== itemToDelete));
        toast.success(t('deleteSuccess'));
        if (activeId === itemToDelete) onNew();
      } else {
        toast.error(t('deleteFailed'));
      }
    } catch {
      toast.error(t('networkError'));
    } finally {
      setIsDeleting(false);
      setItemToDelete(null);
    }
  };

  const toggleSelection = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const response = await fetchWithTimeout('/api/history/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), deleteFamily: false }),
      });
      if (!response.ok) throw new Error('Failed to bulk delete');
      
      setHistory(prev => prev.filter(item => !selectedIds.has(item.id)));
      if (activeId && selectedIds.has(activeId)) {
        onNew();
      }
      setSelectedIds(new Set());
      setBulkDeleteConfirmOpen(false);
      toast.success(t('deleteSuccess'));
    } catch {
      toast.error(t('deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTitleEdit = async (id: string) => {
    if (!editTitleValue.trim()) {
      setEditingId(null);
      return;
    }

    setHistory(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          metadata: {
            ...item.metadata,
            title: editTitleValue.trim()
          }
        };
      }
      return item;
    }));

    setEditingId(null);

    try {
      const res = await fetchWithTimeout(`/api/history/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitleValue.trim() })
      });
      if (!res.ok) {
        toast.error(t('renameFailed'));
        fetchHistory();
      }
    } catch {
      toast.error(t('renameNetworkError'));
      fetchHistory();
    }
  };

  const handleTogglePin = async (item: HistoryItem) => {
    const nextPinned = !item.isPinned;
    setHistory(prev => sortHistoryItems(prev.map(historyItem =>
      historyItem.id === item.id
        ? { ...historyItem, isPinned: nextPinned }
        : historyItem
    )));

    try {
      const res = await fetchWithTimeout(`/api/history/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPinned: nextPinned }),
      });

      if (!res.ok) throw new Error('Failed to update pin state');
      toast.success(nextPinned ? t('pinSuccess') : t('unpinSuccess'));
    } catch {
      setHistory(prev => sortHistoryItems(prev.map(historyItem =>
        historyItem.id === item.id
          ? { ...historyItem, isPinned: item.isPinned }
          : historyItem
      )));
      toast.error(t('pinFailed'));
    }
  };

  const handleUnsavedDraftClick = () => {
    if (hasUnsavedDraft) {
      onNew();
      closeAfterMobileSelection();
    }
  };

  const closeAfterMobileSelection = () => {
    if (
      sidebarOpen &&
      onToggle &&
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 860px)').matches
    ) {
      onToggle();
    }
  };

  const handleHistoryItemSelect = (id: string) => {
    onSelect(id);
    closeAfterMobileSelection();
  };

  const handleExpandAndFocusSearch = () => {
    if (onToggle) {
      onToggle();
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  };

  const renderItemStatus = (stage: HistoryStage) => {
    const variants: Record<HistoryStage, BadgeVariant> = {
      ready: 'success',
      review: 'warning',
      blocked: 'danger',
      draft: 'muted',
    };
    return (
      <Badge variant={variants[stage]} size="xs">
        {t(`stage.${stage}`)}
      </Badge>
    );
  };

  const renderHistoryItem = (item: HistoryItem) => {
    const isActive = activeId === item.id;
    const presentation = getHistoryItemPresentation(item, t('untitledArticle'));
    const savedDetails = [
      presentation.hasFinalDraft ? t('finalDraftSaved') : t('workingDraftSaved'),
      presentation.wordCount > 0
        ? t('wordCount', { count: presentation.wordCount })
        : null,
      presentation.hasPublicationMetadata ? t('seoSaved') : null,
      presentation.noteCount > 0
        ? t('notesSaved', { count: presentation.noteCount })
        : null,
      presentation.attachmentCount > 0
        ? t('attachmentsSaved', { count: presentation.attachmentCount })
        : null,
      presentation.wasExported ? t('exported') : null,
    ].filter((detail): detail is string => Boolean(detail));

    return (
      <div key={item.id} className="document-history-item relative group">
        <Button
          type="button"
          onClick={() => handleHistoryItemSelect(item.id)}
          variant="ghost"
          className={`document-history-item-button w-full text-left justify-start px-3 py-2.5 h-auto rounded-lg border-none ${
            isActive ? 'is-active' : ''
          }`}
        >
          <div className="flex-none pr-3 pt-0.5" onClick={e => e.stopPropagation()}>
            <Checkbox
              checked={selectedIds.has(item.id)}
              onCheckedChange={(checked) => toggleSelection(item.id, checked === true)}
            />
          </div>
          <div className="min-w-0 flex-1 pr-7">
            {editingId === item.id ? (
              <Input
                type="text"
                name={`draft-title-${item.id}`}
                autoComplete="off"
                value={editTitleValue}
                onChange={event => setEditTitleValue(event.target.value)}
                onBlur={() => handleTitleEdit(item.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleTitleEdit(item.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                onClick={event => event.stopPropagation()}
                autoFocus
                className="h-auto min-w-0 border-none bg-transparent px-1 py-0 text-[13px] font-medium shadow-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:bg-transparent"
              />
            ) : (
              <div className="flex items-center gap-2">
                {item.isPinned && (
                  <PinActionIcon className="h-3 w-3 shrink-0 fill-current text-[var(--primary)]" />
                )}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span
                        className={`min-w-0 flex-1 truncate text-[13px] leading-tight text-[var(--foreground)] ${
                          isActive ? 'font-semibold' : 'font-medium'
                        }`}
                        onDoubleClick={event => {
                          event.stopPropagation();
                          setEditingId(item.id);
                          setEditTitleValue(presentation.title);
                        }}
                      >
                        {presentation.title}
                      </span>
                    }
                  />
                  <TooltipContent>{t('renameHint')}</TooltipContent>
                </Tooltip>
              </div>
            )}

            <div className="mt-1 flex items-center gap-1.5">
              {renderItemStatus(presentation.stage)}
              <span className="truncate text-[10px] text-[var(--muted-foreground)]">
                {isActive ? t('openNow') : t('created', { time: timeAgo(item.createdAt, locale) })}
              </span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-[10px] leading-relaxed text-[var(--muted-foreground)]">
              {savedDetails.join(' · ')}
            </p>
          </div>
        </Button>

        <div
          className="absolute right-2 top-2 opacity-100 md:opacity-0 md:group-hover:opacity-100"
          onClick={event => event.stopPropagation()}
        >
          <AdaptiveActionMenu
            title={t('actionsFor', { title: presentation.title })}
            trigger={
              <ActionButton
                type="button"
                variant="muted"
                size="icon-xs"
                aria-label={t('actionsFor', { title: presentation.title })}
                icon={MoreActionsIcon}
                label={t('actionsFor', { title: presentation.title })}
                labelClassName="sr-only"
              />
            }
            items={[
              {
                key: 'pin',
                label: item.isPinned ? t('unpin') : t('pin'),
                icon: PinActionIcon,
                onSelect: () => handleTogglePin(item),
              },
              {
                key: 'rename',
                label: t('rename'),
                icon: EditActionIcon,
                onSelect: () => {
                  setEditingId(item.id);
                  setEditTitleValue(presentation.title);
                },
              },
              {
                key: 'delete',
                label: t('delete'),
                icon: DeleteActionIcon,
                danger: true,
                separatorBefore: true,
                onSelect: () => handleDelete(item.id),
              },
            ]}
            contentClassName="w-40"
          />
        </div>
      </div>
    );
  };

  return (
    <AppSidebarShell
      sidebarOpen={sidebarOpen}
      onToggleSidebar={onToggle || (() => {})}
      currentPage="editor"
      isDemoMode={isDemoMode}
      style={{ width: '100%', minWidth: '0' }}
    >
      {/* Bottom bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="absolute bottom-6 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center justify-between gap-3 rounded-full border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 shadow-xl">
          <span className="text-xs font-medium">{t('itemsSelected', { count: selectedIds.size })}</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              size="xs"
              onClick={() => setBulkDeleteConfirmOpen(true)}
            >
              <DeleteActionIcon className="mr-1.5 h-3.5 w-3.5" />
              {t('bulkDelete')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setSelectedIds(new Set())}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteDocumentDialog
        open={Boolean(itemToDelete)}
        onOpenChange={(open) => {
          if (!open) setItemToDelete(null);
        }}
        pending={isDeleting}
        onConfirm={confirmDelete}
      />
      <DeleteDocumentDialog
        open={bulkDeleteConfirmOpen}
        onOpenChange={setBulkDeleteConfirmOpen}
        pending={isDeleting}
        onConfirm={handleBulkDelete}
      />

      <div className="px-1 pt-1">
        <p className="text-xs font-semibold text-[var(--foreground)]">{t('title')}</p>
        <p className="mt-1 text-[10px] leading-relaxed text-[var(--muted-foreground)]">
          {t('description')}
        </p>
      </div>

      {/* New Article Button */}
      <div className="pt-1">
        <Button
          type="button"
          onClick={() => {
            onNew();
            closeAfterMobileSelection();
          }}
          variant="primary"
          size="sm"
          className="w-full justify-center gap-1.5 text-xs font-medium bg-[var(--primary)]/5 border border-[var(--primary)]/15 text-[var(--primary)] hover:bg-[var(--primary)]/10"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('newArticle')}
        </Button>
      </div>

      {/* Search Input / Collapsed Icon */}
      <DocumentHistorySearch
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sidebarOpen={sidebarOpen}
        onExpandAndFocus={handleExpandAndFocusSearch}
        inputRef={searchInputRef}
        searchLabel={t('searchLabel')}
        searchPlaceholder={t('searchPlaceholder')}
      />

      {/* Filter Chips (Visible when expanded) */}
      {sidebarOpen && (
        <div className="flex gap-1 mt-2 bg-[var(--surface-2)] rounded-full p-1 border border-[var(--border)]">
          {FILTERS.map(f => (
            <Button
              type="button"
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              variant="muted"
              className={`sidebar-filter-pill min-w-0 flex-1 px-1.5 py-1 text-[10px] rounded-full border-none h-auto${
                activeFilter === f.key ? ' active' : ''
              }`}
            >
              {t(`filter.${f.key}`)}
            </Button>
          ))}
        </div>
      )}

      {/* Document List */}
      <ScrollArea className={`flex-1 min-h-0 mt-3 -mx-3 px-3 ${!sidebarOpen ? 'hidden' : ''}`}>
        {loading ? (
          <div className="space-y-2 py-1">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="rounded-lg animate-shimmer" style={{ height: '52px', opacity: 0.5 + i * 0.05 }} />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <FileText className="w-7 h-7 mx-auto text-[var(--muted-foreground)]/30 mb-2" />
            <p className="text-xs text-[var(--muted-foreground)]">{error}</p>
          </div>
        ) : isDemoMode ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <FileText className="w-8 h-8 mx-auto text-[var(--primary)]/30 mb-3" />
             <p className="text-xs font-medium text-[var(--foreground)] mb-1">{t('historyLocked')}</p>
             <p className="text-xs text-[var(--muted-foreground)]">{t('historyLockedDescription')}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Unsaved Draft */}
            {hasUnsavedDraft && activeFilter === 'All' && !searchQuery && (
              <Button
                type="button"
                onClick={handleUnsavedDraftClick}
                variant="ghost"
                className="w-full text-left justify-start px-3 py-2 h-auto rounded-md transition-colors border border-dashed border-[var(--primary)]/20 bg-[var(--primary)]/5 hover:bg-[var(--primary)]/10 cursor-pointer"
              >
                <div className="flex items-center gap-2 w-full">
                  <FileText className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
                  <div className="min-w-0 flex-1">
                     <div className="text-[13px] font-medium text-[var(--primary)] truncate">{t('unsavedDraft')}</div>
                     <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{t('continueEditing')}</div>
                  </div>
                </div>
              </Button>
            )}

            {/* History Items */}
            {history.length === 0 && !hasUnsavedDraft ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <FileText className="w-7 h-7 mx-auto text-[var(--muted-foreground)]/30 mb-2" />
                 <p className="text-xs text-[var(--muted-foreground)]">{t('empty')}</p>
              </div>
            ) : (
              <>
                {history.length > 0 && (
                  <p className="px-2 pt-1 text-[11px] font-medium text-[var(--muted-foreground)]">
                    {t('savedArticles')}
                  </p>
                )}
                <div className="space-y-3">
                  {[
                    {
                      key: 'pinned',
                      label: t('pinned'),
                      items: history.filter(item => item.isPinned),
                    },
                    {
                      key: 'recent',
                      label: t('recent'),
                      items: history.filter(item => !item.isPinned),
                    },
                  ].filter(group => group.items.length > 0).map(group => (
                    <section key={group.key} aria-label={group.label}>
                      <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                        {group.label}
                      </p>
                      <div className="space-y-1">
                        {group.items.map(renderHistoryItem)}
                      </div>
                    </section>
                  ))}
                </div>
              </>
            )}

            {/* Load More */}
            {nextCursor && (
              <div className="pt-1 pb-2">
                <Button
                  onClick={() => fetchHistory(nextCursor, true)}
                  disabled={loadingMore}
                  variant="surface"
                  size="sm"
                  className="w-full rounded-full"
                >
                  {loadingMore && <EAILoaderStatusIcon className="w-3 h-3" />}
                   {loadingMore ? t('loading') : t('loadMore')}
                </Button>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </AppSidebarShell>
  );
}
