'use client';

import { useEffect, useState, useRef } from 'react';
import { Plus, FileText, Loader2, Search, Trash2, Upload, FileUp, CheckSquare, Square, Trash, Layers } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { AppSidebarShell } from '@/components/AppSidebarShell';
import { SidebarItem } from '@/components/ui/sidebar-item';
import { OrganizationSwitcher } from '@clerk/nextjs';
import { Attachment } from '@eai/shared';

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

interface SourcesPanelProps {
  // History Sidebar Props
  onSelect: (id: string) => void;
  onNew: () => void;
  activeId?: string | null;
  refreshTrigger?: number;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  isDemoMode?: boolean;
  activePlan?: string;

  // Sources Props
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  selectedAttachmentIds: string[];
  onSelectedAttachmentsChange: (ids: string[]) => void;
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

export default function SourcesPanel({
  onSelect,
  onNew,
  activeId,
  refreshTrigger,
  sidebarOpen = true,
  onToggleSidebar,
  isDemoMode = false,
  activePlan: _activePlan,
  attachments,
  onAttachmentsChange,
  selectedAttachmentIds,
  onSelectedAttachmentsChange,
}: SourcesPanelProps) {
  const [leftPanelTab, setLeftPanelTab] = useState<'sources' | 'history'>('sources');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // History states
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

  // Sources states
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (leftPanelTab === 'history') {
      const timer = setTimeout(() => { fetchHistory(); }, 300);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger, searchQuery, activeFilter, leftPanelTab]);

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

  const handleSearchClick = () => {
    if (!sidebarOpen && onToggleSidebar) {
      onToggleSidebar();
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  };

  // Upload Logic
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File size exceeds the maximum limit of 10MB.');
      return;
    }

    setIsUploading(true);
    const loadingToast = toast.loading('Uploading and extracting file content...');
    try {
      // 1. Request presigned URL
      const presignedRes = await fetch('/api/storage/presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'text/plain',
        }),
      });

      if (!presignedRes.ok) {
        const errData = await presignedRes.json();
        throw new Error(errData.error || 'Failed to get upload authorization');
      }

      const { uploadUrl, fileKey, publicUrl } = await presignedRes.json();

      // 2. Upload to Cloudflare R2
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'text/plain',
        },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error('Failed to upload file to storage');
      }

      // 3. Extract text
      const extractRes = await fetch('/api/storage/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileKey,
          contentType: file.type || 'text/plain',
          filename: file.name,
          publicUrl,
          activeHistoryId: activeId,
        }),
      });

      if (!extractRes.ok) {
        const errData = await extractRes.json();
        throw new Error(errData.error || 'Failed to extract text from file');
      }

      const { attachment } = await extractRes.json();
      
      // Append attachment
      const updatedAttachments = [...attachments, attachment];
      onAttachmentsChange(updatedAttachments);

      // Auto-select
      onSelectedAttachmentsChange([...selectedAttachmentIds, attachment.id]);

      toast.success('File uploaded and processed successfully!', { id: loadingToast });
    } catch (err) {
      console.error('[handleFileUpload ERROR]', err);
      const msg = err instanceof Error ? err.message : 'Failed to attach file';
      toast.error(msg, { id: loadingToast });
    } finally {
      setIsUploading(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const toggleAttachmentSelection = (id: string) => {
    if (selectedAttachmentIds.includes(id)) {
      onSelectedAttachmentsChange(selectedAttachmentIds.filter(x => x !== id));
    } else {
      onSelectedAttachmentsChange([...selectedAttachmentIds, id]);
    }
  };

  const removeAttachment = (id: string) => {
    const updated = attachments.filter(x => x.id !== id);
    onAttachmentsChange(updated);
    onSelectedAttachmentsChange(selectedAttachmentIds.filter(x => x !== id));
    toast.success('Source file removed');
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
        {/* Tab Switcher */}
        {sidebarOpen && (
          <div className="flex w-full mb-3 bg-[var(--surface-2)] rounded-full p-1 border border-[var(--border)] shrink-0">
            <button
              onClick={() => setLeftPanelTab('sources')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-all border-none cursor-pointer flex items-center justify-center gap-1.5 ${
                leftPanelTab === 'sources'
                  ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                  : 'bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Sources
            </button>
            <button
              onClick={() => setLeftPanelTab('history')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-all border-none cursor-pointer flex items-center justify-center gap-1.5 ${
                leftPanelTab === 'history'
                  ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                  : 'bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              History
            </button>
          </div>
        )}

        {/* Tab content: SOURCES */}
        {leftPanelTab === 'sources' && sidebarOpen && (
          <div className="flex flex-col h-full min-h-0 overflow-hidden space-y-4">
            {/* Clerk switcher */}
            <div className="shrink-0 flex flex-col space-y-1 p-1">
              <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">Active Workspace</span>
              <OrganizationSwitcher 
                appearance={{
                  elements: {
                    rootBox: 'w-full',
                    organizationSwitcherTrigger: 'w-full justify-between bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-xs font-medium py-1.5 text-[var(--foreground)] hover:bg-[var(--surface-3)]',
                  }
                }}
              />
            </div>

            {/* Add Source button */}
            <div className="shrink-0">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full ui-btn ui-btn-outline ui-btn-sm flex justify-center gap-2 hover:bg-[var(--surface-2)]"
              >
                {isUploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileUp className="w-3.5 h-3.5" />
                )}
                <span>+ Add Source</span>
              </button>
              <input
                type="file"
                accept=".csv,.pdf,.txt"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
            </div>

            {/* Attachments checklist */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider block mb-2 px-1">Active Sources ({attachments.length})</span>
              {attachments.length === 0 ? (
                <div className="text-center py-8 px-4 text-xs text-[var(--muted-foreground)] border border-dashed border-[var(--border)] rounded-lg bg-[var(--surface-2)]/30">
                  No source files uploaded yet. Add PDF, CSV, or TXT documents to guide the AI.
                </div>
              ) : (
                <div className="space-y-1.5 pr-1">
                  {attachments.map(att => {
                    const isSelected = selectedAttachmentIds.includes(att.id);
                    return (
                      <div
                        key={att.id}
                        onClick={() => toggleAttachmentSelection(att.id)}
                        className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition-all cursor-pointer group text-left ${
                          isSelected
                            ? 'bg-[var(--surface-2)]/80 border-[var(--primary)]/30'
                            : 'bg-transparent border-[var(--border)] hover:bg-[var(--surface-2)]/50'
                        }`}
                      >
                        <div className="shrink-0 text-[var(--primary)]">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4 text-[var(--muted-foreground)]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-semibold text-[var(--foreground)] truncate" title={att.filename}>
                            {att.filename}
                          </h4>
                          <span className="text-[10px] text-[var(--muted-foreground)] font-mono uppercase tracking-wide">
                            {att.contentType.split('/').pop()}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeAttachment(att.id);
                          }}
                          className="shrink-0 p-1 opacity-0 group-hover:opacity-100 rounded-md hover:bg-[var(--surface-3)] text-[var(--muted-foreground)] hover:text-red-500 transition-all"
                          title="Delete source"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Dynamic Override Info */}
            {selectedAttachmentIds.length > 0 && (
              <div className="shrink-0 p-2.5 rounded-lg bg-[var(--primary)]/5 border border-[var(--primary)]/15 text-[10px] text-[var(--muted-foreground)] leading-relaxed flex gap-2">
                <Layers className="w-3.5 h-3.5 text-[var(--primary)] shrink-0 mt-0.5" />
                <span>
                  <strong>Dynamic Document Override</strong> active. AI will write and verify claims using context from the checked documents.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Tab content: HISTORY */}
        {leftPanelTab === 'history' && (
          <div className="flex flex-col h-full min-h-0 overflow-hidden">
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

            {/* New Draft */}
            <SidebarItem
              icon={Plus}
              label="New Draft"
              sidebarOpen={sidebarOpen}
              onClick={onNew}
              className="mt-1 shrink-0"
            />

            {/* Search */}
            <Tooltip disabled={sidebarOpen}>
              <TooltipTrigger render={
                <div 
                  className={`relative flex items-center mt-1 rounded-full transition-all duration-200 overflow-hidden shrink-0 ${!sidebarOpen ? 'hover:bg-[var(--surface-2)] cursor-pointer w-9 h-9 mx-auto' : 'bg-[var(--input)] h-8 w-full'}`}
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

            {/* Filters */}
            {sidebarOpen && (
              <div className="flex w-full mt-2 bg-[var(--surface-2)] rounded-full p-1 border border-[var(--border)] shrink-0">
                {filters.map(f => {
                  const active = activeFilter === f;
                  return (
                    <button
                      key={f}
                      onClick={() => setActiveFilter(f)}
                      className={`min-w-0 flex-1 px-1.5 py-1 text-[10px] capitalize rounded-full transition-all border-none cursor-pointer ${
                        active ? 'bg-[var(--card)] text-[var(--foreground)] font-semibold shadow-sm' : 'bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--surface-3)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      {f === 'needs_review' ? 'Review' : f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  );
                })}
              </div>
            )}

            {/* History List scrollarea */}
            <ScrollArea className={`flex-1 min-h-0 mt-2 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
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
                <div className="px-1 py-1">
                  <p className="px-2 mb-1.5 text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">
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
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full transition-[opacity,background-color,color] border-none cursor-pointer bg-transparent opacity-0 group-hover:opacity-100 hover:bg-[var(--surface-3)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
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
              )}

              {nextCursor && (
                <div className="pb-4 px-1 mt-2">
                  <button
                    onClick={() => fetchHistory(nextCursor, true)}
                    disabled={loadingMore}
                    className="ui-btn ui-btn-surface ui-btn-sm w-full rounded-full"
                  >
                    {loadingMore && <Loader2 className="w-3 h-3 animate-spin" />}
                    {loadingMore ? 'Loading…' : 'Load More'}
                  </button>
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </AppSidebarShell>
    </TooltipProvider>
  );
}
