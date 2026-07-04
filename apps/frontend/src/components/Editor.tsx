import { ArticleMetadata } from '@eai/shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Copy, Trash2, FileEdit, ChevronDown, ChevronUp, BookOpen, Sparkles } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { SlashCommand, renderItems, getSuggestionItems } from './editor/extensions/slash-command';
import { BubbleMenuAI } from './editor/BubbleMenuAI';
import { AIPreviewExtension } from './editor/extensions/ai-preview-extension';
import { AiActionExtension } from './editor/extensions/ai-action-extension';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';

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
}


const PLACEHOLDERS = [
  "Begin crafting your article — write freely, EAI will refine it…",
  "Your rough ideas belong here. Press Ctrl+Enter when ready…",
  "Paste or type your draft. EAI will elevate it to publication standards…",
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
}: EditorProps) {
  const updateMeta = (field: keyof ArticleMetadata, val: string) => {
    onMetadataChange({ ...metadata, [field]: val });
  };

  const [showBrief, setShowBrief] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [placeholder, setPlaceholder] = useState(PLACEHOLDERS[0]);
  const isOverLimit = value.length > charLimit;

  // AI Drafting Assistant States
const [isWritingManually, setIsWritingManually] = useState(false);
  const prevValueRef = useRef(value);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder }),
      Markdown,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
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
        spellcheck: 'false',
        class: 'editor-canvas flex-1 w-full max-w-[95%] mx-auto resize-none border-0 outline-none px-4 py-6 md:px-4 md:py-6 leading-[1.85] font-inter text-[16px] bg-transparent text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-0 prose prose-sm dark:prose-invert focus:outline-none min-h-[500px]',
      },
      handleKeyDown: (view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          if (onAnalyze) {
            const md = (editor?.storage as unknown as { markdown?: { getMarkdown: () => string } })?.markdown?.getMarkdown();
            onChange(md || '');
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
      if (!isFocused) return;
      const md = (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
      if (md !== prevValueRef.current) {
        onChange(md);
        prevValueRef.current = md;
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [editor, isFocused, onChange]);

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

  const handleClear = () => {
    if (!value.trim()) return;
    onChange('');
    setIsWritingManually(false);

    sessionStorage.removeItem('eai_strategist_messages');
    sessionStorage.removeItem('eai_strategist_sources');
    sessionStorage.removeItem('eai_strategist_current_plan');
    sessionStorage.removeItem('eai_strategist_deep_research');
    sessionStorage.removeItem('eai_strategist_attachment');

    toast.success('Workspace cleared');
  };

  return (
    <div className="flex-1 min-w-0 flex h-full w-full overflow-hidden gap-3 md:gap-4 max-md:flex-col">
      {/* Editor Panel (Left) */}
      <div 
        className={`ui-panel flex flex-col editor-workspace min-w-0 h-full ${isFocused ? 'is-focused' : ''}`}
        style={{
          flex: 1,
          maxWidth: '56rem',
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
                  placeholder="Category…"
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
                  placeholder="Article type…"
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
                    <SelectValue placeholder="Category…" />
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
                    <SelectValue placeholder="Article type…" />
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
              placeholder="Target audience…"
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
              placeholder="Target length, e.g. 800 words…"
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
                  placeholder={`Add article-specific guidance…\n\nExample: Use a conversational tone, avoid technical jargon, and prioritize Indonesian sources.`}
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
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto select-none animate-fade-in my-auto">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--primary)]">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold tracking-tight mb-2 text-[var(--foreground)]">
              Start your article
            </h3>
            <p className="text-sm text-[var(--muted-foreground)] mb-6 leading-relaxed text-pretty">
              Write or paste an existing draft to get started.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={() => {
                  setIsWritingManually(true);
                  onChange("");
                  setTimeout(() => {
                    if (textareaRef.current) textareaRef.current.focus();
                  }, 50);
                }}
                className="ui-btn ui-btn-primary ui-btn-sm"
              >
                Write or Paste
              </button>
            </div>
          </div>
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
              {value.length.toLocaleString()} / {charLimit.toLocaleString()} — over limit
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
