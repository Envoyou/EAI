import { ArticleMetadata, FeedbackItem } from '@eai/shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Trash2, FileEdit, ChevronDown, ChevronUp, BookOpen, Sparkles, SplitSquareHorizontal } from 'lucide-react';
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
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// ProseMirror Decoration Plugin for non-destructive live feedback highlighting
const FeedbackHighlightExtension = Extension.create({
  name: 'feedbackHighlight',

  addStorage() {
    return {
      activeText: null as string | null,
      hoveredText: null as string | null,
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin({
        key: new PluginKey('feedbackHighlight'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            const activeText = storage.activeText;
            const hoveredText = storage.hoveredText;

            const findMatches = (searchText: string, className: string, isSelectionActive: boolean) => {
              if (!searchText || !searchText.trim()) return;
              state.doc.descendants((node, pos) => {
                if (node.isText && node.text) {
                  let index = node.text.toLowerCase().indexOf(searchText.toLowerCase());
                  while (index !== -1) {
                    const startPos = pos + index;
                    const endPos = startPos + searchText.length;
                    decorations.push(
                      Decoration.inline(startPos, endPos, {
                        class: className,
                        id: isSelectionActive ? 'active-feedback-highlight' : undefined,
                      })
                    );
                    index = node.text.toLowerCase().indexOf(searchText.toLowerCase(), index + searchText.length);
                  }
                }
              });
            };

            // Highlight hovered items
            if (hoveredText && hoveredText !== activeText) {
              findMatches(
                hoveredText,
                'bg-[rgba(201,168,76,0.1)] border-b border-[rgba(201,168,76,0.3)] rounded-sm px-0.5 transition-all duration-200',
                false
              );
            }

            // Highlight active items
            if (activeText) {
              findMatches(
                activeText,
                'bg-[rgba(201,168,76,0.22)] border-b border-[var(--gold)] shadow-[0_0_8px_rgba(201,168,76,0.15)] rounded-sm px-0.5 transition-all duration-300',
                true
              );
            }

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

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
  onClear?: () => void;
  onOpenChatTab?: () => void;

  // Feedback highlighting
  feedback?: FeedbackItem[];
  activeFeedbackIndex?: number | null;
  hoveredFeedbackIndex?: number | null;
  originalDraft?: string;
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
  onClear,
  onOpenChatTab,
  feedback = [],
  activeFeedbackIndex = null,
  hoveredFeedbackIndex = null,
  originalDraft = '',
}: EditorProps) {
  const updateMeta = (field: keyof ArticleMetadata, val: string) => {
    onMetadataChange({ ...metadata, [field]: val });
  };

  const [showBrief, setShowBrief] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [placeholder] = useState(() => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]);
  const [compareMode, setCompareMode] = useState(false);
  const isOverLimit = value.length > charLimit;

  const prevValueRef = useRef(value);

  // Active / Hovered feedback item targetText resolution
  const activeFeedbackText = activeFeedbackIndex !== null ? (feedback[activeFeedbackIndex]?.replacementText || feedback[activeFeedbackIndex]?.targetText || null) : null;
  const hoveredFeedbackText = hoveredFeedbackIndex !== null ? (feedback[hoveredFeedbackIndex]?.replacementText || feedback[hoveredFeedbackIndex]?.targetText || null) : null;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder }),
      Markdown,
      AIPreviewExtension,
      AiActionExtension,
      FeedbackHighlightExtension.configure({
        activeText: activeFeedbackText,
        hoveredText: hoveredFeedbackText,
      }),
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

  // Sync highlighting options to Tiptap view
  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      const storageObj = (editor.storage as unknown) as Record<string, Record<string, unknown>>;
      if (storageObj.feedbackHighlight) {
        storageObj.feedbackHighlight.activeText = activeFeedbackText;
        storageObj.feedbackHighlight.hoveredText = hoveredFeedbackText;
        editor.view.dispatch(editor.state.tr);
      }
    }
  }, [activeFeedbackText, hoveredFeedbackText, editor]);

  // Scroll active feedback highlight into view
  useEffect(() => {
    if (!editor || activeFeedbackIndex === null || activeFeedbackIndex === undefined) return;
    const activeItem = feedback[activeFeedbackIndex];
    if (!activeItem) return;
    const searchText = activeItem.replacementText || activeItem.targetText;
    if (!searchText) return;

    let targetPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        const index = node.text.toLowerCase().indexOf(searchText.toLowerCase());
        if (index !== -1) {
          targetPos = pos + index;
          return false; // stop traversal
        }
      }
    });

    if (targetPos !== -1) {
      // Focus cursor at match position
      editor.commands.focus(targetPos);
      setTimeout(() => {
        const el = document.getElementById('active-feedback-highlight');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 80);
    }
  }, [activeFeedbackIndex, feedback, editor]);

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

  const handleCopy = async () => {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleClearClick = () => {
    if (!value.trim()) return;
    if (onClear) onClear();
  };

  return (
    <div className={`ui-panel flex flex-col editor-workspace min-w-0 h-full ${isFocused ? 'is-focused' : ''}`}>
      {/* Panel Header */}
      <div className="ui-panel-header px-4 py-3 md:px-5 shrink-0 bg-[var(--surface-1)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileEdit className="w-3.5 h-3.5 shrink-0 ui-muted" />
            <div className="min-w-0">
              <h2 className="text-[13px] font-semibold text-[var(--foreground)]">
                Draft Article
              </h2>
              <p className="truncate text-[11px] text-[var(--muted-foreground)]">
                Edit and format your refined article.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onOpenChatTab && (
              <button
                onClick={onOpenChatTab}
                className="ui-btn ui-btn-muted ui-btn-xs"
                style={{ color: 'var(--primary)', borderColor: 'color-mix(in srgb, var(--primary) 30%, transparent)' }}
                disabled={isLoading}
              >
                <Sparkles className="w-3.5 h-3.5 text-[var(--primary)] animate-pulse" strokeWidth={2.5} />
                <span>AI Strategist</span>
              </button>
            )}
            {originalDraft && (
              <button
                onClick={() => setCompareMode(!compareMode)}
                className={`ui-btn ui-btn-xs ${compareMode ? 'ui-btn-surface text-[var(--primary)]' : 'ui-btn-muted'}`}
                title="Toggle Compare Mode"
              >
                <SplitSquareHorizontal className="w-3.5 h-3.5" />
                <span className="max-sm:hidden">Compare</span>
              </button>
            )}
            <button
              onClick={handleCopy}
              disabled={!value.trim()}
              className="ui-btn ui-btn-muted ui-btn-xs"
            >
              <span className="max-sm:hidden">Copy</span>
            </button>
            <button
              onClick={handleClearClick}
              disabled={!value.trim()}
              className="ui-btn ui-btn-danger ui-btn-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="max-sm:hidden">Clear</span>
            </button>
          </div>
        </div>

        {/* Metadata Controls */}
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

        {/* Brief accordion link */}
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
                  {showBrief ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
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

      {/* Editor Main Canvas (Compare Mode Split vs Normal) */}
      <div className="flex-1 min-h-0 flex divide-x divide-[var(--border)] overflow-hidden">
        {compareMode && originalDraft && (
          <div className="flex-1 flex flex-col min-w-0 bg-[var(--surface-2)]/30 overflow-y-auto p-4 md:p-6 font-serif leading-[1.85] text-[15.5px] text-[var(--muted-foreground)]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-3 px-1 block">Original Draft</span>
            <div className="whitespace-pre-wrap px-4 py-2 border-l-2 border-[var(--border)]">{originalDraft}</div>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto relative" onClick={() => editor?.commands.focus()}>
          {editor && <BubbleMenuAI editor={editor} />}
          <EditorContent editor={editor} className="w-full h-full" />
        </div>
      </div>

      {/* Footer info bar */}
      <div className="shrink-0 flex items-center justify-between border-t border-[var(--border)] px-5 py-2 md:px-6 bg-[var(--surface-1)]">
        <div className="flex items-center gap-1.5 ui-muted">
          <kbd className="ui-kbd gap-1 px-2 py-0.5">Ctrl+↵</kbd>
          <span className="text-[11px] font-medium">to Refine</span>
        </div>

        {isOverLimit && (
          <span className="text-[11px] font-mono tabular-nums font-semibold" style={{ color: 'var(--error)' }}>
            {value.length.toLocaleString()} / {charLimit.toLocaleString()} — over limit
          </span>
        )}
      </div>
    </div>
  );
}
