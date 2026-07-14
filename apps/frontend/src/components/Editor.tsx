import { ArticleMetadata } from '@eai/shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Copy, Trash2, FileEdit, ChevronDown, ChevronUp, BookOpen, Sparkles, Loader2, Type, Code } from 'lucide-react';
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

  // Editor mode state: 'tiptap' (Rich Text) or 'markdown' (Raw Markdown)
  const [editorMode, setEditorMode] = useState<'tiptap' | 'markdown'>('tiptap');

  // AI Drafting Assistant States
  const [isWritingManually, setIsWritingManually] = useState(false);
  const prevValueRef = useRef(value);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Link hover popup states
  interface HoveredLink {
    href: string;
    text: string;
    node: HTMLAnchorElement;
    top: number;
    left: number;
    pos: number;
  }
  const [hoveredLink, setHoveredLink] = useState<HoveredLink | null>(null);
  const [isEditingLink, setIsEditingLink] = useState(false);
  const [tempHref, setTempHref] = useState('');
  const [tempText, setTempText] = useState('');

  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startCloseTimeout = () => {
    if (isEditingLink) return;
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      setHoveredLink(null);
    }, 400);
  };

  const cancelCloseTimeout = () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
  };

  useEffect(() => {
    if (hoveredLink) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTempHref(hoveredLink.href);
      setTempText(hoveredLink.text);
    } else {
      setIsEditingLink(false);
    }
  }, [hoveredLink]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
        },
      }),
      Placeholder.configure({ placeholder }),
      Markdown.configure({
        transformPastedText: true,
        transformCopiedText: true,
      }),
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
      handleDOMEvents: {
        mouseover: (view, event) => {
          const target = event.target as HTMLElement;
          const anchor = target.closest('a');
          if (anchor && scrollContainerRef.current) {
            cancelCloseTimeout();
            const href = anchor.getAttribute('href') || '';
            const text = anchor.textContent || '';
            const pos = view.posAtDOM(anchor, 0);

            const rect = anchor.getBoundingClientRect();
            const containerRect = scrollContainerRef.current.getBoundingClientRect();

            const top = rect.bottom - containerRect.top + scrollContainerRef.current.scrollTop;
            const left = rect.left - containerRect.left + scrollContainerRef.current.scrollLeft + (rect.width / 2);

            setHoveredLink({
              href,
              text,
              node: anchor,
              top,
              left,
              pos,
            });
          }
          return false;
        },
        mouseout: () => {
          startCloseTimeout();
          return false;
        },
      },
    },
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
  });

  const handleSaveLink = () => {
    if (!editor || !hoveredLink) return;

    editor.chain()
      .focus()
      .setTextSelection({ from: hoveredLink.pos, to: hoveredLink.pos + 1 })
      .extendMarkRange('link')
      .run();

    if (tempHref.trim() === '') {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: tempHref }).run();
    }

    if (tempText !== hoveredLink.text && tempText.trim() !== '') {
      editor.chain()
        .focus()
        .insertContent({
          type: 'text',
          text: tempText,
          marks: [{ type: 'link', attrs: { href: tempHref } }],
        })
        .run();
    }

    toast.success('Link updated');
    setIsEditingLink(false);
    setHoveredLink(null);
  };

  const handleRemoveLink = () => {
    if (!editor || !hoveredLink) return;
    editor.chain()
      .focus()
      .setTextSelection({ from: hoveredLink.pos, to: hoveredLink.pos + 1 })
      .extendMarkRange('link')
      .unsetLink()
      .run();

    toast.success('Link removed');
    setHoveredLink(null);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedMode = localStorage.getItem('eai_editor_mode');
    const isMobile = window.innerWidth < 640;
    if (isMobile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditorMode('tiptap');
    } else if (savedMode === 'tiptap' || savedMode === 'markdown') {
      setEditorMode(savedMode);
    }

    const handleResize = () => {
      if (window.innerWidth < 640) {
        setEditorMode('tiptap');
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleModeChange = (newMode: 'tiptap' | 'markdown') => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      newMode = 'tiptap';
    }
    if (newMode === editorMode) return;

    if (editorMode === 'tiptap' && editor) {
      const md = (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
      onChange(md);
      prevValueRef.current = md;
    } else if (newMode === 'tiptap' && editor) {
      editor.commands.setContent(value);
    }
    setEditorMode(newMode);
    localStorage.setItem('eai_editor_mode', newMode);
  };

  useEffect(() => {
    if (!editor) return;
    const interval = setInterval(() => {
      if (!isFocused || editorMode !== 'tiptap') return;
      const md = (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
      if (md !== prevValueRef.current) {
        onChange(md);
        prevValueRef.current = md;
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [editor, isFocused, onChange, editorMode]);

  useEffect(() => {
    if (!editor || editorMode !== 'tiptap') return;
    try {
      const currentMarkdown = (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
      if (value !== currentMarkdown) {
        editor.commands.setContent(value);
      }
    } catch (e) {
      console.error('Error synchronizing editor content:', e);
    }
  }, [value, editor, editorMode]);

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
          {/* Top row: Title + Switcher + Actions */}
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

            {/* Editor Mode Toggle */}
            <div className="hidden sm:flex items-center bg-[var(--surface-2)] rounded-lg p-0.5 border border-[var(--border)] shrink-0">
              <button
                onClick={() => handleModeChange('tiptap')}
                className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-md transition duration-150 ${editorMode === 'tiptap' ? 'bg-[var(--surface-1)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
              >
                <Type className="w-3 h-3" />
                <span className="max-sm:hidden">Rich Text</span>
              </button>
              <button
                onClick={() => handleModeChange('markdown')}
                className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-md transition duration-150 ${editorMode === 'markdown' ? 'bg-[var(--surface-1)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
              >
                <Code className="w-3 h-3" />
                <span className="max-sm:hidden">Markdown</span>
              </button>
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
              Write or paste an existing draft to get started. You can also chat with EAI to brainstorm ideas, refine your draft, and get editorial feedback.
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
          <div ref={scrollContainerRef} className="relative flex-1 w-full overflow-y-auto">
            {isLoading && !value && (
              <div className="absolute inset-0 z-50 bg-[var(--surface-1)]/60 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 select-none">
                <Loader2 className="w-6 h-6 text-[var(--primary)] animate-spin" />
                <div className="text-center">
                  <p className="text-xs font-bold text-[var(--foreground)]">EAI is Drafting...</p>
                  <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">Synthesizing research notes and generating your content...</p>
                </div>
              </div>
            )}

            {/* Rich Text Editor (Tiptap) */}
            <div className={editorMode === 'tiptap' ? 'w-full h-full' : 'hidden'} onClick={() => editor?.commands.focus()}>
              {editor && <BubbleMenuAI editor={editor} />}
              <EditorContent editor={editor} className="w-full h-full" />
            </div>

            {/* Raw Markdown Editor */}
            <div className={editorMode === 'markdown' ? 'w-full h-full flex flex-col' : 'hidden'}>
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    if (onAnalyze) {
                      onAnalyze();
                    }
                  }
                }}
                className="w-full h-full min-h-[500px] resize-none border-0 outline-none px-6 py-6 font-mono text-[14px] bg-transparent text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-0 focus:outline-none leading-relaxed"
                placeholder={placeholder}
                disabled={isLoading}
              />
            </div>

            {/* Link Edit Hover Popup */}
            {hoveredLink && (
              <div
                onMouseEnter={cancelCloseTimeout}
                onMouseLeave={startCloseTimeout}
                style={{
                  position: 'absolute',
                  top: `${hoveredLink.top + 8}px`,
                  left: `${hoveredLink.left}px`,
                  transform: 'translateX(-50%)',
                  resize: 'both',
                  overflow: 'auto',
                  width: '280px',
                  minHeight: isEditingLink ? '200px' : '56px',
                  maxHeight: '400px',
                }}
                className="z-50 min-w-[240px] max-w-[480px] rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 shadow-xl backdrop-blur-md animate-fade-in flex flex-col justify-center gap-2 text-xs"
              >
                {!isEditingLink ? (
                  <div className="flex items-center justify-between gap-3">
                    <a
                      href={hoveredLink.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate font-medium text-[var(--primary)] hover:underline flex-1 max-w-[180px] text-left"
                    >
                      {hoveredLink.href}
                    </a>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setIsEditingLink(true)}
                        className="p-1.5 hover:bg-[var(--surface-2)] text-[var(--foreground)] rounded-lg transition duration-150"
                        title="Edit link"
                      >
                        <FileEdit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={handleRemoveLink}
                        className="p-1.5 hover:bg-red-500/10 text-red-500 rounded-lg transition duration-150"
                        title="Remove link"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    <div className="flex flex-col gap-1 text-left">
                      <label className="text-[9px] text-[var(--muted-foreground)] font-bold uppercase tracking-wider">Text</label>
                      <input
                        type="text"
                        value={tempText}
                        onChange={(e) => setTempText(e.target.value)}
                        className="ui-control ui-input py-1 px-2 text-xs"
                        placeholder="Link text..."
                      />
                    </div>
                    <div className="flex flex-col gap-1 text-left">
                      <label className="text-[9px] text-[var(--muted-foreground)] font-bold uppercase tracking-wider">URL</label>
                      <input
                        type="text"
                        value={tempHref}
                        onChange={(e) => setTempHref(e.target.value)}
                        className="ui-control ui-input py-1 px-2 text-xs"
                        placeholder="https://..."
                      />
                    </div>
                    <div className="flex items-center justify-end gap-1.5 mt-1">
                      <button
                        onClick={() => setIsEditingLink(false)}
                        className="ui-btn ui-btn-muted ui-btn-xs"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveLink}
                        className="ui-btn ui-btn-primary ui-btn-xs"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
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
