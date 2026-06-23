import { ArticleMetadata } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Copy, Trash2, FileEdit, ChevronDown, ChevronUp, BookOpen, Sparkles, X, Wand2, List, Link2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useState, useRef, useEffect } from 'react';

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
  onGenerateDraft?: (topic: string, outline: string, referenceText: string, draftMode: string) => Promise<void>;
  isGeneratingDraft?: boolean;
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
  onGenerateDraft,
  isGeneratingDraft = false,
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
  const [draftTopic, setDraftTopic] = useState('');
  const [draftOutline, setDraftOutline] = useState('');
  const [draftReferences, setDraftReferences] = useState('');
  const [draftMode, setDraftMode] = useState<'topic' | 'outline' | 'reference' | 'press_release'>('topic');

  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);

  const handleGenerateOutline = async () => {
    if (!draftTopic.trim() || isGeneratingOutline) {
      toast.error('Please enter a Topic / Core Idea first.');
      return;
    }
    setIsGeneratingOutline(true);
    setDraftOutline('');

    try {
      const response = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: draftTopic,
          mode: 'outline',
          provider: 'gemini',
          metadata: {
            ...metadata,
          },
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(
          result?.error || `Failed to generate outline (${response.status})`
        );
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response reader not available');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }

          if (event.type === 'draft_chunk') {
            setDraftOutline((prev) => prev + (event.data as string));
          } else if (event.type === 'error') {
            throw new Error(event.data as string);
          }
        }
      }
      toast.success('Outline generated!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate outline');
    } finally {
      setIsGeneratingOutline(false);
    }
  };

  const handleFetchUrl = async () => {
    if (!referenceUrl.trim() || isFetchingUrl) return;
    setIsFetchingUrl(true);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: referenceUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch references');
      }

      setDraftReferences((prev) => {
        const separator = prev.trim() ? '\n\n' : '';
        return prev + separator + `[Source URL: ${referenceUrl}]\n` + data.text;
      });
      setReferenceUrl('');
      toast.success('Reference source text imported!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Scrape failed');
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);


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
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!isLoading && value.trim().length > 0 && !isOverLimit && onAnalyze) {
        onAnalyze();
      }
    }
  };

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
    toast.success('Workspace cleared');
  };

  return (
    <div className={`ui-panel editor-workspace h-full w-full ${isFocused ? 'is-focused' : ''}`}>
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
      {(!value && !isWritingManually) && !isLoading && !isGeneratingDraft ? (
        isDraftingAssistantActive ? (
          <div className="editor-assistant flex-1 overflow-y-auto p-4 md:p-6">
            <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--primary)]" />
                <h3 className="text-sm font-semibold text-[var(--foreground)]">
                  Create a Rough Draft
                </h3>
              </div>
              <button
                onClick={() => setIsDraftingAssistantActive(false)}
                className="ui-btn ui-btn-muted ui-btn-icon"
                aria-label="Close drafting assistant"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Using article context</span>
              </div>
              <div className="flex min-w-0 gap-1.5">
                <span className="max-w-32 truncate rounded-sm bg-[var(--surface-2)] px-2 py-0.5 font-medium text-[var(--foreground)] text-[10px]">
                  {metadata.category || 'No Category'}
                </span>
                <span className="max-w-32 truncate rounded-sm bg-[var(--surface-2)] px-2 py-0.5 font-medium text-[var(--foreground)] text-[10px]">
                  {metadata.type || 'No Type'}
                </span>
              </div>
            </div>

            <div className="ui-segmented mb-5 grid grid-cols-2 sm:grid-cols-4">
              {(['topic', 'outline', 'reference', 'press_release'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setDraftMode(mode)}
                  type="button"
                  className="ui-segmented-item truncate !px-2 !py-2 !text-[11px]"
                  data-active={draftMode === mode}
                  aria-pressed={draftMode === mode}
                >
                  {mode === 'topic' && 'From Topic'}
                  {mode === 'outline' && 'From Outline'}
                  {mode === 'reference' && 'References'}
                  {mode === 'press_release' && 'Press Release'}
                </button>
              ))}
            </div>

            <div className="flex flex-1 flex-col space-y-4">
              {/* Topic / Core Idea Field */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="draft-topic" className="text-xs font-semibold text-[var(--foreground)] flex items-center justify-between gap-4">
                  <span>Topic / Core Idea <span className="text-red-500">*</span></span>
                  <span className="text-[10px] text-[var(--muted-foreground)] font-normal">
                    {draftMode === 'topic' && 'Explain the core idea in 1-2 sentences'}
                    {draftMode === 'outline' && 'What is the main topic of your outline?'}
                    {draftMode === 'reference' && 'Topic of these reference notes'}
                    {draftMode === 'press_release' && 'Subject of the press release'}
                  </span>
                </label>
                <textarea
                  id="draft-topic"
                  name="draft-topic"
                  autoComplete="off"
                  value={draftTopic}
                  onChange={(e) => setDraftTopic(e.target.value)}
                  placeholder={
                    draftMode === 'topic'
                      ? 'Example: The impact of Nvidia Blackwell GPUs on Southeast Asia’s cloud capacity…'
                      : draftMode === 'press_release'
                      ? 'Example: Acme Corp announces a new AI-powered workflow platform…'
                      : 'Example: Implikasi pemangkasan suku bunga Fed terhadap pasar modal Indonesia…'
                  }
                  className="ui-control ui-textarea min-h-[70px] resize-none"
                  rows={2}
                  disabled={isGeneratingDraft || isGeneratingOutline}
                  required
                />
              </div>

              {/* Outline Field */}
              {draftMode === 'outline' && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="draft-outline" className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1">
                      <List className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                      <span>Outline / Key Points <span className="text-red-500">*</span></span>
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateOutline}
                      disabled={!draftTopic.trim() || isGeneratingOutline || isGeneratingDraft}
                      className="ui-btn ui-btn-outline ui-btn-xs flex items-center gap-1 py-1"
                    >
                      <Sparkles className="w-3 h-3 text-[var(--primary)]" />
                      {isGeneratingOutline ? 'Generating…' : 'Generate Outline'}
                    </button>
                  </div>
                  <textarea
                    id="draft-outline"
                    name="draft-outline"
                    autoComplete="off"
                    value={draftOutline}
                    onChange={(e) => setDraftOutline(e.target.value)}
                    placeholder={
                      `Example:\n- Introduction to Blackwell\n- Benefits for local data centers\n- Cost comparison\n- Future outlook…`
                    }
                    className="ui-control ui-textarea min-h-[90px] resize-none font-mono text-xs"
                    rows={3}
                    disabled={isGeneratingDraft || isGeneratingOutline}
                    required
                  />
                </div>
              )}

              {/* References Field */}
              {(draftMode === 'reference' || draftMode === 'press_release') && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="draft-references" className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1">
                    <Link2 className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                    <span>{draftMode === 'press_release' ? 'Press Release Content' : 'Reference Notes / Source Text'} <span className="text-red-500">*</span></span>
                  </label>

                  {draftMode !== 'press_release' && (
                    <div className="flex gap-2 mb-1">
                      <Input
                        type="url"
                        name="reference-url"
                        autoComplete="off"
                        aria-label="Reference URL"
                        placeholder="Import reference from URL…"
                        value={referenceUrl}
                        onChange={(e) => setReferenceUrl(e.target.value)}
                        disabled={isFetchingUrl || isGeneratingDraft}
                        className="ui-control ui-input text-xs h-8 flex-1"
                      />
                      <button
                        type="button"
                        onClick={handleFetchUrl}
                        disabled={!referenceUrl.trim() || isFetchingUrl || isGeneratingDraft}
                        className="ui-btn ui-btn-outline ui-btn-xs px-3 h-8"
                      >
                        {isFetchingUrl ? 'Fetching…' : 'Fetch'}
                      </button>
                    </div>
                  )}

                  <textarea
                    id="draft-references"
                    name="draft-references"
                    autoComplete="off"
                    value={draftReferences}
                    onChange={(e) => setDraftReferences(e.target.value)}
                    placeholder={
                      draftMode === 'press_release'
                        ? 'Paste the complete press release here…'
                        : 'Paste source notes, facts, figures, or reference text here…'
                    }
                    className="ui-control ui-textarea min-h-[90px] resize-none text-xs"
                    rows={3}
                    disabled={isGeneratingDraft || isFetchingUrl}
                    required
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 mt-auto flex items-center justify-end gap-2">
                <button
                  onClick={async () => {
                    if (!draftTopic.trim()) {
                      toast.error('Topic / Core Idea is required');
                      return;
                    }
                    if (draftMode === 'outline' && !draftOutline.trim()) {
                      toast.error('Outline is required in outline mode');
                      return;
                    }
                    if (draftMode === 'reference' && !draftReferences.trim()) {
                      toast.error('Reference notes or an imported URL are required in references mode');
                      return;
                    }
                    if (draftMode === 'press_release' && !draftReferences.trim()) {
                      toast.error('Press release content is required for Press Release mode');
                      return;
                    }

                    if (onGenerateDraft) {
                      const finalOutline = draftMode === 'outline' ? draftOutline : '';
                      const finalReferences = (draftMode === 'reference' || draftMode === 'press_release') ? draftReferences : '';
                      
                      await onGenerateDraft(draftTopic, finalOutline, finalReferences, draftMode);
                      setIsDraftingAssistantActive(false);
                      // Clear form inputs
                      setDraftTopic('');
                      setDraftOutline('');
                      setDraftReferences('');
                    }
                  }}
                  disabled={!draftTopic.trim() || isGeneratingDraft || isGeneratingOutline || isFetchingUrl}
                  className="ui-btn ui-btn-primary"
                >
                  <Wand2 className="w-4 h-4" />
                  Generate Rough Draft
                </button>
                <button
                  onClick={() => {
                    setIsDraftingAssistantActive(false);
                  }}
                  disabled={isGeneratingDraft || isGeneratingOutline || isFetchingUrl}
                  className="ui-btn ui-btn-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto select-none animate-fade-in my-auto">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] text-[var(--primary)]">
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
                onClick={() => {
                  setIsDraftingAssistantActive(true);
                }}
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
                    if (textareaRef.current) {
                      textareaRef.current.focus();
                    }
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
        <textarea
          ref={textareaRef}
          name="article-draft"
          autoComplete="off"
          aria-label="Article draft"
          className="editor-canvas flex-1 w-full resize-none border-0 outline-none px-6 py-6 md:px-12 md:py-10 leading-[1.85] font-serif text-[16px] bg-transparent text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-0"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={isLoading || isGeneratingDraft}
          spellCheck
        />
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
  );
}
