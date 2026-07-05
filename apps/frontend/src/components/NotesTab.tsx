'use client';

import { useState } from 'react';
import { X, ChevronDown, ChevronUp, Notebook, Wand2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ResearchNote, Attachment } from '@/lib/hooks/useContentStrategist';

interface NotesTabProps {
  researchNotes: ResearchNote[];
  onNotesChange: (notes: ResearchNote[]) => void;
  attachments?: Attachment[];
  onGenerateDraft?: () => void;
  isGeneratingDraft?: boolean;
  onInsertToDraft?: (text: string) => void;
}

export default function NotesTab({
  researchNotes,
  onNotesChange,
  onGenerateDraft,
  isGeneratingDraft = false,
  onInsertToDraft,
}: NotesTabProps) {
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [unselectedNoteIds, setUnselectedNoteIds] = useState<string[]>([]);

  const handleGenerateDraftFromNotes = async () => {
    const notesToGenerate = researchNotes.filter(n => !unselectedNoteIds.includes(n.id));
    if (notesToGenerate.length === 0) {
      toast.error('Select at least one note to generate');
      return;
    }
    onGenerateDraft?.();
  };

  if (researchNotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
        <Notebook className="w-10 h-10 text-[var(--primary)]/30 mb-3" />
        <p className="text-xs text-[var(--muted-foreground)] font-medium mb-1">Research Notes</p>
        <p className="text-xs text-[var(--muted-foreground)]/70">
          Your research notes will appear here as you interact with the content strategist in Chat with EAI. You can generate a draft from your notes or insert them into your current draft.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-[var(--border)] shrink-0 bg-[var(--surface-2)]">
        <span className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-2">
          Research Notes
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}>
            {researchNotes.length}
          </span>
        </span>
        <button
          onClick={() => {
            onNotesChange([]);
            toast.success('All notes cleared');
          }}
          className="text-[10px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          Clear all
        </button>
      </div>

      {/* Generate Draft Button */}
      {onGenerateDraft && (
        <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
          <button
            onClick={handleGenerateDraftFromNotes}
            disabled={isGeneratingDraft}
            className="w-full ui-btn ui-btn-primary ui-btn-sm flex justify-center gap-1.5 text-xs"
          >
            {isGeneratingDraft ? (
              <div className="w-3 h-3 border-2 border-current border-r-transparent rounded-full animate-spin" />
            ) : (
              <Wand2 className="w-3 h-3" />
            )}
            {isGeneratingDraft ? 'Generating Draft...' : 'Generate Draft from Notes'}
          </button>
        </div>
      )}

      {/* Note List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-[var(--surface-1)]">
        {researchNotes.map((note, idx) => {
          const isExpanded = expandedNoteId === note.id;
          const relativeTime = (() => {
            const mins = Math.floor((Date.now() - new Date(note.savedAt).getTime()) / 60000);
            if (mins < 1) return 'just now';
            if (mins < 60) return `${mins} mins ago`;
            return `${Math.floor(mins / 60)} hours ago`;
          })();

          return (
            <div key={note.id} className="relative bg-[var(--background)] border border-[var(--border)] rounded-lg p-2.5 group shadow-sm hover:shadow-md transition-shadow">
              {/* Delete button */}
              <button
                onClick={() => {
                  const updated = researchNotes.filter(n => n.id !== note.id);
                  onNotesChange(updated);
                  if (expandedNoteId === note.id) setExpandedNoteId(null);
                  toast.success('Note deleted');
                }}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all"
                title="Delete note"
              >
                <X className="w-3 h-3" />
              </button>

              {/* Note header */}
              <div className="flex items-center gap-1.5 pr-5">
                {onGenerateDraft && (
                  <input
                    type="checkbox"
                    checked={!unselectedNoteIds.includes(note.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setUnselectedNoteIds(prev => prev.filter(id => id !== note.id));
                      } else {
                        setUnselectedNoteIds(prev => [...prev, note.id]);
                      }
                    }}
                    className="w-3 h-3 shrink-0 rounded border border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer bg-[var(--surface-1)]"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setExpandedNoteId(isExpanded ? null : note.id)}
                  aria-expanded={isExpanded}
                  className="flex min-w-0 flex-1 items-center gap-1.5 border-0 bg-transparent text-left cursor-pointer hover:bg-[var(--surface-2)] px-1 py-0.5 rounded transition-colors"
                >
                  <span className="text-[10px] font-semibold text-[var(--primary)] uppercase tracking-wider">Note {idx + 1}</span>
                  {note.sources.length > 0 && (
                    <span className="text-[10px] text-[var(--muted-foreground)]">· {note.sources.length} src</span>
                  )}
                  <span className="text-[10px] text-[var(--muted-foreground)] ml-auto">{relativeTime}</span>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-[var(--muted-foreground)] shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--muted-foreground)] shrink-0" />}
                </button>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="pt-2 pb-1">
                      <div className="prose strategist-prose max-w-none text-[var(--foreground)] mb-2">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {note.content}
                        </ReactMarkdown>
                      </div>

                      {note.sources.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {note.sources.slice(0, 3).map((src, si) => (
                            <a
                              key={si}
                              href={src.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-[9px] bg-[var(--surface-2)] border border-[var(--border)] rounded-full px-1.5 py-0.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`https://www.google.com/s2/favicons?domain=${src.domain}&sz=16`} className="w-2.5 h-2.5 rounded-full" alt="" />
                              {src.domain}
                            </a>
                          ))}
                          {note.sources.length > 3 && (
                            <span className="text-[9px] text-[var(--muted-foreground)] px-1 py-0.5">+{note.sources.length - 3} more</span>
                          )}
                        </div>
                      )}

                      {onInsertToDraft && (
                        <div className="flex justify-end">
                          <button
                            onClick={() => {
                              const citationMd = note.sources.length > 0
                                ? '\n\n**Referensi:**\n' + note.sources.map(s => `- [${s.domain}](${s.url})`).join('\n')
                                : '';
                              const insertText = `\n\n---\n<!-- Research Note: ${new Date(note.savedAt).toLocaleString('id-ID')} -->\n${note.content}${citationMd}`;
                              onInsertToDraft(insertText);
                              toast.success('Note inserted to draft');
                            }}
                            className="text-[10px] font-medium ui-btn ui-btn-outline ui-btn-xs"
                          >
                            <Notebook className="w-3 h-3 mr-1" />
                            Insert to Draft
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}