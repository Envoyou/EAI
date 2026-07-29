import { EAILoaderStatusIcon } from '@/components/ui/icons/status';
import { useEffect, useState, useRef } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-utils';
import { Plus, FileText, Search, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { AppSidebarShell } from '@/components/AppSidebarShell';
import { SidebarItem } from '@/components/ui/sidebar-item';
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

interface HistorySidebarProps {
  onSelect: (id: string) => void;
  onNew: () => void;
  activeId?: string | null;
  refreshTrigger?: number;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  isDemoMode?: boolean;
  activePlan?: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0)  return `${d}d ago`;
  if (h > 0)  return `${h}h ago`;
  if (m > 0)  return `${m}m ago`;
  return 'just now';
}

export default function HistorySidebar({
  onSelect,
  onNew,
  activeId,
  refreshTrigger,
  sidebarOpen = true,
  onToggleSidebar,
  isDemoMode = false,
}: HistorySidebarProps) {
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
      params.append('limit', '20');

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
    } catch (e) {
      console.error(e);
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

  const handleDelete = async (id: string) => {
    setIsDeleting(true);
    try {
      const res = await fetchWithTimeout(`/api/history/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setHistory(prev => prev.filter(item => item.id !== id));
        toast.success('Draft deleted from history.');
        if (activeId === id) onNew();
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

  const handleSearchClick = () => {
    if (!sidebarOpen && onToggleSidebar) {
      onToggleSidebar();
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  };


  const filters = ['All', 'ready', 'needs_review', 'blocked'];



  return (
    <TooltipProvider delay={300}>
      <AppSidebarShell
        sidebarOpen={sidebarOpen}
        onToggleSidebar={onToggleSidebar || (() => {})}
        currentPage="editor"
        isDemoMode={isDemoMode}
      >
        {/* Delete Confirmation Overlay */}
        {itemToDelete && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center p-5 animate-fade-in"
            style={{ background: 'rgba(9,9,9,0.85)', backdropFilter: 'blur(6px)' }}
          >
            <div
              className="w-full max-w-[260px] rounded-lg border border-[var(--border)] p-5 space-y-4 shadow-xl"
              style={{ background: 'var(--card)' }}
            >
              <div>
                <h3 className="font-semibold text-base" style={{ color: 'var(--foreground)' }}>
                  Delete this draft?
                </h3>
                <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
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
                  onClick={() => handleDelete(itemToDelete)}
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

        {/* New Draft */}
        <SidebarItem
          icon={Plus}
          label="New Draft"
          sidebarOpen={sidebarOpen}
          onClick={onNew}
          className="mt-1"
        />

        {/* Search */}
        <Tooltip disabled={sidebarOpen}>
          <TooltipTrigger render={
            <div 
              className={`relative flex items-center mt-1 rounded-full transition-all duration-200 overflow-hidden ${!sidebarOpen ? 'hover:bg-[var(--surface-2)] cursor-pointer w-9 h-9 mx-auto' : 'bg-[var(--input)] h-8 w-full'}`}
              onClick={handleSearchClick}
            >
              <div className={`flex items-center justify-center shrink-0 ${!sidebarOpen ? 'w-full h-full' : 'w-8 h-full pl-1'}`}>
                <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)] pointer-events-none" />
              </div>
              {sidebarOpen && (
                <Input
                  ref={searchInputRef}
                  type="text"
                  name="draft-search"
                  autoComplete="off"
                  aria-label="Search drafts"
                  placeholder="Search drafts…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="h-full min-w-0 flex-1 border-none bg-transparent px-0 pr-3 py-0 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
                />
              )}
            </div>
          } />
          <TooltipContent side="right" className="text-xs">Search drafts</TooltipContent>
        </Tooltip>

        {/* Filters (Only visible when expanded) */}
        <div className={`flex w-full mt-2 bg-[var(--surface-2)] rounded-full p-1 transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
          {filters.map(f => {
            const active = activeFilter === f;
            return (
              <Button
                key={f}
                type="button"
                onClick={() => setActiveFilter(f)}
                variant="muted"
                className={`sidebar-filter-pill min-w-0 flex-1 px-2 py-1.5 text-[10px] capitalize rounded-full border-none cursor-pointer h-auto${
                  active ? ' active' : ''
                }`}
              >
                  {f === 'needs_review' ? 'Needs Review' : f.charAt(0).toUpperCase() + f.slice(1)}
              </Button>
            );
          })}
        </div>

        {/* LIST SECTION (Only visible when expanded) */}
        <ScrollArea className={`flex-1 min-h-0 transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'} mt-2`}>
          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="rounded-lg p-3 space-y-2 animate-shimmer" style={{ height: '72px', borderRadius: '8px', opacity: 0.6 + i * 0.05 }} />
              ))}
            </div>
          ) : error ? (
            <div className="p-6 text-center space-y-2" style={{ color: 'var(--muted-foreground)' }}>
              <FileText className="w-7 h-7 mx-auto opacity-20" />
              <p className="text-sm">{error}</p>
            </div>
          ) : isDemoMode ? (
            <div className="p-6 text-center space-y-3" style={{ color: 'var(--muted-foreground)' }}>
              <FileText className="w-8 h-8 mx-auto opacity-30 text-blue-500" />
              <h4 className="font-semibold text-sm text-[var(--foreground)]">History Locked</h4>
              <p className="text-xs leading-relaxed">
                Sign up to save and browse your article refinement history.
              </p>
            </div>
          ) : history.length === 0 ? (
            <div className="p-6 text-center space-y-2" style={{ color: 'var(--muted-foreground)' }}>
              <FileText className="w-7 h-7 mx-auto opacity-20" />
              <p className="text-sm">No history found</p>
            </div>
          ) : (
            <div className="px-2 py-1">
              <div>
                <p className="px-2 mb-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">
                  Draft History
                </p>
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
                          className={`group w-full text-left justify-start px-3 py-1.5 rounded-full transition-colors relative flex items-center gap-2 border-none cursor-pointer h-auto ${
                            isActive
                              ? 'bg-[var(--sidebar-accent)]'
                              : 'bg-transparent hover:bg-[var(--sidebar-accent)]'
                          }`}
                        >
                          <div className="flex-1 min-w-0 flex items-center">
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
                                className="h-auto min-w-0 flex-1 border-none bg-transparent px-1 py-0 text-[13px] font-medium shadow-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:bg-transparent"
                                style={{ color: 'var(--foreground)' }}
                              />
                            ) : (
                              <Tooltip>
                                <TooltipTrigger render={
                                  <span
                                    className={`block text-[13px] truncate flex-1 min-w-0 ${
                                      isActive ? 'font-medium text-[var(--foreground)]' : 'text-[var(--foreground)]'
                                    }`}
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      setEditingId(item.id);
                                      setEditTitleValue(displayTitle);
                                    }}
                                  >
                                    {displayTitle}
                                  </span>
                                } />
                                <TooltipContent side="top" className="text-xs">
                                  Double-click to edit title
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <span className="text-[10.5px] text-[var(--muted-foreground)] shrink-0 transition-opacity duration-200 group-hover:opacity-0">
                            {timeAgo(item.createdAt).replace(' ago', '')}
                          </span>
                        </Button>

                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                type="button"
                                onClick={e => { e.stopPropagation(); setItemToDelete(item.id); }}
                                variant="ghost"
                                size="icon-xs"
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full transition-[opacity,background-color,color] border-none bg-transparent opacity-0 group-hover:opacity-100 hover:bg-[var(--surface-3)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                aria-label="Delete draft"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            }
                          />
                          <TooltipContent>Delete draft</TooltipContent>
                        </Tooltip>
                      </div>
                    );
                  })}
                </div>
              </div>

              {nextCursor && (
                <div className="pb-4 px-1 mt-2">
                  <Button
                    onClick={() => fetchHistory(nextCursor, true)}
                    disabled={loadingMore}
                    variant="surface"
                    size="sm"
                    className="w-full rounded-full"
                  >
                    {loadingMore && <EAILoaderStatusIcon className="w-3 h-3" />}
                    {loadingMore ? 'Loading…' : 'Load More'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </AppSidebarShell>
    </TooltipProvider>
  );
}
