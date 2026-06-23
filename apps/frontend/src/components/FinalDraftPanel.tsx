'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Popover } from '@base-ui/react/popover';
import {
  Copy, FileDiff, CheckCircle2, PlusCircle, MinusCircle,
  Eye, Code, SplitSquareHorizontal, Send, Loader2, Maximize2, Minimize2,
  MoreVertical, FileText, Download, Sparkles, ChevronDown, ChevronUp, AlertTriangle, RefreshCw
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { buildParagraphDiff } from '@/lib/diff';
import { ArticleMetadata, EditorialProcessStage, FeedbackItem } from '@/types';
import EditorialProgress from '@/components/EditorialProgress';

interface FinalDraftPanelProps {
  originalDraft: string;
  polishedDraft: string;
  ready: boolean;
  exportBlocked?: boolean;
  cmsConnected?: boolean;
  analysisLogId?: string;
  sourceRef?: string;
  articleMetadata?: ArticleMetadata;
  exportStatus?: {
    blogPostId?: string;
    blogEditUrl?: string;
    lastExportedAt?: string;
    lastExportStatus?: 'success' | 'failed';
    lastExportError?: string;
  };
  generatedMetadata?: {
    title?: string;
    slug?: string;
    excerpt?: string;
    metaTitle?: string;
    metaDescription?: string;
    coverImageAltText?: string;
    tags?: string[];
  };
  isFocused?: boolean;
  onFocusToggle?: () => void;
  isStreaming?: boolean;
  isRefining?: boolean;
  processStage?: EditorialProcessStage;
  processStartedAt?: number | null;
  isStale?: boolean;
  onRefineAgain?: (instruction: string) => void;
  onReanalyze?: () => void;
  hoveredFeedbackIndex: number | null;
  activeFeedbackIndex: number | null;
  onActiveFeedbackChange: (index: number | null) => void;
  feedback?: FeedbackItem[];
  isDemoMode?: boolean;
}

function highlightChildren(
  children: React.ReactNode,
  searchStr: string,
  highlightClass: string,
  activeId?: string
): { highlighted: React.ReactNode; found: boolean } {
  if (!searchStr || typeof searchStr !== 'string' || !searchStr.trim()) {
    return { highlighted: children, found: false };
  }

  let idApplied = false;

  const traverse = (node: React.ReactNode): React.ReactNode => {
    if (typeof node === 'string') {
      const index = node.toLowerCase().indexOf(searchStr.toLowerCase());
      if (index !== -1) {
        const parts = [];
        let remaining = node;
        while (true) {
          const matchIdx = remaining.toLowerCase().indexOf(searchStr.toLowerCase());
          if (matchIdx === -1) {
            parts.push(remaining);
            break;
          }
          if (matchIdx > 0) {
            parts.push(remaining.substring(0, matchIdx));
          }
          const matchedText = remaining.substring(matchIdx, matchIdx + searchStr.length);
          
          const spanId = (activeId && !idApplied) ? activeId : undefined;
          if (spanId) idApplied = true;

          parts.push(
            <span
              key={parts.length}
              id={spanId}
              className={highlightClass}
            >
              {matchedText}
            </span>
          );
          remaining = remaining.substring(matchIdx + searchStr.length);
        }
        return parts.length === 1 ? parts[0] : parts;
      }
      return node;
    }

    if (React.isValidElement(node)) {
      const props = node.props as Record<string, unknown>;
      const nodeChildren = props?.children as React.ReactNode;
      if (nodeChildren !== undefined) {
        const nextChildren = traverse(nodeChildren);
        if (nextChildren !== nodeChildren) {
          return React.cloneElement(node as React.ReactElement<{ children?: React.ReactNode }>, { children: nextChildren });
        }
      }
      return node;
    }

    if (Array.isArray(node)) {
      let changed = false;
      const newArray = node.map(item => {
        const nextItem = traverse(item);
        if (nextItem !== item) changed = true;
        return nextItem;
      });
      return changed ? newArray : node;
    }

    return node;
  };

  const result = traverse(children);
  const found = idApplied || (result !== children);
  return { highlighted: result, found };
}

const sectionStyles = {
  unchanged: {
    border: '1px solid var(--border)',
    background: 'var(--surface-1)',
    color: 'var(--foreground)',
    opacity: 0.7,
  },
  added: {
    border: '1px solid rgba(74,222,128,0.2)',
    background: 'rgba(74,222,128,0.05)',
    color: 'var(--foreground)',
    borderLeft: '3px solid var(--success)',
  },
  removed: {
    border: '1px solid rgba(248,113,113,0.2)',
    background: 'rgba(248,113,113,0.05)',
    color: 'var(--foreground)',
    borderLeft: '3px solid var(--error)',
  },
};

type TabType = 'preview' | 'raw' | 'diff';

export default function FinalDraftPanel({
  originalDraft,
  polishedDraft,
  ready,
  exportBlocked = false,
  cmsConnected = false,
  analysisLogId,
  sourceRef,
  articleMetadata,
  exportStatus,
  generatedMetadata,
  isFocused,
  onFocusToggle,
  isStreaming,
  isRefining,
  processStage = 'reviewing',
  processStartedAt,
  isStale,
  onRefineAgain,
  onReanalyze,
  hoveredFeedbackIndex,
  activeFeedbackIndex,
  feedback = [],
  isDemoMode = false,
}: FinalDraftPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('preview');
  const [isExporting, setIsExporting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [showRefineBox, setShowRefineBox] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const isGeneratingDraft = Boolean(isStreaming || isRefining);
  const displayTab: TabType = isGeneratingDraft && !polishedDraft.trim() ? 'preview' : activeTab;

  // Auto-scroll when active feedback index changes
  useEffect(() => {
    if (activeFeedbackIndex !== null && activeFeedbackIndex !== undefined) {
      setTimeout(() => {
        const element = document.getElementById('active-feedback-highlight');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 80);
    }
  }, [activeFeedbackIndex]);

  // Markdown components with highlight capabilities
  const markdownComponents = useMemo(() => {
    const activeItem = feedback?.[activeFeedbackIndex ?? -1];
    const activeSearch = (activeItem?.replacementText || activeItem?.targetText || '').trim();

    const hoveredItem = feedback?.[hoveredFeedbackIndex ?? -1];
    const hoveredSearch = (hoveredItem?.replacementText || hoveredItem?.targetText || '').trim();

    const applyHighlights = (children: React.ReactNode): React.ReactNode => {
      let result = children;

      // 1. Apply active highlight
      if (activeSearch) {
        const { highlighted } = highlightChildren(
          result,
          activeSearch,
          'bg-[rgba(201,168,76,0.22)] border-b border-[var(--gold)] shadow-[0_0_8px_rgba(201,168,76,0.15)] rounded-sm px-0.5 transition-[background-color,border-color,box-shadow] duration-300',
          'active-feedback-highlight'
        );
        result = highlighted;
      }

      // 2. Apply hovered highlight (if different from active)
      if (hoveredSearch && hoveredSearch !== activeSearch) {
        const { highlighted } = highlightChildren(
          result,
          hoveredSearch,
          'bg-[rgba(201,168,76,0.1)] border-b border-[rgba(201,168,76,0.3)] rounded-sm px-0.5 transition-[background-color,border-color] duration-200'
        );
        result = highlighted;
      }

      return result;
    };

    return {
      p: ({ children }: { children?: React.ReactNode }) => (
        <p className="mb-5 leading-[1.85] text-[16.5px] text-foreground/90 font-serif" style={{ fontFamily: 'var(--font-serif)' }}>
          {applyHighlights(children)}
        </p>
      ),
      li: ({ children }: { children?: React.ReactNode }) => (
        <li className="mb-2 leading-[1.85] text-[16.5px] text-foreground/90 font-serif" style={{ fontFamily: 'var(--font-serif)' }}>
          {applyHighlights(children)}
        </li>
      ),
      h1: ({ children }: { children?: React.ReactNode }) => (
        <h1 className="text-3xl font-bold tracking-tight mt-10 mb-4 font-serif text-[var(--foreground)]" style={{ fontFamily: 'var(--font-serif)' }}>
          {applyHighlights(children)}
        </h1>
      ),
      h2: ({ children }: { children?: React.ReactNode }) => (
        <h2 className="text-2xl font-semibold tracking-tight mt-8 mb-3 font-serif text-[var(--foreground)]" style={{ fontFamily: 'var(--font-serif)' }}>
          {applyHighlights(children)}
        </h2>
      ),
      h3: ({ children }: { children?: React.ReactNode }) => (
        <h3 className="text-xl font-medium tracking-tight mt-6 mb-2 font-serif text-[var(--foreground)]" style={{ fontFamily: 'var(--font-serif)' }}>
          {applyHighlights(children)}
        </h3>
      ),
      ul: ({ children }: { children?: React.ReactNode }) => (
        <ul className="list-disc pl-6 mb-5 space-y-2 text-[16.5px] text-foreground/90 font-serif" style={{ fontFamily: 'var(--font-serif)' }}>
          {children}
        </ul>
      ),
      ol: ({ children }: { children?: React.ReactNode }) => (
        <ol className="list-decimal pl-6 mb-5 space-y-2 text-[16.5px] text-foreground/90 font-serif" style={{ fontFamily: 'var(--font-serif)' }}>
          {children}
        </ol>
      ),
      a: ({ href, children }: { href?: string, children?: React.ReactNode }) => (
        <a 
          href={href} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-blue-500 hover:text-blue-600 underline decoration-blue-500/30 hover:decoration-blue-500 transition-colors"
        >
          {applyHighlights(children)}
        </a>
      ),
    };
  }, [feedback, activeFeedbackIndex, hoveredFeedbackIndex]);

  // Simple Markdown to HTML parser for cleaner formatted exports (PDF / Word)
  const markdownToHtml = (md: string) => {
    return md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Headers
      .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
      .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
      .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Paragraphs
      .split(/\n{2,}/)
      .map(p => {
        const trimmed = p.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<ol')) {
          return trimmed;
        }
        return `<p>${trimmed.replace(/\n/g, '<br/>')}</p>`;
      })
      .filter(Boolean)
      .join('\n');
  };

  const handleDownloadPDF = () => {
    const title = generatedMetadata?.title || 'Refined Article';
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Failed to open print window. Please allow popups.');
      return;
    }
    const htmlContent = markdownToHtml(polishedDraft);
    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body {
              font-family: Georgia, serif;
              line-height: 1.7;
              color: #1a1a1a;
              padding: 1.2in;
              max-width: 8.5in;
              margin: 0 auto;
            }
            h1 {
              font-family: system-ui, -apple-system, sans-serif;
              font-size: 28px;
              font-weight: 700;
              margin-bottom: 8px;
              color: #111;
            }
            h2 {
              font-family: system-ui, -apple-system, sans-serif;
              font-size: 20px;
              font-weight: 600;
              margin-top: 24px;
              margin-bottom: 12px;
              color: #222;
            }
            h3 {
              font-family: system-ui, -apple-system, sans-serif;
              font-size: 16px;
              font-weight: 600;
              margin-top: 20px;
              margin-bottom: 8px;
              color: #333;
            }
            .meta {
              font-family: system-ui, -apple-system, sans-serif;
              font-size: 11px;
              color: #666;
              margin-bottom: 30px;
              border-bottom: 1px solid #e5e7eb;
              padding-bottom: 12px;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }
            .content {
              font-size: 15px;
            }
            p {
              margin-top: 0;
              margin-bottom: 16px;
            }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <div class="meta">
            ${generatedMetadata?.tags?.length ? `Tags: ${generatedMetadata.tags.join(', ')}  |  ` : ''}
            Generated via EAI Editorial Intelligence
          </div>
          <div class="content">
            ${htmlContent}
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    toast.success('Print window opened for PDF generation');
  };

  const handleDownloadWord = () => {
    const title = generatedMetadata?.title || 'Refined Article';
    const htmlContent = markdownToHtml(polishedDraft);
    const contentHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          body { font-family: Georgia, serif; line-height: 1.6; }
          h1 { font-family: Arial, sans-serif; font-size: 22pt; font-weight: bold; margin-bottom: 6pt; }
          h2 { font-family: Arial, sans-serif; font-size: 16pt; font-weight: bold; margin-top: 18pt; margin-bottom: 6pt; }
          h3 { font-family: Arial, sans-serif; font-size: 13pt; font-weight: bold; margin-top: 14pt; margin-bottom: 4pt; }
          p { font-size: 11pt; margin-bottom: 12pt; }
          .meta { font-family: Arial, sans-serif; font-size: 9pt; color: #555555; margin-bottom: 24pt; border-bottom: 1px solid #cccccc; padding-bottom: 6pt; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <div class="meta">
          ${generatedMetadata?.tags?.length ? `Tags: ${generatedMetadata.tags.join(', ')}  |  ` : ''}
          Generated via EAI Editorial Intelligence
        </div>
        <div class="content">
          ${htmlContent}
        </div>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + contentHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Word document downloaded');
  };

  const handleDownloadMarkdown = () => {
    const title = generatedMetadata?.title || 'Refined Article';
    const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
    const blob = new Blob([polishedDraft], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Markdown document downloaded');
  };

  const diff = useMemo(() => buildParagraphDiff(originalDraft, polishedDraft), [originalDraft, polishedDraft]);
  const changed = diff.summary.added > 0 || diff.summary.removed > 0;

  const handleCopy = async () => {
    if (!polishedDraft.trim()) return;
    try {
      await navigator.clipboard.writeText(polishedDraft);
      toast.success('Refined draft copied');
    } catch {
      toast.error('Failed to copy draft');
    }
  };

  const canExport =
    !isDemoMode &&
    cmsConnected &&
    ready &&
    !exportBlocked &&
    analysisLogId &&
    sourceRef &&
    generatedMetadata?.title &&
    generatedMetadata?.excerpt &&
    generatedMetadata?.metaTitle &&
    generatedMetadata?.metaDescription &&
    polishedDraft.trim();
  const canDownload =
    !isDemoMode &&
    Boolean(polishedDraft.trim());
  const exportUnavailableReason = isDemoMode
    ? 'Sign up to export to CMS'
    : !cmsConnected
      ? 'Connect and verify a CMS before exporting'
      : !ready
        ? 'Wait for the editorial process to finish'
        : exportBlocked
          ? 'Run Publish Ready and pass the quality gate before exporting'
          : !analysisLogId
            ? 'Export requires a saved analysis result'
            : !sourceRef
              ? 'Add a source reference before exporting'
              : !generatedMetadata?.title ||
                  !generatedMetadata?.excerpt ||
                  !generatedMetadata?.metaTitle ||
                  !generatedMetadata?.metaDescription
                ? 'Complete the Publish Ready SEO metadata before exporting'
                : !polishedDraft.trim()
                  ? 'A refined draft is required before exporting'
                  : null;

  const handleExport = async () => {
    if (!canExport) return;
    setIsExporting(true);
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisLogId,
          sourceRef,
          title: generatedMetadata!.title,
          slug: generatedMetadata!.slug,
          excerpt: generatedMetadata!.excerpt,
          content: polishedDraft,
          metaTitle: generatedMetadata!.metaTitle,
          metaDescription: generatedMetadata!.metaDescription,
          category: articleMetadata?.category,
          tags: generatedMetadata!.tags,
          coverImageAltText: generatedMetadata!.coverImageAltText,
          coverImagePrompt: generatedMetadata!.coverImageAltText,
        }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        toast.success(`Draft sent: ${generatedMetadata?.title || 'Article'}`, {
          description: `Status: Draft saved. Ref: ${result.postId || sourceRef}`,
          action: result.editUrl ? {
            label: 'Open Blog Admin',
            onClick: () => window.open(result.editUrl, '_blank'),
          } : undefined,
          duration: 8000,
        });
      } else {
        if (result.error?.includes('category_not_found')) {
          toast.error('Category not found in blog', { description: 'The AI-generated category does not match your blog taxonomy.', duration: 5000 });
        } else {
          toast.error('Export failed', { description: result.error || 'An error occurred during export.' });
        }
      }
    } catch {
      toast.error('Network Error', { description: 'Could not connect to server for export.' });
    } finally {
      setIsExporting(false);
    }
  };

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'preview', label: 'Preview',   icon: <Eye className="w-3.5 h-3.5" /> },
    { key: 'raw',     label: 'Markdown',  icon: <Code className="w-3.5 h-3.5" /> },
    { key: 'diff',    label: 'Changes',   icon: <SplitSquareHorizontal className="w-3.5 h-3.5" /> },
  ];

  const loadingPanel = (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--card)]">
      <EditorialProgress
        stage={processStage}
        startedAt={processStartedAt}
        refining={isRefining}
      />
      <div className="flex-1 overflow-hidden px-8 py-8 md:px-12">
        <div className="mx-auto max-w-2xl space-y-7">
          <div className="space-y-3">
            <div className="h-3 w-24 rounded-full bg-primary-500/10" />
            <div className="h-7 w-4/5 rounded-lg animate-shimmer" />
            <div className="h-4 w-2/3 rounded-md animate-shimmer" />
          </div>
          {[1, 2, 3].map((section) => (
            <div key={section} className="space-y-3 opacity-80">
              <div className="h-5 rounded-md animate-shimmer" style={{ width: `${42 + section * 9}%` }} />
              <div className="h-3 w-full rounded animate-shimmer" />
              <div className="h-3 w-[94%] rounded animate-shimmer" />
              <div className="h-3 w-[78%] rounded animate-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="ui-panel h-full">
      {/* ── Header ── */}
      <div className="ui-panel-header px-4 py-3 md:px-5">
        {/* Title row */}
        <div className="final-draft-header-row flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="final-draft-title min-w-0 w-full">
            <p className="mb-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">
              Refined Draft
            </p>
            <h2 className="line-clamp-2 break-normal text-[14px] font-semibold text-[var(--foreground)]">
              {generatedMetadata?.title || (isGeneratingDraft ? 'Preparing refined draft' : 'Refined Article')}
            </h2>
          </div>

          {/* Actions */}
          {polishedDraft.trim() && (
            <div className="final-draft-actions flex flex-wrap sm:flex-nowrap items-center gap-1 shrink-0 w-full sm:w-auto">
            {/* Copy Button */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    onClick={handleCopy}
                    disabled={!polishedDraft.trim() || isDemoMode}
                    className="ui-btn ui-btn-muted ui-btn-sm"
                    aria-label="Copy refined draft"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Copy</span>
                  </button>
                }
              />
              <TooltipContent side="bottom" className="text-xs">
                {isDemoMode ? 'Sign up to copy the refined draft' : 'Copy refined draft'}
              </TooltipContent>
            </Tooltip>

            {/* Export Button */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    onClick={handleExport}
                    disabled={!canExport || isExporting}
                    className={`ui-btn ui-btn-sm ${canExport && !isExporting ? 'ui-btn-primary' : 'ui-btn-surface'}`}
                    aria-label={exportStatus?.blogEditUrl ? 'Update CMS Draft' : 'Export to CMS'}
                  >
                    {isExporting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">
                      {exportStatus?.blogEditUrl ? 'Update' : 'Export to CMS'}
                    </span>
                  </button>
                }
              />
              <TooltipContent side="bottom" className="text-xs">
                {exportUnavailableReason ||
                  (exportStatus?.blogEditUrl ? 'Update CMS Draft' : 'Export to CMS')}
              </TooltipContent>
            </Tooltip>

            {/* Re-analyze Button */}
            {onReanalyze && (
              <Tooltip>
                <TooltipTrigger
                  onClick={onReanalyze}
                  disabled={!ready || isStreaming || isRefining}
                  className="ui-btn ui-btn-muted ui-btn-sm"
                  aria-label="Re-analyze Draft"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Re-analyze</span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Analyze this refined draft again
                </TooltipContent>
              </Tooltip>
            )}

            {/* Toggle Stats Button */}
            {ready && (
              <Tooltip>
                <TooltipTrigger
                  onClick={() => setShowStats(p => !p)}
                  className={`ui-btn ui-btn-icon relative z-10 ${showStats ? 'ui-btn-surface text-[var(--primary)]' : 'ui-btn-muted'}`}
                  aria-label={showStats ? 'Hide change summary' : 'Show change summary'}
                >
                  <FileDiff className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {showStats ? 'Hide Stats' : 'Show Stats'}
                </TooltipContent>
              </Tooltip>
            )}

            {/* 3-dots options menu */}
            <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
              <Popover.Trigger
                disabled={!canDownload}
                title={
                  isDemoMode
                    ? 'Sign up to download'
                    : canDownload
                      ? 'Download refined draft'
                      : 'A refined draft is required before downloading'
                }
                render={
                  <button
                    className="ui-btn ui-btn-muted ui-btn-icon"
                    aria-label="More Options"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                }
              />

              <Popover.Portal>
                <Popover.Positioner
                  side="bottom"
                  align="end"
                  sideOffset={6}
                  positionMethod="fixed"
                  className="isolate z-50"
                >
                  <Popover.Popup
                    className="ui-menu w-55 p-1"
                    initialFocus={false}
                  >
                    <div className="ui-menu-label">
                      Export / Download
                    </div>
                    <button
                      onClick={() => {
                        handleDownloadPDF();
                        setMenuOpen(false);
                      }}
                      className="ui-menu-item"
                    >
                      <Download className="h-3.5 w-3.5 text-[var(--primary)]" />
                      Download PDF (.pdf)
                    </button>
                    <button
                      onClick={() => {
                        handleDownloadWord();
                        setMenuOpen(false);
                      }}
                      className="ui-menu-item"
                    >
                      <FileText className="h-3.5 w-3.5 text-blue-400" />
                      Download Word (.doc)
                    </button>
                    <button
                      onClick={() => {
                        handleDownloadMarkdown();
                        setMenuOpen(false);
                      }}
                      className="ui-menu-item"
                    >
                      <FileText className="h-3.5 w-3.5 text-amber-500" />
                      Download Markdown (.md)
                    </button>
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>

            {onFocusToggle && (
              <button
                onClick={onFocusToggle}
                className="ui-btn ui-btn-muted ui-btn-icon"
                title={isFocused ? 'Restore Split View' : 'Focus Panel'}
                aria-label={isFocused ? 'Restore split view' : 'Focus refined draft'}
              >
                {isFocused ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            )}
            </div>
          )}
        </div>

        {/* Export Warning */}
        {exportStatus?.blogEditUrl && (
          <div className="ui-alert ui-alert-warning mb-3 px-3 py-2 text-xs">
            <strong>Note:</strong> This draft was already exported. Re-exporting will update the existing blog draft.
          </div>
        )}

        {/* Diff Stats (Compact inline row to save vertical space) */}
        {ready && showStats && (
          <div className="final-draft-stats flex flex-wrap items-center gap-4 pt-3 mt-3 border-t border-[var(--border-subtle)]">
            {[
              { icon: <PlusCircle className="h-3.5 w-3.5" />, label: 'Added',   value: diff.summary.added,     color: 'var(--success)' },
              { icon: <MinusCircle className="h-3.5 w-3.5" />, label: 'Removed', value: diff.summary.removed,   color: 'var(--error)' },
              { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'Stable', value: diff.summary.unchanged, color: 'var(--muted-foreground)' },
            ].map(({ icon, label, value, color }) => (
              <div
                key={label}
                className="flex items-center gap-1.5"
                style={{ color }}
              >
                {icon}
                <span className="text-[12px] font-bold font-mono tabular-nums bg-[var(--foreground)]/5 dark:bg-[var(--foreground)]/10 px-1.5 py-0.5 rounded-sm">
                  {value}
                </span>
                <span className="text-[11px] font-medium opacity-80">{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Refine Again — collapsible instruction box */}
        {ready && !isStreaming && onRefineAgain && (
          <div className="mt-2 pt-2">
            <Tooltip>
              <TooltipTrigger
                onClick={() => setShowRefineBox(p => !p)}
                className="ui-btn ui-btn-muted ui-btn-xs -ml-2 w-max"
                style={{ color: showRefineBox ? 'var(--primary)' : 'var(--muted-foreground)' }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Revise Draft
                {showRefineBox
                  ? <ChevronUp className="h-3.5 w-3.5 ml-1" />
                  : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Add a specific instruction for the next revision.
              </TooltipContent>
            </Tooltip>

            {showRefineBox && (
              <div className="mt-2 space-y-2">
                <textarea
                  name="revision-instructions"
                  autoComplete="off"
                  aria-label="Revision instructions"
                  value={refineInstruction}
                  onChange={e => setRefineInstruction(e.target.value)}
                  placeholder="Example: Shorten the introduction, strengthen the opening, and add a business perspective…"
                  disabled={isRefining}
                  rows={3}
                  className="ui-control ui-textarea"
                />
                <button
                  onClick={() => {
                    if (!refineInstruction.trim() || isRefining) return;
                    onRefineAgain(refineInstruction.trim());
                    setRefineInstruction('');
                    setShowRefineBox(false);
                  }}
                  disabled={!refineInstruction.trim() || isRefining}
                  className={`ui-btn ui-btn-sm w-full ${refineInstruction.trim() && !isRefining ? 'ui-btn-primary' : 'ui-btn-surface'}`}
                >
                  {isRefining
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> Refining…</>
                    : <><Sparkles className="h-3 w-3" /> Apply Instruction</>}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Stale Warning Banner */}
        {isStale && ready && (
          <div className="ui-alert ui-alert-warning mt-3 text-[11.5px] leading-relaxed">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-0.5">Draft has been refined</p>
              <p className="opacity-90">
                The previous editorial feedback has been cleared. Click &quot;Re-analyze&quot; to evaluate this new version.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Content ── */}
      {!ready ? (
        isGeneratingDraft ? loadingPanel : (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div>
              <FileDiff className="mx-auto mb-4 h-9 w-9 opacity-20 ui-muted" />
              <p className="text-sm ui-muted">
                Your refined draft and change preview will appear here.
              </p>
            </div>
          </div>
        )
      ) : (
        <div className="flex flex-col min-h-0 flex-1">
          {isGeneratingDraft && (
            <EditorialProgress
              stage={processStage}
              startedAt={processStartedAt}
              refining={isRefining}
            />
          )}
          <div className="document-tabs flex shrink-0 border-t border-[var(--border)] bg-transparent">
            {tabs.map(tab => {
              const active = displayTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`document-tab flex items-center justify-center gap-1.5 ${
                    active
                      ? 'is-active'
                      : ''
                  }`}
                  aria-pressed={active}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6 md:px-12 md:py-8 bg-[var(--card)]">
            {/* Preview Tab */}
            {displayTab === 'preview' && (
              <article className="max-w-2xl mx-auto font-serif py-4 md:py-6">
                {polishedDraft ? (
                  <div className="text-[16.5px] leading-[1.85] text-foreground/90 select-text selection:bg-[var(--gold)]/30">
                    <ReactMarkdown
                      key={`md-${activeFeedbackIndex ?? 'n'}-${hoveredFeedbackIndex ?? 'n'}`}
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {polishedDraft}
                    </ReactMarkdown>
                    {isStreaming && (
                      <span
                        className="inline-block w-[2px] h-[1em] ml-0.5 animate-cursor-blink align-middle"
                        style={{ background: 'var(--primary)', borderRadius: '1px' }}
                        aria-hidden
                      />
                    )}
                  </div>
                ) : isGeneratingDraft ? (
                  loadingPanel
                ) : (
                  <p className="text-sm italic ui-muted">
                    No refined draft yet.
                  </p>
                )}
              </article>
            )}

            {/* Raw Tab */}
            {displayTab === 'raw' && (
              <div className="max-w-3xl mx-auto w-full">
                {polishedDraft ? (
                  <div className="ui-card p-6">
                    <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed font-mono text-[var(--foreground)] opacity-90">
                      {polishedDraft}
                      {isStreaming && (
                        <span
                          className="inline-block w-1.5 h-[1em] ml-0.5 align-middle animate-cursor-blink"
                          style={{ background: 'var(--primary)', borderRadius: '1px' }}
                        />
                      )}
                    </pre>
                  </div>
                ) : isGeneratingDraft ? (
                  loadingPanel
                ) : (
                  <div className="ui-card p-6">
                    <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed font-mono text-[var(--foreground)] opacity-90">
                      No refined draft yet.
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Diff Tab */}
            {displayTab === 'diff' && (
              <div className="max-w-3xl mx-auto w-full space-y-4">
                {!changed ? (
                  <div className="ui-card p-10 text-center text-sm text-[var(--muted-foreground)]">
                    No changes from the source draft.
                  </div>
                ) : (
                  diff.segments
                    .filter(segment => segment.type !== 'unchanged')
                    .map((segment, index) => (
                      <div
                        key={`${segment.type}-${index}`}
                        className="rounded-md p-4 text-sm leading-relaxed"
                        style={sectionStyles[segment.type]}
                      >
                        <span
                          className="mb-2 block text-[12px] font-bold uppercase tracking-[0.15em]"
                          style={{
                            color: segment.type === 'added' ? 'var(--success)' : 'var(--error)',
                          }}
                        >
                          {segment.type === 'added' ? '+ Added Paragraph' : '− Removed Paragraph'}
                        </span>
                        <p className="whitespace-pre-wrap break-words font-serif">{segment.text}</p>
                      </div>
                    ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
