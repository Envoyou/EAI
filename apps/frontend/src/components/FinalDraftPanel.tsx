'use client';

import { EAILoaderStatusIcon } from '@/components/ui/icons/status';
import { fetchWithTimeout } from '@/lib/fetch-utils';

import React, { useState, useMemo, useEffect } from 'react';
import {
  FileDiff, CheckCircle2, PlusCircle, MinusCircle,
  Eye, Code, SplitSquareHorizontal, Send, Maximize2, Minimize2,
  FileText, Download, ChevronDown, ChevronUp, AlertTriangle, RefreshCw,
  Pencil, ShieldCheck, Wand2, Save
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { buildParagraphDiff } from '@eai/shared';
import { ArticleMetadata, EditorialProcessStage, FeedbackItem, PublicationPackage, PublicationPackageStatus, RevisionValidationState, SeoFieldStates, SeoReviewState } from '@eai/shared';
import { getProtectedSeoReviewFields } from '@/workspace/seo-field-state';
import { derivePublicationUxState } from '@/workspace/publication-ux-state';
import EditorialProgress from '@/components/EditorialProgress';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ActionButton } from '@/components/ui/action-button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  CopyActionIcon,
  EditActionIcon,
  MoreActionsIcon,
  PreparePublicationIcon,
  PublishActionIcon,
} from '@/components/ui/icons/actions';
import { useTranslations } from 'next-intl';
import { InlineFinalDraftEditor } from '@/components/final-draft/InlineFinalDraftEditor';

interface FinalDraftPanelProps {
  originalDraft: string;
  polishedDraft: string;
  ready: boolean;
  qualityReady?: boolean;
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
  workingTitle?: string;
  publicationPackageStatus?: PublicationPackageStatus;
  qualityGateState?: RevisionValidationState;
  seoReviewState?: SeoReviewState;
  seoFieldStates?: SeoFieldStates;
  isFocused?: boolean;
  onFocusToggle?: () => void;
  isStreaming?: boolean;
  isRefining?: boolean;
  processStage?: EditorialProcessStage;
  processStartedAt?: number | null;
  includeSeoStage?: boolean;
  onRefineAgain?: (instruction: string) => void;
  onReanalyze?: () => void;
  onSaveFinalDraft?: (draft: string) => Promise<boolean>;
  onQualityCheck?: () => Promise<unknown>;
  onRegenerateSeo?: () => Promise<void>;
  onSavePublicationMetadata?: (metadata: PublicationPackage) => Promise<boolean>;
  onConfirmPublicationMetadata?: () => Promise<void>;
  onPrepareForExport?: () => Promise<void>;
  isSavingFinalDraft?: boolean;
  isCheckingQuality?: boolean;
  isGeneratingSeo?: boolean;
  isAiBusy?: boolean;
  hoveredFeedbackIndex: number | null;
  activeFeedbackIndex: number | null;
  onActiveFeedbackChange: (index: number | null) => void;
  feedback?: FeedbackItem[];
  isDemoMode?: boolean;
  reviewMode?: boolean;
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

const toSeoEditValue = (metadata?: PublicationPackage) => ({
  title: metadata?.title || '',
  slug: metadata?.slug || '',
  excerpt: metadata?.excerpt || '',
  metaTitle: metadata?.metaTitle || '',
  metaDescription: metadata?.metaDescription || '',
  coverImageAltText: metadata?.coverImageAltText || '',
  tags: metadata?.tags?.join(', ') || '',
});

export default function FinalDraftPanel({
  originalDraft,
  polishedDraft,
  ready,
  qualityReady = false,
  exportBlocked = false,
  cmsConnected = false,
  analysisLogId,
  sourceRef,
  articleMetadata,
  exportStatus,
  generatedMetadata,
  workingTitle,
  publicationPackageStatus,
  qualityGateState,
  seoReviewState,
  seoFieldStates,
  isFocused,
  onFocusToggle,
  isStreaming,
  isRefining,
  processStage = 'reviewing',
  processStartedAt,
  includeSeoStage = true,
  onRefineAgain,
  onReanalyze,
  onSaveFinalDraft,
  onQualityCheck,
  onRegenerateSeo,
  onSavePublicationMetadata,
  onConfirmPublicationMetadata,
  onPrepareForExport,
  isSavingFinalDraft = false,
  isCheckingQuality = false,
  isGeneratingSeo = false,
  isAiBusy = false,
  hoveredFeedbackIndex,
  activeFeedbackIndex,
  feedback = [],
  isDemoMode = false,
  reviewMode = false,
}: FinalDraftPanelProps) {
  const t = useTranslations('FinalDraftPanel');
  const [activeTab, setActiveTab] = useState<TabType>('preview');
  const [isExporting, setIsExporting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [showRefineBox, setShowRefineBox] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const [editingDraft, setEditingDraft] = useState(false);
  const [draftEditValue, setDraftEditValue] = useState(polishedDraft);
  const [editingSeo, setEditingSeo] = useState(false);
  const [isConfirmingMetadata, setIsConfirmingMetadata] = useState(false);
  const [seoEditValue, setSeoEditValue] = useState(() =>
    toSeoEditValue(generatedMetadata)
  );
  const isGeneratingDraft = Boolean(isStreaming || isRefining);
  const isBackgroundValidation = Boolean(
    isCheckingQuality && !isAiBusy && !isGeneratingDraft
  );
  const protectedSeoFields = getProtectedSeoReviewFields(seoFieldStates);
  const publicationUxState = derivePublicationUxState({
    isChecking: isBackgroundValidation,
    qualityGateState,
    seoReviewState,
    publicationPackageStatus,
    seoFieldStates,
  });
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
        <p className="mb-5 leading-[1.85] text-[16px] text-foreground/90 font-sans" style={{ fontFamily: 'var(--font-sans)' }}>
          {applyHighlights(children)}
        </p>
      ),
      li: ({ children }: { children?: React.ReactNode }) => (
        <li className="mb-2 leading-[1.85] text-[16px] text-foreground/90 font-sans" style={{ fontFamily: 'var(--font-sans)' }}>
          {applyHighlights(children)}
        </li>
      ),
      h1: ({ children }: { children?: React.ReactNode }) => (
        <h1 className="text-3xl font-bold tracking-tight mt-10 mb-4 font-sans text-[var(--foreground)]" style={{ fontFamily: 'var(--font-sans)' }}>
          {applyHighlights(children)}
        </h1>
      ),
      h2: ({ children }: { children?: React.ReactNode }) => (
        <h2 className="text-2xl font-semibold tracking-tight mt-8 mb-3 font-sans text-[var(--foreground)]" style={{ fontFamily: 'var(--font-sans)' }}>
          {applyHighlights(children)}
        </h2>
      ),
      h3: ({ children }: { children?: React.ReactNode }) => (
        <h3 className="text-xl font-medium tracking-tight mt-6 mb-2 font-sans text-[var(--foreground)]" style={{ fontFamily: 'var(--font-sans)' }}>
          {applyHighlights(children)}
        </h3>
      ),
      ul: ({ children }: { children?: React.ReactNode }) => (
        <ul className="list-disc pl-6 mb-5 space-y-2 text-[16px] text-foreground/90 font-sans" style={{ fontFamily: 'var(--font-sans)' }}>
          {children}
        </ul>
      ),
      ol: ({ children }: { children?: React.ReactNode }) => (
        <ol className="list-decimal pl-6 mb-5 space-y-2 text-[16px] text-foreground/90 font-sans" style={{ fontFamily: 'var(--font-sans)' }}>
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
      table: ({ children }: { children?: React.ReactNode }) => (
        <div className="overflow-x-auto my-5">
          <table className="w-full border-collapse border border-[var(--border)] rounded-lg overflow-hidden text-[15px] font-sans">
            {children}
          </table>
        </div>
      ),
      thead: ({ children }: { children?: React.ReactNode }) => (
        <thead className="bg-[var(--surface-2)]">
          {children}
        </thead>
      ),
      th: ({ children }: { children?: React.ReactNode }) => (
        <th className="bg-[var(--surface-2)] text-[var(--foreground)] font-semibold px-4 py-2.5 border border-[var(--border)] text-left font-sans">
          {applyHighlights(children)}
        </th>
      ),
      td: ({ children }: { children?: React.ReactNode }) => (
        <td className="px-4 py-2 border border-[var(--border)] text-[var(--foreground)] font-sans">
          {applyHighlights(children)}
        </td>
      ),
      tr: ({ children }: { children?: React.ReactNode }) => (
        <tr className="hover:bg-[var(--surface-2)]/50 odd:bg-transparent even:bg-[var(--surface-1)]">
          {children}
        </tr>
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
    const title = generatedMetadata?.title || workingTitle || 'Refined Article';
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
    const title = generatedMetadata?.title || workingTitle || 'Refined Article';
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
    const title = generatedMetadata?.title || workingTitle || 'Refined Article';
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

  const startDraftEditing = () => {
    setDraftEditValue(polishedDraft);
    setActiveTab('preview');
    setEditingDraft(true);
  };

  const cancelDraftEditing = () => {
    setDraftEditValue(polishedDraft);
    setEditingDraft(false);
  };

  const saveDraftRevision = async () => {
    if (!onSaveFinalDraft || !draftEditValue.trim() || draftEditValue === polishedDraft) return;
    if (await onSaveFinalDraft(draftEditValue)) setEditingDraft(false);
  };

  const hasUnsavedDraftEdits = editingDraft && draftEditValue !== polishedDraft;

  const canExport =
    !isDemoMode &&
    cmsConnected &&
    ready &&
    !exportBlocked &&
    analysisLogId &&
    sourceRef &&
    publicationPackageStatus === 'current' &&
    generatedMetadata?.title &&
    generatedMetadata?.excerpt &&
    generatedMetadata?.metaTitle &&
    generatedMetadata?.metaDescription &&
    polishedDraft.trim();
  const canDownload =
    !isDemoMode &&
    Boolean(polishedDraft.trim());
  const exportUnavailableReason = isDemoMode
    ? t('exportRequiresAccount')
    : !cmsConnected
      ? t('connectCmsBeforeExport')
      : !ready
        ? t('waitForEditorialProcess')
        : exportBlocked
          ? t('completeEditorialDecisionsBeforeExport')
          : !analysisLogId
            ? t('saveDraftBeforeExport')
            : !sourceRef
              ? t('addSourceBeforeExport')
            : publicationPackageStatus !== 'current'
              ? t('refreshPublicationMetadata')
            : !generatedMetadata?.title ||
                  !generatedMetadata?.excerpt ||
                  !generatedMetadata?.metaTitle ||
                  !generatedMetadata?.metaDescription
                ? t('completePublicationDetailsBeforeExport')
                : !polishedDraft.trim()
                  ? t('finalDraftRequiredBeforeExport')
                  : null;

  const handleExport = async () => {
    if (!canExport) return;
    setIsExporting(true);
    try {
      const response = await fetchWithTimeout('/api/export', {
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
        const errorMsg = result.error || '';
        if (errorMsg.includes('category_not_found')) {
          toast.error('Category not found in blog', {
            description: 'The AI-generated category does not match your blog taxonomy.',
            duration: 5000,
          });
        } else if (response.status === 409 || errorMsg.toLowerCase().includes('already exists') || errorMsg.toLowerCase().includes('duplicate')) {
          toast.error('Duplicate URL Slug', {
            description: 'An article with the same URL slug already exists on your blog. Please update the slug in the metadata panel below and try again.',
            duration: 8000,
          });
        } else if (response.status === 401 || errorMsg.toLowerCase().includes('unauthorized') || errorMsg.toLowerCase().includes('credentials')) {
          toast.error('Authentication Failed', {
            description: 'Could not authenticate with your blog. Please check your blog integration API keys or credentials.',
            duration: 8000,
          });
        } else if (response.status === 502 || response.status === 504 || errorMsg.toLowerCase().includes('timeout') || errorMsg.toLowerCase().includes('bad gateway')) {
          toast.error('Blog Server Offline', {
            description: 'The blog server responded with a gateway error. Please verify that your blog backend service is online and accessible.',
            duration: 8000,
          });
        } else {
          toast.error('Export Failed', {
            description: result.error || 'An unexpected error occurred during export.',
          });
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
        includeSeoStage={includeSeoStage}
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
      <div className="ui-panel-header [container-type:inline-size] px-4 py-3 md:px-5">
        {/* Title row */}
        <div className="final-draft-header-row flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="final-draft-title min-w-0 w-full">
            <p className="mb-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">
              {reviewMode ? t('candidateDraft') : t('finalDraft')}
            </p>
            <h2 className="line-clamp-2 break-normal text-[14px] font-semibold text-[var(--foreground)]">
              {generatedMetadata?.title || workingTitle || (isGeneratingDraft ? 'Preparing refined draft' : 'Refined Article')}
            </h2>
          </div>

          {/* Actions */}
          {polishedDraft.trim() && (
            <div className="final-draft-actions flex flex-wrap sm:flex-nowrap items-center gap-1 shrink-0 w-full sm:w-auto">
            {/* Quick actions */}
            {!reviewMode && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <ActionButton
                    type="button"
                    onClick={handleCopy}
                    disabled={editingDraft || !polishedDraft.trim() || isDemoMode || isAiBusy}
                    variant="muted"
                    size="sm"
                    aria-label="Copy refined draft"
                    icon={CopyActionIcon}
                    iconClassName="h-3.5 w-3.5"
                    label="Copy refined draft"
                    labelClassName="sr-only"
                  />
                }
              />
              <TooltipContent side="bottom" className="text-xs">
                {isDemoMode ? 'Sign up to copy the refined draft' : 'Copy refined draft'}
              </TooltipContent>
            </Tooltip>
            )}

            {onSaveFinalDraft && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <ActionButton
                      type="button"
                      variant={editingDraft ? 'surface' : 'muted'}
                      size="sm"
                      onClick={startDraftEditing}
                      disabled={editingDraft || isGeneratingDraft || isAiBusy}
                      aria-pressed={editingDraft}
                      aria-label="Edit final draft"
                      icon={EditActionIcon}
                      iconClassName="h-3.5 w-3.5"
                      label={t('editDraft')}
                      labelClassName="hidden @[460px]:inline"
                    />
                  }
                />
                <TooltipContent side="bottom" className="text-xs">
                  {editingDraft ? t('editingInline') : t('editDraftInlineHint')}
                </TooltipContent>
              </Tooltip>
            )}

            {!canExport && onPrepareForExport ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <ActionButton
                      type="button"
                      variant={canExport ? 'surface' : 'primary'}
                      size="sm"
                      onClick={onPrepareForExport}
                      disabled={editingDraft || isGeneratingDraft || isSavingFinalDraft || isAiBusy}
                      aria-label="Prepare current draft for export"
                      icon={PreparePublicationIcon}
                      iconClassName="h-3.5 w-3.5 md:hidden"
                      label={t('prepare')}
                      labelClassName="hidden md:inline"
                    />
                  }
                />
                <TooltipContent side="bottom" className="text-xs">
                  Run only the checks needed for this draft revision, then refresh SEO
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <ActionButton
                      type="button"
                      onClick={handleExport}
                      disabled={editingDraft || !canExport || isExporting || isAiBusy}
                      variant={canExport && !isExporting ? 'primary' : 'surface'}
                      size="sm"
                      aria-label={exportStatus?.blogEditUrl ? 'Update CMS Draft' : 'Export to CMS'}
                      icon={PublishActionIcon}
                      iconClassName="h-3.5 w-3.5"
                      label={exportStatus?.blogEditUrl ? t('update') : t('exportToCms')}
                      labelClassName="hidden @[420px]:inline"
                      loading={isExporting}
                    />
                  }
                />
                <TooltipContent side="bottom" className="text-xs">
                  {exportUnavailableReason ||
                    (exportStatus?.blogEditUrl ? 'Update CMS Draft' : 'Export to CMS')}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Secondary actions */}
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger
                render={
                  <ActionButton
                    type="button"
                    variant="muted"
                    size="icon"
                    aria-label={t('moreActions')}
                    icon={MoreActionsIcon}
                    iconClassName="h-4 w-4"
                    label={t('moreActions')}
                    labelClassName="sr-only"
                    disabled={editingDraft || isAiBusy}
                  />
                }
              />

              <PopoverContent
                side="bottom"
                align="end"
                sideOffset={6}
                positionMethod="fixed"
                variant="menu"
                mobileSheet
                className="ui-menu final-draft-action-menu p-1"
                initialFocus={false}
                aria-label={t('moreActions')}
              >
                    {(onReanalyze || onQualityCheck || onRegenerateSeo || (canExport && onPrepareForExport)) && (
                      <>
                        <div className="ui-menu-label">{t('workflowActions')}</div>
                        {canExport && onPrepareForExport && (
                          <ActionButton
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              void onPrepareForExport();
                            }}
                            disabled={isGeneratingDraft || isSavingFinalDraft || isAiBusy}
                            variant="muted"
                            className="ui-menu-item justify-start w-full font-normal border-none"
                            icon={PreparePublicationIcon}
                            iconClassName="h-3.5 w-3.5 shrink-0"
                            label={t('prepareAgain')}
                          />
                        )}
                        {onQualityCheck && qualityGateState === 'stale' && !isBackgroundValidation && (
                          <Button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              void onQualityCheck();
                            }}
                            disabled={isGeneratingDraft || isSavingFinalDraft || isAiBusy}
                            variant="muted"
                            className="ui-menu-item justify-start w-full font-normal border-none"
                            aria-label={t('qualityCheck')}
                          >
                            {isCheckingQuality
                              ? <EAILoaderStatusIcon className="h-3.5 w-3.5" />
                              : <ShieldCheck className="h-3.5 w-3.5" />}
                            <span>{t('qualityCheck')}</span>
                          </Button>
                        )}
                        {onRegenerateSeo && publicationPackageStatus === 'stale' && !isBackgroundValidation && (
                          <Button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              void onRegenerateSeo();
                            }}
                            disabled={!qualityReady || isGeneratingDraft || isAiBusy}
                            variant="muted"
                            className="ui-menu-item justify-start w-full font-normal border-none"
                            aria-label={t('regenerateSeo')}
                          >
                            {isGeneratingSeo
                              ? <EAILoaderStatusIcon className="h-3.5 w-3.5" />
                              : <Wand2 className="h-3.5 w-3.5" />}
                            <span>{t('regenerateSeo')}</span>
                          </Button>
                        )}
                        {onReanalyze && (
                          <Button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              onReanalyze();
                            }}
                            disabled={!ready || isAiBusy}
                            variant="muted"
                            className="ui-menu-item justify-start w-full font-normal border-none"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            <span>{t('fullAnalyze')}</span>
                          </Button>
                        )}
                        <div className="ui-menu-divider" />
                      </>
                    )}

                    {(ready || onFocusToggle) && (
                      <>
                        <div className="ui-menu-label">{t('viewActions')}</div>
                        {ready && (
                          <Button
                            type="button"
                            onClick={() => {
                              setShowStats((current) => !current);
                              setMenuOpen(false);
                            }}
                            variant="muted"
                            className="ui-menu-item justify-start w-full font-normal border-none"
                            aria-pressed={showStats}
                          >
                            <FileDiff className="h-3.5 w-3.5" />
                            <span>{showStats ? t('hideChangeSummary') : t('showChangeSummary')}</span>
                          </Button>
                        )}
                        {onFocusToggle && (
                          <Button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              onFocusToggle();
                            }}
                            variant="muted"
                            className="ui-menu-item justify-start w-full font-normal border-none"
                          >
                            {isFocused
                              ? <Minimize2 className="h-3.5 w-3.5" />
                              : <Maximize2 className="h-3.5 w-3.5" />}
                            <span>{isFocused ? t('restoreSplitView') : t('focusPanel')}</span>
                          </Button>
                        )}
                        <div className="ui-menu-divider" />
                      </>
                    )}

                    {!canExport && (
                      <>
                        <div className="ui-menu-label">{t('publishActions')}</div>
                        <Button
                          type="button"
                          onClick={handleExport}
                          disabled
                          title={exportUnavailableReason || undefined}
                          variant="muted"
                          className="ui-menu-item justify-start w-full font-normal border-none"
                        >
                          <Send className="h-3.5 w-3.5" />
                          <span>{exportStatus?.blogEditUrl ? t('updateCmsDraft') : t('exportToCms')}</span>
                        </Button>
                        <div className="ui-menu-divider" />
                      </>
                    )}

                    <div className="ui-menu-label">{t('downloadActions')}</div>
                    <Button
                      type="button"
                      onClick={() => {
                        handleDownloadPDF();
                        setMenuOpen(false);
                      }}
                      disabled={!canDownload}
                      variant="muted"
                      className="ui-menu-item justify-start w-full font-normal border-none"
                    >
                      <Download className="h-3.5 w-3.5 shrink-0" />
                      <span>{t('downloadPdf')}</span>
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        handleDownloadWord();
                        setMenuOpen(false);
                      }}
                      disabled={!canDownload}
                      variant="muted"
                      className="ui-menu-item justify-start w-full font-normal border-none"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span>{t('downloadWord')}</span>
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        handleDownloadMarkdown();
                        setMenuOpen(false);
                      }}
                      disabled={!canDownload}
                      variant="muted"
                      className="ui-menu-item justify-start w-full font-normal border-none"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span>{t('downloadMarkdown')}</span>
                    </Button>
              </PopoverContent>
            </Popover>
            </div>
          )}
        </div>

        {generatedMetadata && qualityReady && onSavePublicationMetadata && (
          <div className="ui-card mt-3 mb-3 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold ui-text">Publication Metadata</p>
                <p className="text-[11px] ui-muted">
                  Edit SEO fields without running Analyze again.
                </p>
              </div>
              <Button
                type="button"
                variant="muted"
                size="xs"
                onClick={() => {
                  if (!editingSeo) setSeoEditValue(toSeoEditValue(generatedMetadata));
                  setEditingSeo((current) => !current);
                }}
                aria-expanded={editingSeo}
              >
                <Pencil className="h-3.5 w-3.5" />
                {editingSeo ? 'Close' : 'Edit SEO'}
              </Button>
            </div>
            {editingSeo && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {[
                  ['title', 'Title'],
                  ['slug', 'Slug'],
                  ['metaTitle', 'Meta Title'],
                  ['coverImageAltText', 'Cover Image Alt'],
                ].map(([field, label]) => (
                  <Input
                    key={field}
                    variant="surface"
                    value={seoEditValue[field as keyof typeof seoEditValue]}
                    onChange={(event) =>
                      setSeoEditValue((current) => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                    aria-label={label}
                    placeholder={label}
                  />
                ))}
                <Textarea
                  variant="surface"
                  value={seoEditValue.excerpt}
                  onChange={(event) =>
                    setSeoEditValue((current) => ({ ...current, excerpt: event.target.value }))
                  }
                  rows={3}
                  aria-label="Excerpt"
                  placeholder="Excerpt"
                />
                <Textarea
                  variant="surface"
                  value={seoEditValue.metaDescription}
                  onChange={(event) =>
                    setSeoEditValue((current) => ({
                      ...current,
                      metaDescription: event.target.value,
                    }))
                  }
                  rows={3}
                  aria-label="Meta description"
                  placeholder="Meta Description"
                />
                <Input
                  variant="surface"
                  value={seoEditValue.tags}
                  onChange={(event) =>
                    setSeoEditValue((current) => ({ ...current, tags: event.target.value }))
                  }
                  aria-label="Tags"
                  placeholder="Tags separated by commas"
                  className="md:col-span-2"
                />
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  className="md:col-span-2"
                  onClick={async () => {
                    const saved = await onSavePublicationMetadata({
                      title: seoEditValue.title,
                      slug: seoEditValue.slug,
                      excerpt: seoEditValue.excerpt,
                      metaTitle: seoEditValue.metaTitle,
                      metaDescription: seoEditValue.metaDescription,
                      coverImageAltText: seoEditValue.coverImageAltText,
                      tags: seoEditValue.tags
                        .split(',')
                        .map((tag) => tag.trim())
                        .filter(Boolean),
                    });
                    if (saved) setEditingSeo(false);
                  }}
                >
                  <Save className="h-3.5 w-3.5" />
                  Save Publication Metadata
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Export Warning */}
        {exportStatus?.blogEditUrl && (
          <Alert variant="warning" className="mb-3 px-3 py-2 text-xs">
            <strong>Note:</strong> This draft was already exported. Re-exporting will update the existing blog draft.
          </Alert>
        )}
        {publicationUxState === 'checking' && (
          <Alert variant="primary" className="mb-3 px-3 py-2 text-xs">
            <EAILoaderStatusIcon className="h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <strong>{t('checkingRecentChangesTitle')}</strong>{' '}
              {t('checkingRecentChangesDescription')}
            </div>
          </Alert>
        )}
        {publicationUxState === 'changes_checked' && (
          <Alert variant="primary" className="mb-3 px-3 py-2 text-xs">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <strong>{t('validationRecommendedTitle')}</strong>{' '}
              {t('validationRecommendedDescription')}
            </div>
          </Alert>
        )}
        {publicationUxState === 'content_decision_required' && (
          <Alert variant="danger" className="mb-3 px-3 py-2 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <strong>{t('fullValidationRequiredTitle')}</strong>{' '}
              {t('fullValidationRequiredDescription')}
            </div>
          </Alert>
        )}
        {publicationUxState === 'metadata_decision_required' && (
          <Alert variant="warning" className="mb-3 px-3 py-2 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <strong>{t('seoFieldsNeedReviewTitle')}</strong>{' '}
              {protectedSeoFields.length > 0
                ? t('seoFieldsNeedReviewDescription', {
                    fields: protectedSeoFields.map((field) => t(`seoField.${field}`)).join(', '),
                  })
                : t('seoReviewRecommendedDescription')}
              {onConfirmPublicationMetadata && generatedMetadata && (
                <Button
                  type="button"
                  variant="muted"
                  size="xs"
                  className="mt-2"
                  disabled={isConfirmingMetadata}
                  onClick={async () => {
                    setIsConfirmingMetadata(true);
                    try {
                      await onConfirmPublicationMetadata();
                      toast.success(t('confirmMetadataSuccess'));
                    } catch {
                      toast.error(t('confirmMetadataFailed'));
                    } finally {
                      setIsConfirmingMetadata(false);
                    }
                  }}
                >
                  {isConfirmingMetadata
                    ? <EAILoaderStatusIcon className="h-3.5 w-3.5" />
                    : <ShieldCheck className="h-3.5 w-3.5" />}
                  {t('confirmMetadataCurrent')}
                </Button>
              )}
            </div>
          </Alert>
        )}
        {publicationUxState === 'metadata_attention_required' && (
          <Alert variant="warning" className="mb-3 px-3 py-2 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div>
                <strong>{t('staleMetadataTitle')}</strong>{' '}
                {t('staleMetadataDescription')}
              </div>
              {onConfirmPublicationMetadata && generatedMetadata && (
                <Button
                  type="button"
                  variant="muted"
                  size="xs"
                  className="mt-2"
                  disabled={isConfirmingMetadata}
                  onClick={async () => {
                    setIsConfirmingMetadata(true);
                    try {
                      await onConfirmPublicationMetadata();
                      toast.success(t('confirmMetadataSuccess'));
                    } catch {
                      toast.error(t('confirmMetadataFailed'));
                    } finally {
                      setIsConfirmingMetadata(false);
                    }
                  }}
                >
                  {isConfirmingMetadata
                    ? <EAILoaderStatusIcon className="h-3.5 w-3.5" />
                    : <ShieldCheck className="h-3.5 w-3.5" />}
                  {t('confirmMetadataCurrent')}
                </Button>
              )}
            </div>
          </Alert>
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
        {ready && !isAiBusy && onRefineAgain && (
          <div className="mt-2 pt-2">
            <Tooltip>
              <TooltipTrigger
                render={<Button type="button" variant="muted" size="xs" />}
                onClick={() => setShowRefineBox(p => !p)}
                className="-ml-2 w-max"
                aria-expanded={showRefineBox}
                style={{ color: showRefineBox ? 'var(--primary)' : 'var(--muted-foreground)' }}
              >
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
                <Textarea
                  variant="surface"
                  name="revision-instructions"
                  autoComplete="off"
                  aria-label="Revision instructions"
                  value={refineInstruction}
                  onChange={e => setRefineInstruction(e.target.value)}
                  placeholder="Example: Shorten the introduction, strengthen the opening, and add a business perspective…"
                  disabled={isAiBusy}
                  rows={3}
                />
                <Button
                  type="button"
                  onClick={() => {
                    if (!refineInstruction.trim() || isAiBusy) return;
                    onRefineAgain(refineInstruction.trim());
                    setRefineInstruction('');
                    setShowRefineBox(false);
                  }}
                  disabled={!refineInstruction.trim() || isAiBusy}
                  variant={refineInstruction.trim() && !isAiBusy ? 'primary' : 'surface'}
                  size="sm"
                  className="w-full"
                >
                  {isRefining
                    ? <><EAILoaderStatusIcon className="h-3 w-3" /> Refining…</>
                    : <>Apply</>}
                </Button>
              </div>
            )}
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
              includeSeoStage={includeSeoStage}
            />
          )}
          <div className="document-tabs flex shrink-0 border-t border-[var(--border)] bg-transparent">
            {tabs.map(tab => {
              const active = displayTab === tab.key;
              return (
                <Button
                  type="button"
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  disabled={editingDraft && tab.key !== 'preview'}
                  variant="muted"
                  className={`document-tab flex items-center justify-center gap-1.5 h-auto rounded-none border-none ${
                    active
                      ? 'is-active'
                      : ''
                  }`}
                  aria-pressed={active}
                >
                  {tab.icon}
                  {tab.label}
                </Button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6 md:px-4 md:py-6">
            {/* Preview Tab */}
            {displayTab === 'preview' && (
              <article className="max-w-[95%] mx-auto font-sans py-4 md:py-6">
                {polishedDraft ? (
                  editingDraft && onSaveFinalDraft ? (
                    <div className="final-draft-inline-editor-shell">
                      <div className="final-draft-inline-editor-toolbar not-prose">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[var(--foreground)]">
                            {t('editingInline')}
                          </p>
                          <p className="text-[11px] text-[var(--muted-foreground)]">
                            {t('saveInvalidatesReview')}
                          </p>
                          <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                            {t('revisionImpactPolicy')}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            type="button"
                            variant="muted"
                            size="sm"
                            onClick={cancelDraftEditing}
                            disabled={isSavingFinalDraft}
                          >
                            {t('cancelEdit')}
                          </Button>
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => void saveDraftRevision()}
                            disabled={!draftEditValue.trim() || !hasUnsavedDraftEdits || isSavingFinalDraft}
                          >
                            {isSavingFinalDraft
                              ? <EAILoaderStatusIcon className="h-3.5 w-3.5" />
                              : <Save className="h-3.5 w-3.5" />}
                            {t('saveRevision')}
                          </Button>
                        </div>
                      </div>
                      <InlineFinalDraftEditor
                        value={draftEditValue}
                        onChange={setDraftEditValue}
                        disabled={isSavingFinalDraft}
                        ariaLabel={t('inlineEditorLabel')}
                      />
                    </div>
                  ) : (
                    <div className="text-[16px] leading-[1.85] text-foreground/90 select-text selection:bg-[var(--gold)]/30">
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
                  )
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
                        <p className="whitespace-pre-wrap break-words font-sans">{segment.text}</p>
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
