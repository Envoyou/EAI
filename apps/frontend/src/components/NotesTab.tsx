'use client';

import { useState } from 'react';
import { Square, Notebook, Wand2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ResearchNote, Attachment } from '@/lib/hooks/useContentStrategist';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DeleteActionIcon } from '@/components/ui/icons/actions';
import {
  CollapseNavigationIcon,
  ExpandNavigationIcon,
} from '@/components/ui/icons/navigation';

interface NotesTabProps {
  researchNotes: ResearchNote[];
  onNotesChange: (notes: ResearchNote[]) => void;
  attachments?: Attachment[];
  onGenerateDraft?: (notes: ResearchNote[]) => void;
  isGeneratingDraft?: boolean;
  isWorkspaceAiBusy?: boolean;
  onCancelGenerateDraft?: () => void;
  onInsertToDraft?: (text: string) => void;
}

export default function NotesTab({
  researchNotes,
  onNotesChange,
  onGenerateDraft,
  isGeneratingDraft = false,
  isWorkspaceAiBusy = false,
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
    onGenerateDraft?.(notesToGenerate);
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
      <div className="px-3 py-2.5 flex items-center justify-between border shrink-0 bg-card">
        <span className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-2">
          Research Notes
          <Badge variant="primary" size="xs" className="font-bold">
            {researchNotes.length}
          </Badge>
        </span>
        <Button
          type="button"
          onClick={() => {
            onNotesChange([]);
            toast.success('All notes cleared');
          }}
          variant="muted"
          size="xs"
          className="strategist-notes-clear-action text-[10px] font-medium"
        >
          Clear all
        </Button>
      </div>

      {/* Generate Draft Button */}
      {onGenerateDraft && (
        <div className="px-3 py-2 border bg-card shrink-0">
          <Button
            type="button"
            onClick={isGeneratingDraft ? onCancelGenerateDraft : handleGenerateDraftFromNotes}
            disabled={!isGeneratingDraft && isWorkspaceAiBusy}
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
      <div className="flex-1 overflow-y-auto p-2 space-y-2 border bg-[var(--surface-1)]">
        {researchNotes.map((note, idx) => {
          const isExpanded = expandedNoteId === note.id;
          const relativeTime = (() => {
            const mins = Math.floor((Date.now() - new Date(note.savedAt).getTime()) / 60000);
            if (mins < 1) return 'just now';
            if (mins < 60) return `${mins} mins ago`;
            return `${Math.floor(mins / 60)} hours ago`;
          })();

          return (
            <div
              key={note.id}
              className="strategist-artifact-card group overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-sm transition-colors hover:bg-[var(--surface-2)]"
            >
              <div className="flex items-stretch">
                {onGenerateDraft && (
                  <div className="flex shrink-0 items-center border-r border-[var(--border)] px-2.5">
                    <Checkbox
                      checked={!unselectedNoteIds.includes(note.id)}
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
                  </div>
                )}

                <Button
                  type="button"
                  onClick={() => setExpandedNoteId(isExpanded ? null : note.id)}
                  variant="muted"
                  className="strategist-artifact-card-action h-auto min-w-0 flex-1 justify-start gap-2 px-3 py-3 text-left"
                  aria-expanded={isExpanded}
                  aria-controls={`research-note-content-${note.id}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-xs font-semibold text-[var(--foreground)]">
                        Note {idx + 1}
                      </span>
                      {note.sources.length > 0 && (
                        <Badge variant="surface" size="xs" className="shrink-0">
                          {note.sources.length} src
                        </Badge>
                      )}
                    </span>
                    <span className="mt-1 block text-[10px] text-[var(--muted-foreground)]">
                      {relativeTime}
                    </span>
                  </span>
                  {isExpanded ? (
                    <ExpandNavigationIcon className="size-3.5 text-[var(--muted-foreground)]" />
                  ) : (
                    <CollapseNavigationIcon className="size-3.5 text-[var(--muted-foreground)]" />
                  )}
                </Button>

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        onClick={() => {
                          const updated = researchNotes.filter(n => n.id !== note.id);
                          onNotesChange(updated);
                          if (expandedNoteId === note.id) setExpandedNoteId(null);
                          toast.success('Note deleted');
                        }}
                        variant="muted"
                        size="icon-sm"
                        className="strategist-artifact-card-action strategist-artifact-card-delete h-auto shrink-0 border-l border-[var(--border)]"
                        aria-label={`Delete note ${idx + 1}`}
                      >
                        <DeleteActionIcon className="size-3.5" />
                      </Button>
                    }
                  />
                  <TooltipContent side="left">Delete note</TooltipContent>
                </Tooltip>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    id={`research-note-content-${note.id}`}
                    className="overflow-hidden border-t border-[var(--border)] bg-[var(--background)]"
                  >
                    <div className="p-3">
                      <div className="prose dark:prose-invert strategist-prose max-w-none text-[var(--foreground)] mb-2">
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
