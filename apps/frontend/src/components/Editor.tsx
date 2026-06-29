import { ArticleMetadata } from '@eai/shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Copy, Trash2, FileEdit, ChevronDown, ChevronUp, BookOpen, Sparkles, Wand2, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ContentStrategistWizard from './ContentStrategistWizard';
import type { ResearchNote } from './ContentStrategistWizard';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { SlashCommand, renderItems, getSuggestionItems } from './editor/extensions/slash-command';
import { BubbleMenuAI } from './editor/BubbleMenuAI';
import { AIPreviewExtension } from './editor/extensions/ai-preview-extension';
import { AiActionExtension } from './editor/extensions/ai-action-extension';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  metadata: ArticleMetadata;
  onMetadataChange: (metadata: ArticleMetadata) => void;
  isLoading: boolean;
  onAnalyze?: () => void;
  categoryOptions?: string[];
  articleTypeOptions?: string[];
  editorialBrandName?: string;
  isPersonal?: boolean;
  onAddNewMetadataOption?: (type: 'category' | 'articleType', value: string) => void;
  charLimit?: number;
  showNotesSidebar?: boolean;
  onHasNotesChange?: (hasNotes: boolean) => void;
}


const PLACEHOLDERS = [
  "Begin crafting your article \u2014 write freely, EAI will refine it\u2026",
  "Your rough ideas belong here. Press Ctrl+Enter when ready\u2026",
  "Paste or type your draft. EAI will elevate it to publication standards\u2026",
];

export default function Editor({
  value,
  onChange,
  metadata,
  onMetadataChange,
  isLoading,
  onAnalyze,
  categoryOptions = [],
  articleTypeOptions = [],
  editorialBrandName = 'the active editorial profile',
  isPersonal = false,
  onAddNewMetadataOption,
  charLimit = 15000,
  showNotesSidebar = true,
  onHasNotesChange,
}: EditorProps) {
  const updateMeta = (field: keyof ArticleMetadata, val: string) => {
    onMetadataChange({ ...metadata, [field]: val });
  };

  const [showBrief, setShowBrief] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [placeholder, setPlaceholder] = useState(PLACEHOLDERS[0]);
  const isOverLimit = value.length > charLimit;

  // AI Drafting Assistant States
  const [isDraftingAssistantActive, setIsDraftingAssistantActive] = useState(false);
  const [isWritingManually, setIsWritingManually] = useState(false);
  const prevValueRef = useRef(value);

  const SESSION_KEY = 'eai_research_notes';
  
  // Research Notes state (NotebookLM approach)
  const [researchNotes, setResearchNotes] = useState<ResearchNote[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]'); } catch { return []; }
  });
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  useEffect(() => {
    if (onHasNotesChange) {
      onHasNotesChange(researchNotes.length > 0);
    }
  }, [researchNotes.length, onHasNotesChange]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder }),
      Markdown,
      AIPreviewExtension,
      AiActionExtension,
      SlashCommand.configure({
        suggestion: {
          items: getSuggestionItems,
          render: renderItems,
        },
      }),
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'editor-canvas flex-1 w-full max-w-[800px] mx-auto resize-none border-0 outline-none px-6 py-6 md:px-12 md:py-10 leading-[1.85] font-serif text-[16px] bg-transparent text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-0 prose prose-sm dark:prose-invert focus:outline-none min-h-[500px]',
      },
      handleKeyDown: (view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          if (onAnalyze) {
            const md = (editor?.storage as unknown as { markdown?: { getMarkdown: () => string } })?.markdown?.getMarkdown();
            onChange(md || ''); // Serialize immediately on refine
            onAnalyze();
          }
          return true;
        }
        return false;
      },
    },
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
  });

  useEffect(() => {
    if (!editor) return;
    const interval = setInterval(() => {
      // Background sync for auto-save (lazy markdown serialization)
      if (!isFocused) return;
      const md = (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
      if (md !== prevValueRef.current) {
        onChange(md);
        prevValueRef.current = md;
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [editor, isFocused, onChange]);

  // Synchronize external value prop changes into the editor canvas (e.g. from generated drafts or notes)
  useEffect(() => {
    if (!editor) return;
    try {
      const currentMarkdown = (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
      if (value !== currentMarkdown) {
        editor.commands.setContent(value);
      }
    } catch (e) {
      console.error('Error synchronizing editor content:', e);
    }
  }, [value, editor]);

  // Randomise placeholder only on client to avoid SSR hydration mismatch
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlaceholder(PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]);
  }, []);

  useEffect(() => {
    if (value) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsWritingManually(true);
    } else if (value === '' && prevValueRef.current !== '' && !isFocused) {
      setIsWritingManually(false);
    }
    prevValueRef.current = value;
  }, [value, isFocused]);
  


  const handleCopy = async () => {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [unselectedNoteIds, setUnselectedNoteIds] = useState<string[]>([]);

  const handleClear = () => {
    if (!value.trim()) return;
    onChange('');
    setIsWritingManually(false);
    toast.success('Workspace cleared');
  };

  const handleGenerateDraftFromNotes = async () => {
    const notesToGenerate = researchNotes.filter(n => !unselectedNoteIds.includes(n.id));
    if (notesToGenerate.length === 0) {
      toast.error('Select at least one note to generate');
      return;
    }
    
    setIsGeneratingDraft(true);
    onChange(''); // Clear the editor before streaming
    setIsWritingManually(true);
    let currentDraft = '';

    try {
      const response = await fetch('/api/strategist/generate-draft-from-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes: notesToGenerate, metadata }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Backend error response:', errorText);
        throw new Error(`Failed to generate draft: ${response.status} - ${errorText}`);
      }
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;

        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'text') {
              currentDraft += data.chunk;
              onChange(currentDraft);
            } else if (data.type === 'error') {
              toast.error(data.message);
            }
          }
        }
      }
      toast.success('Draft generated successfully!');
    } catch (error) {
      console.error(error);
      toast.error('Gagal men-generate draft');
    } finally {
      setIsGeneratingDraft(false);
      setTimeout(() => {
        if (textareaRef.current) textareaRef.current.focus();
      }, 50);
    }
  };

  return (
    <div className="flex-1 min-w-0 flex h-full w-full overflow-hidden gap-3 md:gap-4 max-md:flex-col">
      {/* Editor Panel (Left) */}
      <div 
        className={`ui-panel flex flex-col editor-workspace min-w-0 h-full ${isFocused ? 'is-focused' : ''}`}
        style={{
          flex: 1,
          maxWidth: (showNotesSidebar && researchNotes.length > 0) ? '9999px' : '56rem',
          marginLeft: 'auto',
          marginRight: 'auto',
          transition: 'max-width 240ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Panel Header */}
        <div className="ui-panel-header px-4 py-3 md:px-5">
          {/* Top row: Title + Actions */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <FileEdit className="w-3.5 h-3.5 shrink-0 ui-muted" />
              <div className="min-w-0">
                <h2 className="text-[13px] font-semibold text-[var(--foreground)]">
                  Draft Article
                </h2>
                <p className="truncate text-[11px] text-[var(--muted-foreground)]">
                  Add the editorial context EAI should follow.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={handleCopy}
                disabled={!value.trim()}
                className="ui-btn ui-btn-muted ui-btn-xs"
              >
                <Copy className="w-3.5 h-3.5" />
                <span className="max-sm:hidden">Copy</span>
              </button>
              <button
                onClick={handleClear}
                disabled={!value.trim()}
                className="ui-btn ui-btn-danger ui-btn-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="max-sm:hidden">Clear</span>
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {isPersonal ? (
              <>
                <input
                  type="text"
                  name="article-category"
                  autoComplete="off"
                  aria-label="Article category"
                  list="category-options"
                  value={metadata.category || ''}
                  onChange={e => updateMeta('category', e.target.value)}
                  onBlur={e => {
                    const val = e.target.value.trim();
                    if (onAddNewMetadataOption && val) {
                      onAddNewMetadataOption('category', val);
                    }
                  }}
                  disabled={isLoading}
                  placeholder="Category\u2026"
                  className="ui-control ui-input"
                />
                <datalist id="category-options">
                  {categoryOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>

                <input
                  type="text"
                  name="article-type"
                  autoComplete="off"
                  aria-label="Article type"
                  list="type-options"
                  value={metadata.type || ''}
                  onChange={e => updateMeta('type', e.target.value)}
                  onBlur={e => {
                    const val = e.target.value.trim();
                    if (onAddNewMetadataOption && val) {
                      onAddNewMetadataOption('articleType', val);
                    }
                  }}
                  disabled={isLoading}
                  placeholder="Article type\u2026"
                  className="ui-control ui-input"
                />
                <datalist id="type-options">
                  {articleTypeOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </>
            ) : (
              <>
                <Select
                  value={metadata.category || ''}
                  onValueChange={val => updateMeta('category', val as string)}
                  disabled={isLoading}
                >
                  <SelectTrigger
                    aria-label="Article category"
                    className={`ui-control ui-select ${metadata.category ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}`}
                  >
                    <SelectValue placeholder="Category\u2026" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((option) => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={metadata.type || ''}
                  onValueChange={val => updateMeta('type', val as string)}
                  disabled={isLoading}
                >
                  <SelectTrigger
                    aria-label="Article type"
                    className={`ui-control ui-select ${metadata.type ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}`}
                  >
                    <SelectValue placeholder="Article type\u2026" />
                  </SelectTrigger>
                  <SelectContent>
                    {articleTypeOptions.map((option) => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            <Input
              type="text"
              name="target-audience"
              autoComplete="off"
              aria-label="Target audience"
              placeholder="Target audience\u2026"
              value={metadata.targetAudience || ''}
              onChange={e => updateMeta('targetAudience', e.target.value)}
              disabled={isLoading}
              className="ui-control ui-input"
            />
            <Input
              type="text"
              name="target-length"
              autoComplete="off"
              aria-label="Target article length"
              placeholder="Target length, e.g. 800 words\u2026"
              value={metadata.targetLength || ''}
              onChange={e => updateMeta('targetLength', e.target.value)}
              disabled={isLoading}
              className="ui-control ui-input"
            />
          </div>

          <div className="mt-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    onClick={() => setShowBrief(p => !p)}
                    className="ui-btn ui-btn-muted ui-btn-xs -ml-2 w-max"
                    style={{ color: showBrief || metadata.brief ? 'var(--primary)' : 'var(--muted-foreground)' }}
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Writing Instructions
                    {metadata.brief && !showBrief && (
                      <span
                        className="ml-1 inline-block w-1.5 h-1.5 rounded-full"
                        style={{ background: 'var(--primary)' }}
                      />
                    )}
                    {showBrief
                      ? <ChevronUp className="h-3.5 w-3.5 ml-auto" />
                      : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
                  </button>
                }
              />
              <TooltipContent side="bottom" className="text-xs">
                Add voice, tone, or writing instructions for this article.
              </TooltipContent>
            </Tooltip>

            {showBrief && (
              <div className="mt-2">
                <textarea
                  name="writing-instructions"
                  autoComplete="off"
                  aria-label="Writing instructions"
                  value={metadata.brief || ''}
                  onChange={e => updateMeta('brief', e.target.value)}
                  placeholder={`Add article-specific guidance\u2026\n\nExample: Use a conversational tone, avoid technical jargon, and prioritize Indonesian sources.`}
                  disabled={isLoading}
                  rows={4}
                  className="ui-control ui-textarea"
                />
                <p className="mt-1.5 px-1 text-[11px] ui-muted">
                  Leave empty to use the default {editorialBrandName} writing standard.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Textarea, Welcome Card, or AI Drafting Form based on state */}
        {(!value && !isWritingManually) && !isLoading ? (
          isDraftingAssistantActive ? (
            <ContentStrategistWizard
              onComplete={(topic, outline, draft, notes) => {
                const content = draft || outline || topic;
                onChange(content);
                if (notes && notes.length > 0) {
                  setResearchNotes(notes);
                  if (onHasNotesChange) onHasNotesChange(true);
                }
                setIsWritingManually(true);
                setIsDraftingAssistantActive(false);
              }}
              onCancel={() => {
                // Reload notes from sessionStorage in case they saved some before cancelling
                let currentNotes: ResearchNote[] = [];
                try { currentNotes = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]'); } catch {}
                setResearchNotes(currentNotes);
                if (onHasNotesChange) onHasNotesChange(currentNotes.length > 0);
                
                setIsDraftingAssistantActive(false);
                
                // If they saved notes, transition to manual writing mode so they can see the notes panel
                if (currentNotes.length > 0) {
                  setIsWritingManually(true);
                  setTimeout(() => {
                    if (textareaRef.current) textareaRef.current.focus();
                  }, 50);
                }
              }}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto select-none animate-fade-in my-auto">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--primary)]">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight mb-2 text-[var(--foreground)]">
                Start your article
              </h3>
              <p className="text-sm text-[var(--muted-foreground)] mb-6 leading-relaxed text-pretty">
                Write or paste an existing draft, or ask EAI to create a structured starting point.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => setIsDraftingAssistantActive(true)}
                  className="ui-btn ui-btn-primary ui-btn-sm"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  Create with EAI
                </button>
                <button
                  onClick={() => {
                    setIsWritingManually(true);
                    onChange("");
                    setTimeout(() => {
                      if (textareaRef.current) textareaRef.current.focus();
                    }, 50);
                  }}
                  className="ui-btn ui-btn-outline ui-btn-sm"
                >
                  Write or Paste
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="relative flex-1 w-full overflow-y-auto" onClick={() => editor?.commands.focus()}>
            {editor && <BubbleMenuAI editor={editor} />}
            <EditorContent editor={editor} className="w-full h-full" />
          </div>
        )}

        <div className="shrink-0 flex items-center justify-between border-t border-[var(--border)] px-5 py-2 md:px-6 bg-transparent">
          <div className="flex items-center gap-1.5 ui-muted">
            <kbd className="ui-kbd gap-1 px-2 py-0.5">
              Ctrl+↵
            </kbd>
            <span className="text-[11px] font-medium">to Refine</span>
          </div>

          {isOverLimit && (
            <span
              className="text-[11px] font-mono tabular-nums font-semibold"
              style={{ color: 'var(--error)' }}
            >
              {value.length.toLocaleString()} / {charLimit.toLocaleString()} \u2014 over limit
            </span>
          )}
        </div>
      </div>

      {/* Studio Catatan Riset Data User (Right Panel) */}
      <AnimatePresence initial={false}>
        {researchNotes.length > 0 && !isLoading && (
          <motion.div
            initial={false}
            animate={{
              width: showNotesSidebar ? 'auto' : 0,
              opacity: showNotesSidebar ? 1 : 0,
            }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex-shrink-0 flex flex-col h-full overflow-hidden"
          >
            <div className="w-[360px] max-md:w-[calc(100vw-1.5rem)] shrink-0 ui-panel flex flex-col bg-[var(--surface-1)] h-full overflow-hidden shadow-sm">
          <div className="px-4 py-3.5 flex items-center justify-between border-b border-[var(--border)] shrink-0 bg-[var(--surface-2)]">
            <span className="text-[13px] font-semibold text-[var(--foreground)] flex items-center gap-2">
              📋 Research Notes Studio
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}>
                {researchNotes.length}
              </span>
            </span>
            <button
              onClick={() => {
                setResearchNotes([]);
                if (onHasNotesChange) onHasNotesChange(false);
                sessionStorage.removeItem(SESSION_KEY);
                toast.success('All notes cleared');
              }}
              className="text-[11px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              Clear all
            </button>
          </div>
          <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
            <button
              onClick={handleGenerateDraftFromNotes}
              disabled={isGeneratingDraft}
              className="w-full ui-btn ui-btn-primary ui-btn-sm flex justify-center gap-2 shadow-sm"
            >
              {isGeneratingDraft ? (
                <div className="w-3.5 h-3.5 border-2 border-current border-r-transparent rounded-full animate-spin" />
              ) : (
                <Wand2 className="w-3.5 h-3.5" />
              )}
              {isGeneratingDraft ? 'Generating Draft...' : 'Generate Draft from Notes'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[var(--surface-1)]">
            {researchNotes.map((note, idx) => {
              const isExpanded = expandedNoteId === note.id;
              const relativeTime = (() => {
                const mins = Math.floor((Date.now() - new Date(note.savedAt).getTime()) / 60000);
                if (mins < 1) return 'just now';
                if (mins < 60) return `${mins} mins ago`;
                return `${Math.floor(mins / 60)} hours ago`;
              })();
              
              return (
                <div key={note.id} className="relative bg-[var(--background)] border border-[var(--border)] rounded-xl p-3 group shadow-sm hover:shadow-md transition-shadow">
                  {/* Delete button */}
                  <button
                    onClick={() => {
                      const updated = researchNotes.filter(n => n.id !== note.id);
                      setResearchNotes(updated);
                      sessionStorage.setItem(SESSION_KEY, JSON.stringify(updated));
                      if (expandedNoteId === note.id) setExpandedNoteId(null);
                      toast.success('Note deleted');
                    }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all bg-[var(--background)]/80 backdrop-blur-sm"
                    title="Delete note"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>

                  {/* Note header */}
                  <div className="flex items-center gap-2 mb-1 pr-6">
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
                      className="w-3.5 h-3.5 shrink-0 rounded border border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer bg-[var(--surface-1)]"
                    />
                    <button
                      type="button"
                      onClick={() => setExpandedNoteId(isExpanded ? null : note.id)}
                      aria-expanded={isExpanded}
                      className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent text-left cursor-pointer hover:bg-[var(--surface-2)] px-1.5 py-1 -ml-1.5 rounded-md transition-colors"
                    >
                      <span className="text-[11px] font-semibold text-[var(--primary)] uppercase tracking-wider">Note {idx + 1}</span>
                      {note.sources.length > 0 && (
                        <span className="text-[10px] text-[var(--muted-foreground)] hidden sm:inline-block">· {note.sources.length} sources</span>
                      )}
                      <span className="text-[10px] text-[var(--muted-foreground)] ml-auto">{relativeTime}</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-[var(--muted-foreground)] shrink-0" /> : <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)] shrink-0" />}
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
                          {/* Content */}
                          <p className="text-[13px] text-[var(--foreground)] leading-relaxed whitespace-pre-wrap mb-3">
                            {note.content}
                          </p>

                          {/* Source domain badges */}
                          {note.sources.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {note.sources.slice(0, 5).map((src, si) => (
                                <a
                                  key={si}
                                  href={src.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1.5 text-[10px] bg-[var(--surface-2)] border border-[var(--border)] rounded-full px-2 py-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--foreground)] transition-colors"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={`https://www.google.com/s2/favicons?domain=${src.domain}&sz=16`} className="w-3 h-3 rounded-full" alt="" />
                                  {src.domain}
                                </a>
                              ))}
                              {note.sources.length > 5 && (
                                <span className="text-[10px] text-[var(--muted-foreground)] px-1 py-0.5">+{note.sources.length - 5} others</span>
                              )}
                            </div>
                          )}

                          {/* Insert to Draft button */}
                          <div className="mt-3 flex justify-end">
                            <button
                              onClick={() => {
                                const citationMd = note.sources.length > 0
                                  ? '\n\n**Referensi:**\n' + note.sources.map(s => `- [${s.domain}](${s.url})`).join('\n')
                                  : '';
                                const insertText = `\n\n---\n<!-- Research Note: ${new Date(note.savedAt).toLocaleString('id-ID')} -->\n${note.content}${citationMd}`;
                                
                                const newValue = value + insertText;
                                onChange(newValue);
                                toast.success('Note inserted to draft');
                              }}
                              className="text-[11px] font-medium ui-btn ui-btn-outline ui-btn-xs"
                            >
                              <FileEdit className="w-3.5 h-3.5 mr-1.5" />
                              Insert to Draft
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
