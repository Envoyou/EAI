'use client';

import { useState } from 'react';
import { Search, Plus, FileEdit, ChevronLeft } from 'lucide-react';

interface DocumentHistoryPanelProps {
  onToggle?: () => void;
  onSelectDocument?: (id: string) => void;
  onNewDocument?: () => void;
  activeId?: string | null;
  documents?: Array<{ id: string; title: string; status: string; updatedAt: string }>;
}

export default function DocumentHistoryPanel({
  onToggle,
  onSelectDocument,
  onNewDocument,
  activeId,
  documents = [],
}: DocumentHistoryPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDocs = documents.filter(
    (doc) =>
      !searchQuery ||
      doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[var(--surface-1)] border-r border-[var(--border)]">
      <div className="flex items-center justify-between px-3 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <FileEdit className="w-4 h-4 text-[var(--muted-foreground)]" />
          <span className="text-xs font-semibold text-[var(--foreground)]">Documents</span>
        </div>
        {onToggle && (
          <button
            onClick={onToggle}
            className="p-1 rounded-md hover:bg-[var(--surface-2)] text-[var(--muted-foreground)]"
            aria-label="Close panel"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="p-2">
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted-foreground)]" />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/20 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
          />
        </div>

        <button
          onClick={onNewDocument}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--primary)] bg-[var(--primary)]/5 border border-[var(--primary)]/15 rounded-md hover:bg-[var(--primary)]/10 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Article
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <FileEdit className="w-8 h-8 text-[var(--muted-foreground)]/40 mb-3" />
            <p className="text-xs text-[var(--muted-foreground)]">
              {searchQuery ? 'No documents match your search.' : 'No documents yet. Create your first article.'}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredDocs.map((doc) => (
              <button
                key={doc.id}
                onClick={() => onSelectDocument?.(doc.id)}
                className={`w-full text-left px-3 py-2 rounded-md transition-colors text-xs ${
                  activeId === doc.id
                    ? 'bg-[var(--primary)]/10 text-[var(--foreground)] font-medium'
                    : 'hover:bg-[var(--surface-2)] text-[var(--foreground)]'
                }`}
              >
                <div className="truncate font-medium">{doc.title || 'Untitled'}</div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-[var(--muted-foreground)]">
                  <span className="capitalize">{doc.status}</span>
                  <span>{new Date(doc.updatedAt).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}