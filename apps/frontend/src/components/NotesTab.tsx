'use client';

import { useState } from 'react';
import { Square, X, ChevronDown, ChevronUp, Notebook, Wand2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ResearchNote, Attachment } from '@/lib/hooks/useContentStrategist';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface NotesTabProps {
  researchNotes: ResearchNote[];
  onNotesChange: (notes: ResearchNote[]) => void;
  attachments?: Attachment[];
  onGenerateDraft?: () => void;
  isGeneratingDraft?: boolean;
  onCancelGenerateDraft?: () => void;
  onInsertToDraft?: (text: string) => void;
}

export default function NotesTab({
  researchNotes,
  onNotesChange,
  onGenerateDraft,
  isGeneratingDraft = false,
  onCancelGenerateDraft,
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
          <Badge variant="primary" size="xs" className="font-bold">
            {researchNotes.length}
          </Badge>
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
          <Button
            type="button"
            onClick={isGeneratingDraft ? onCancelGenerateDraft : handleGenerateDraftFromNotes}
            variant={isGeneratingDraft ? 'danger' : 'primary'}
            size="sm"
            className="w-full justify-center gap-1.5 text-xs"
          >
            {isGeneratingDraft ? (
              <Square className="w-3 h-3 fill-current shrink-0" />
            ) : (
              <Wand2 className="w-3 h-3" />
            )}
            {isGeneratingDraft ? 'Cancel Generation' : 'Generate Draft from Notes'}
          </Button>
          {isGeneratingDraft && (
            <div className="mt-2 p-2.5 bg-[var(--primary)]/5 border border-[var(--primary)]/10 rounded-lg flex items-center gap-2.5">
              <div className="w-3.5 h-3.5 border-2 border-[var(--primary)] border-r-transparent rounded-full animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-[var(--foreground)] leading-none">EAI is Drafting...</p>
                <p className="text-[9px] text-[var(--muted-foreground)] mt-1.5 leading-none">Synthesizing notes into a fresh draft...</p>
              </div>
            </div>
          )}
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
            <div key={note.id} className="relative bg-[var(--background)] border border-[var(--border)] rounded-lg p-2.5 group shadow-sm hover:shadow-md hover:bg-[var(--surface-2)]/60 transition-all">
              {/* Delete button */}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      onClick={() => {
                        const updated = researchNotes.filter(n => n.id !== note.id);
                        onNotesChange(updated);
                        if (expandedNoteId === note.id) setExpandedNoteId(null);
                        toast.success('Note deleted');
                      }}
                      className="absolute top-2 right-2 md:opacity-0 md:group-hover:opacity-100 opacity-80 p-1 rounded hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  }
                />
                <TooltipContent>Delete note</TooltipContent>
              </Tooltip>

              {/* Note header */}
              <div 
                onClick={() => setExpandedNoteId(isExpanded ? null : note.id)}
                className="flex items-center gap-1.5 pr-5 cursor-pointer select-none"
              >
                {onGenerateDraft && (
                  <Checkbox
                    checked={!unselectedNoteIds.includes(note.id)}
                    onClick={(e) => e.stopPropagation()}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setUnselectedNoteIds(prev => prev.filter(id => id !== note.id));
                      } else {
                        setUnselectedNoteIds(prev => [...prev, note.id]);
                      }
                    }}
                    className="size-3"
                    aria-label={`Include note ${idx + 1} in draft generation`}
                  />
                )}
                <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-0.5 rounded">
                  <span className="text-[10px] font-semibold text-[var(--primary)] uppercase tracking-wider">Note {idx + 1}</span>
                  {note.sources.length > 0 && (
                    <span className="text-[10px] text-[var(--muted-foreground)]">· {note.sources.length} src</span>
                  )}
                  <span className="text-[10px] text-[var(--muted-foreground)] ml-auto">{relativeTime}</span>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-[var(--muted-foreground)] shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--muted-foreground)] shrink-0" />}
                </div>
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
                            <Badge
                              key={si}
                              variant="surface"
                              size="xs"
                              render={<a href={src.url} target="_blank" rel="noreferrer" />}
                              className="flex items-center gap-1 hover:text-[var(--foreground)]"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`https://www.google.com/s2/favicons?domain=${src.domain}&sz=16`} className="w-2.5 h-2.5 rounded-full" alt="" />
                              {src.domain}
                            </Badge>
                          ))}
                          {note.sources.length > 3 && (
                            <span className="text-[9px] text-[var(--muted-foreground)] px-1 py-0.5">+{note.sources.length - 3} more</span>
                          )}
                        </div>
                      )}

                      {onInsertToDraft && (
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            onClick={() => {
                              const citationMd = note.sources.length > 0
                                ? '\n\n**Referensi:**\n' + note.sources.map(s => `- [${s.domain}](${s.url})`).join('\n')
                                : '';
                              const insertText = `\n\n---\n<!-- Research Note: ${new Date(note.savedAt).toLocaleString('id-ID')} -->\n${note.content}${citationMd}`;
                              onInsertToDraft(insertText);
                              toast.success('Note inserted to draft');
                            }}
                            variant="outline"
                            size="xs"
                            className="text-[10px] font-medium"
                          >
                            <Notebook className="w-3 h-3 mr-1" />
                            Insert to Draft
                          </Button>
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
