'use client';

import { fetchWithTimeout } from '@/lib/fetch-utils';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Plus, FileText, Loader2, Search, Trash2, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { AppSidebarShell } from '@/components/AppSidebarShell';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export interface HistoryItem {
  id: string;
  createdAt: string;
  role: string;
  verdict?: string;
  summary?: string;
  metadata?: {
    title?: string;
    type?: string;
    category?: string;
    exportStatus?: {
      lastExportStatus?: 'success' | 'failed';
      lastExportedAt?: string;
    };
  };
}

interface DocumentHistoryPanelProps {
  onSelect: (id: string) => void;
  onNew: () => void;
  activeId?: string | null;
  refreshTrigger?: number;
  onToggle?: () => void;
  isDemoMode?: boolean;
  sidebarOpen?: boolean;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'just now';
}

const FILTERS = [
  { key: 'All', label: 'All' },
  { key: 'ready', label: 'Ready' },
  { key: 'needs_review', label: 'Review' },
  { key: 'blocked', label: 'Blocked' },
] as const;

const PAGE_SIZE = 20;

export default function DocumentHistoryPanel({
  onSelect,
  onNew,
  activeId,
  refreshTrigger,
  onToggle,
  isDemoMode = false,
  sidebarOpen = true,
}: DocumentHistoryPanelProps) {
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
        if (append) setHistory(prev => [...prev, ...data]);
        else setHistory(data);
        setNextCursor(newNextCursor);
      } else {
        setError('Failed to fetch history');
      }
    } catch {
      setError('Failed to load history');
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
        toast.success('Draft deleted from history.');
        if (activeId === itemToDelete) onNew();
      } else {
        toast.error('Failed to delete draft.');
      }
    } catch {
      toast.error('A network error occurred.');
    } finally {
      setIsDeleting(false);
      setItemToDelete(null);
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
        toast.error('Failed to update title');
        fetchHistory();
      }
    } catch {
      toast.error('Network error while updating title');
      fetchHistory();
    }
  };

  const handleUnsavedDraftClick = () => {
    if (hasUnsavedDraft) {
      onNew();
    }
  };

  const renderItemStatus = (item: HistoryItem) => {
    const verdict = item.verdict;
    if (!verdict) return null;
    const colors: Record<string, string> = {
      ready: 'bg-emerald-500/10 text-emerald-600',
      needs_review: 'bg-amber-500/10 text-amber-600',
      blocked: 'bg-red-500/10 text-red-600',
      approve: 'bg-emerald-500/10 text-emerald-600',
      revise: 'bg-amber-500/10 text-amber-600',
      reject: 'bg-red-500/10 text-red-600',
    };
    const label = verdict === 'needs_review' ? 'Review' : verdict.charAt(0).toUpperCase() + verdict.slice(1);
    return (
      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${colors[verdict] || 'bg-slate-500/10 text-slate-500'}`}>
        {label}
      </span>
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
      {/* Delete Confirmation */}
      {itemToDelete && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center p-5"
          style={{ background: 'rgba(9,9,9,0.85)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="w-full max-w-[260px] rounded-lg border border-[var(--border)] p-5 space-y-4 shadow-xl"
            style={{ background: 'var(--card)' }}
          >
            <div>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
                Delete this draft?
              </h3>
              <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setItemToDelete(null)}
                disabled={isDeleting}
                variant="surface"
                size="sm"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmDelete}
                disabled={isDeleting}
                variant="danger"
                size="sm"
                className="flex-1"
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* New Article Button */}
      <div className="pt-1">
        <Button
          type="button"
          onClick={onNew}
          variant="primary"
          size="sm"
          className="w-full justify-center gap-1.5 text-xs font-medium bg-[var(--primary)]/5 border border-[var(--primary)]/15 text-[var(--primary)] hover:bg-[var(--primary)]/10"
        >
          <Plus className="w-3.5 h-3.5" />
          New Article
        </Button>
      </div>

      {/* Search */}
      <div className="pt-2">
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted-foreground)] pointer-events-none z-10" />
          <Input
            variant="surface"
            ref={searchInputRef}
            type="text"
            name="draft-search"
            autoComplete="off"
            aria-label="Search drafts"
            placeholder="Search drafts…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="!pl-8 !pr-8 text-xs"
          />
          {searchQuery && (
            <Button
              type="button"
              onClick={() => setSearchQuery('')}
              variant="ghost"
              size="icon-xs"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-[var(--muted-foreground)] hover:bg-[var(--surface-3)]"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Filter Chips */}
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
            {f.label}
          </Button>
        ))}
      </div>

      {/* Document List */}
      <ScrollArea className="flex-1 min-h-0 mt-3 -mx-3 px-3">
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
            <p className="text-xs font-medium text-[var(--foreground)] mb-1">History Locked</p>
            <p className="text-xs text-[var(--muted-foreground)]">Sign up to save and browse your article history.</p>
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
                    <div className="text-[13px] font-medium text-[var(--primary)] truncate">Unsaved Draft</div>
                    <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">Click to continue editing</div>
                  </div>
                </div>
              </Button>
            )}

            {/* History Items */}
            {history.length === 0 && !hasUnsavedDraft ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <FileText className="w-7 h-7 mx-auto text-[var(--muted-foreground)]/30 mb-2" />
                <p className="text-xs text-[var(--muted-foreground)]">No documents found</p>
              </div>
            ) : (
              <>
                {history.length > 0 && (
                  <p className="px-2 pt-1 text-[11px] font-medium text-[var(--muted-foreground)]">
                    Draft History
                  </p>
                )}
                <div className="space-y-0.5">
                  {history.map(item => {
                    const isActive = activeId === item.id;
                    const displayTitle = item.metadata?.title || (item.metadata?.type || item.metadata?.category ? `${item.metadata?.type || 'Draft'} · ${item.metadata?.category || 'General'}` : null) || item.summary || 'Draft · General';

                    return (
                      <div key={item.id} className="relative group">
                        <Button
                          type="button"
                          onClick={() => onSelect(item.id)}
                          variant="ghost"
                          className={`w-full text-left justify-start px-3 py-2 h-auto rounded-md transition-colors border-none ${
                            isActive
                              ? 'bg-[var(--primary)]/10'
                              : 'hover:bg-[var(--surface-2)]'
                          }`}
                        >
                          <div className="flex items-start gap-2 w-full">
                            <div className="flex-1 min-w-0">
                              {editingId === item.id ? (
                                <Input
                                  type="text"
                                  name={`draft-title-${item.id}`}
                                  autoComplete="off"
                                  value={editTitleValue}
                                  onChange={e => setEditTitleValue(e.target.value)}
                                  onBlur={() => handleTitleEdit(item.id)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleTitleEdit(item.id);
                                    if (e.key === 'Escape') setEditingId(null);
                                  }}
                                  onClick={e => e.stopPropagation()}
                                  autoFocus
                                  className="h-auto min-w-0 border-none bg-transparent px-1 py-0 text-[13px] font-medium shadow-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:bg-transparent"
                                />
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Tooltip>
                                    <TooltipTrigger
                                      render={
                                        <span
                                          className={`text-[13px] leading-tight truncate flex-1 min-w-0 cursor-default ${
                                            isActive ? 'font-semibold text-[var(--foreground)]' : 'font-medium text-[var(--foreground)]'
                                          }`}
                                          onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            setEditingId(item.id);
                                            setEditTitleValue(displayTitle);
                                          }}
                                        >
                                          {displayTitle}
                                        </span>
                                      }
                                    />
                                    <TooltipContent>Double-click to edit title</TooltipContent>
                                  </Tooltip>
                                </div>
                              )}
                              <div className="flex items-center gap-2 mt-1">
                                {renderItemStatus(item)}
                                <span className="text-[10px] text-[var(--muted-foreground)]">
                                  {timeAgo(item.createdAt)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </Button>

                        <Button
                          type="button"
                          onClick={(e) => handleDelete(item.id, e)}
                          variant="ghost"
                          size="icon-xs"
                          className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity border-none hover:bg-[var(--surface-3)] text-[var(--muted-foreground)] hover:text-red-500"
                          aria-label="Delete draft"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    );
                  })}
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
                  {loadingMore && <Loader2 className="w-3 h-3 animate-spin" />}
                  {loadingMore ? 'Loading…' : 'Load More'}
                </Button>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </AppSidebarShell>
  );
}
