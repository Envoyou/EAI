import { useEffect, useState, useRef } from 'react';
import { Plus, FileText, Loader2, Search, Trash2, LayoutDashboard, Settings, Moon, Sun } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { EAILogo } from '@/components/EAILogo';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useUser, UserButton } from '@clerk/nextjs';
import { storeThemePreference } from '@/lib/preferences';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { user, isLoaded } = useUser();
  const isDark = resolvedTheme === 'dark';
  
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

      const res = await fetch(`/api/history?${params.toString()}`);
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
      const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
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
      const res = await fetch(`/api/history/${id}`, {
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

  const toggleTheme = () => {
    const newTheme = isDark ? 'light' : 'dark';
    setTheme(newTheme);
    storeThemePreference(newTheme);
  };

  const handleSearchClick = () => {
    if (!sidebarOpen && onToggleSidebar) {
      onToggleSidebar();
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  };

  const openSettings = () => {
    toast.error('Settings are available after signing in.', {
      action: {
        label: 'Sign In',
        onClick: () => router.push('/login'),
      },
    });
  };

  const filters = ['All', 'ready', 'needs_review', 'blocked'];



  const dashboardLink = isDemoMode ? (
    <button
      onClick={() => toast.error('Dashboard is locked in Demo Mode')}
      className={`flex items-center transition-colors border-none bg-transparent cursor-pointer opacity-50 text-[var(--muted-foreground)] hover:text-[var(--foreground)] ${
        sidebarOpen 
          ? 'gap-3 px-2.5 py-2 rounded-md hover:bg-[var(--surface-2)] w-full' 
          : 'justify-center w-9 h-9 rounded-full hover:bg-[var(--surface-2)] mx-auto'
      }`}
    >
      <LayoutDashboard className="w-[18px] h-[18px] shrink-0" />
      <span className={`text-[13px] font-medium whitespace-nowrap transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
        Dashboard
      </span>
    </button>
  ) : (
    <Link
      href="/dashboard"
      className={`flex items-center transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)] no-underline ${
        sidebarOpen 
          ? 'gap-3 px-2.5 py-2 rounded-md hover:bg-[var(--surface-2)] w-full' 
          : 'justify-center w-9 h-9 rounded-full hover:bg-[var(--surface-2)] mx-auto'
      }`}
    >
      <LayoutDashboard className="w-[18px] h-[18px] shrink-0" />
      <span className={`text-[13px] font-medium whitespace-nowrap transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
        Dashboard
      </span>
    </Link>
  );

  const settingsLink = isDemoMode ? (
    <button
      onClick={openSettings}
      className={`flex items-center transition-colors border-none bg-transparent cursor-pointer opacity-50 text-[var(--muted-foreground)] hover:text-[var(--foreground)] ${
        sidebarOpen 
          ? 'gap-3 px-2.5 py-2 rounded-md hover:bg-[var(--surface-2)] w-full' 
          : 'justify-center w-9 h-9 rounded-full hover:bg-[var(--surface-2)] mx-auto'
      }`}
    >
      <Settings className="w-[18px] h-[18px] shrink-0" />
      <span className={`text-[13px] font-medium whitespace-nowrap transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
        Settings
      </span>
    </button>
  ) : (
    <Link
      href="/settings"
      className={`flex items-center transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)] no-underline ${
        sidebarOpen 
          ? 'gap-3 px-2.5 py-2 rounded-md hover:bg-[var(--surface-2)] w-full' 
          : 'justify-center w-9 h-9 rounded-full hover:bg-[var(--surface-2)] mx-auto'
      }`}
    >
      <Settings className="w-[18px] h-[18px] shrink-0" />
      <span className={`text-[13px] font-medium whitespace-nowrap transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
        Settings
      </span>
    </Link>
  );

  return (
    <TooltipProvider delay={300}>
      <div
        className="w-full h-full flex flex-col relative overflow-hidden transition-all duration-240"
        style={{ background: sidebarOpen ? 'var(--sidebar)' : 'var(--background)' }}
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
                <button
                  onClick={() => setItemToDelete(null)}
                  disabled={isDeleting}
                  className="ui-btn ui-btn-surface ui-btn-sm flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(itemToDelete)}
                  disabled={isDeleting}
                  className="ui-btn ui-btn-sm flex-1 bg-[var(--error)] text-white hover:brightness-95"
                >
                  {isDeleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TOP SECTION */}
        <div className="shrink-0 flex flex-col px-3 py-3 gap-1">
          {/* Brand Header */}
          <Tooltip disabled={sidebarOpen}>
            <TooltipTrigger render={
                <button
                  onClick={onToggleSidebar}
                  className={`flex items-center transition-colors border-none bg-transparent cursor-pointer overflow-hidden ${
                    sidebarOpen 
                      ? 'gap-2.5 px-2 py-2 mb-2 rounded-md hover:bg-[var(--surface-2)] text-left w-full' 
                      : 'justify-center w-9 h-9 mb-2 rounded-full hover:bg-[var(--surface-2)] mx-auto'
                  }`}
                  aria-label="Toggle sidebar"
                >
                <EAILogo className="w-6 h-6 shrink-0" />
                <div className={`flex flex-col justify-center min-w-0 transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
                  <span className="block text-[15px] font-bold tracking-tight text-[var(--foreground)] leading-none truncate">EAI</span>
                  <span className="block text-[9.5px] text-[var(--muted-foreground)] mt-1 font-medium tracking-wide uppercase truncate">Editorial Intelligence</span>
                </div>
              </button>
            } />
            <TooltipContent side="right" className="text-xs">Expand sidebar</TooltipContent>
          </Tooltip>

          {/* Dashboard Link */}
          <Tooltip disabled={sidebarOpen}>
            <TooltipTrigger render={dashboardLink} />
            <TooltipContent side="right" className="text-xs">Dashboard</TooltipContent>
          </Tooltip>

          {/* New Draft */}
          <Tooltip disabled={sidebarOpen}>
            <TooltipTrigger render={
              <button
                onClick={onNew}
                className={`flex items-center transition-colors border-none bg-transparent cursor-pointer text-[var(--foreground)] mt-1 ${
                  sidebarOpen 
                    ? 'gap-3 px-2.5 py-2 rounded-md hover:bg-[var(--surface-2)] w-full' 
                    : 'justify-center w-9 h-9 rounded-full hover:bg-[var(--surface-2)] mx-auto'
                }`}
              >
                <Plus className="w-[18px] h-[18px] shrink-0" />
                <span className={`text-[13px] font-medium whitespace-nowrap transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
                  New Draft
                </span>
              </button>
            } />
            <TooltipContent side="right" className="text-xs">New Draft</TooltipContent>
          </Tooltip>

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
                  <input
                    ref={searchInputRef}
                    type="text"
                    name="draft-search"
                    autoComplete="off"
                    aria-label="Search drafts"
                    placeholder="Search drafts…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent border-none outline-none text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] h-full min-w-0 pr-3"
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
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`min-w-0 flex-1 px-2 py-1.5 text-[10px] capitalize rounded-full transition-all border-none cursor-pointer ${
                    active ? 'bg-[var(--card)] text-[var(--foreground)] font-semibold shadow-sm' : 'bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--surface-3)] hover:text-[var(--foreground)]'
                  }`}
                >
                    {f === 'needs_review' ? 'Needs Review' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              );
            })}
          </div>
        </div>

        {/* LIST SECTION (Only visible when expanded) */}
        <ScrollArea className={`flex-1 min-h-0 transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
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
                        <button
                          onClick={() => onSelect(item.id)}
                          className={`group w-full text-left px-3 py-1.5 rounded-full transition-colors relative flex items-center gap-2 border-none cursor-pointer ${
                            isActive
                              ? 'bg-[var(--sidebar-accent)]'
                              : 'bg-transparent hover:bg-[var(--sidebar-accent)]'
                          }`}
                        >
                          <div className="flex-1 min-w-0 flex items-center">
                            {editingId === item.id ? (
                              <input
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
                                className="flex-1 text-[13px] font-medium bg-transparent border-none outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm px-1 min-w-0"
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
                        </button>

                        <button
                          onClick={e => { e.stopPropagation(); setItemToDelete(item.id); }}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md transition-[opacity,background-color,color] border-none cursor-pointer bg-transparent opacity-0 group-hover:opacity-100 hover:bg-[var(--surface-3)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                          aria-label="Delete draft"
                          title="Delete draft"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {nextCursor && (
                <div className="pb-4 px-1 mt-2">
                  <button
                    onClick={() => fetchHistory(nextCursor, true)}
                    disabled={loadingMore}
                    className="ui-btn ui-btn-surface ui-btn-sm w-full"
                  >
                    {loadingMore && <Loader2 className="w-3 h-3 animate-spin" />}
                    {loadingMore ? 'Loading…' : 'Load More'}
                  </button>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {!sidebarOpen && <div className="flex-1" />}

        {/* BOTTOM SECTION */}
        <div className="shrink-0 flex flex-col px-3 py-3 gap-1 border-t border-[var(--sidebar-border)]">
          {/* Settings */}
          <Tooltip disabled={sidebarOpen}>
            <TooltipTrigger render={settingsLink} />
            <TooltipContent side="right" className="text-xs">Settings</TooltipContent>
          </Tooltip>

          {/* Theme Toggle */}
          <Tooltip disabled={sidebarOpen}>
            <TooltipTrigger render={
              <button
                onClick={toggleTheme}
                className={`flex items-center transition-colors border-none bg-transparent cursor-pointer text-[var(--muted-foreground)] hover:text-[var(--foreground)] ${
                  sidebarOpen 
                    ? 'gap-3 px-2.5 py-2 rounded-md hover:bg-[var(--surface-2)] w-full' 
                    : 'justify-center w-9 h-9 rounded-full hover:bg-[var(--surface-2)] mx-auto'
                }`}
              >
                {isDark ? <Sun className="w-[18px] h-[18px] shrink-0" /> : <Moon className="w-[18px] h-[18px] shrink-0" />}
                <span className={`text-[13px] font-medium whitespace-nowrap transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
                  {isDark ? 'Light Mode' : 'Dark Mode'}
                </span>
              </button>
            } />
            <TooltipContent side="right" className="text-xs">{isDark ? 'Light Mode' : 'Dark Mode'}</TooltipContent>
          </Tooltip>
{/* User Profile */}
          <div 
            className={`flex items-center mt-1 min-h-[44px] transition-colors ${
              sidebarOpen ? 'gap-3 px-2.5 py-2 w-full rounded-md' : 'justify-center w-9 h-9 mx-auto rounded-full'
            } ${!user && isLoaded ? 'cursor-pointer hover:bg-[var(--surface-2)]' : ''}`}
            onClick={() => {
              if (isLoaded && !user) router.push('/login');
            }}
          >
            {isLoaded ? (
              <div className="shrink-0 flex items-center justify-center -ml-0.5">
                {user ? (
                  <UserButton 
                    userProfileMode="navigation"
                    userProfileUrl="/settings/account"
                    appearance={{
                      elements: {
                        userButtonAvatarBox: "w-[26px] h-[26px]"
                      }
                    }} 
                  />
                ) : (
                  <div className="w-[26px] h-[26px] rounded-full bg-[var(--surface-3)] flex items-center justify-center text-[10px] font-semibold text-[var(--foreground)]">
                    US
                  </div>
                )}
              </div>
            ) : (
              <div className="w-[26px] h-[26px] rounded-full bg-[var(--surface-2)] animate-pulse shrink-0 -ml-0.5" />
            )}
            
            <div className={`flex flex-col min-w-0 transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
              {user ? (
                <div 
                  className="flex flex-col justify-center min-w-0 flex-1 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    const trigger = document.querySelector('.cl-userButtonTrigger') as HTMLButtonElement | null;
                    if (trigger) trigger.click();
                  }}
                >
                  <span className="text-[13px] font-semibold text-[var(--foreground)] truncate leading-tight">
                    {user.firstName} {user.lastName}
                  </span>
                  <span className="text-[10px] text-[var(--muted-foreground)] truncate mt-0.5">
                    {user.primaryEmailAddress?.emailAddress}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col justify-center min-w-0 flex-1">
                  <span className="text-[13px] font-semibold text-[var(--foreground)] truncate leading-tight">
                    Sign in
                  </span>
                  <span className="text-[10px] text-[var(--muted-foreground)] truncate leading-tight mt-0.5">
                    Click here to login
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
