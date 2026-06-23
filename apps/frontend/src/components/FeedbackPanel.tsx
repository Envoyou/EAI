'use client';

import { useState } from 'react';
import { AnalysisResult, EditorialProcessStage, VerificationStatus } from '@eai/shared';
import {
  AlertCircle, CheckCircle2, AlertTriangle, FileSearch, Flag,
  ArrowRightCircle, Check, HelpCircle, Wand2, ShieldAlert, Copy,
  Maximize2, Minimize2, ChevronDown, ChevronUp, ListChecks,
  Loader2, Trash2, Link, ExternalLink
} from 'lucide-react';
import { motion, Variants, AnimatePresence } from 'framer-motion';
import { canAutoApplyFeedback } from '@eai/shared';
import { toast } from 'sonner';
import EditorialProgress from '@/components/EditorialProgress';

interface FeedbackPanelProps {
  result: AnalysisResult;
  title?: string;
  onApplyFix?: (targetText: string, replacementText: string, operation: 'replace' | 'insert_before' | 'insert_after' | 'manual', index: number) => boolean;
  onApplyAll?: () => void;
  isFocused?: boolean;
  onFocusToggle?: () => void;
  hoveredFeedbackIndex: number | null;
  onHoveredFeedbackChange: (index: number | null) => void;
  activeFeedbackIndex: number | null;
  onActiveFeedbackChange: (index: number | null) => void;
  isSidebarMode?: boolean;
  isProcessing?: boolean;
  processStage?: EditorialProcessStage;
  processStartedAt?: number | null;
  isRefining?: boolean;
  onAcceptFeedback?: (index: number) => void;
  onRemoveFeedbackAddition?: (index: number) => Promise<void>;
  onAddFeedbackSource?: (index: number, url: string) => void;
  onMarkFeedbackVerified?: (index: number) => void;
  onFixFeedbackWithEAI?: (index: number) => Promise<void>;
  isTargetedFixing?: number | null;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 26 } }
};

const verificationBadgeMap: Record<VerificationStatus, {
  label: string;
  icon: typeof ShieldAlert;
  className: string;
}> = {
  source_backed: {
    label: 'Source-backed',
    icon: CheckCircle2,
    className: 'ui-badge-success',
  },
  needs_citation: {
    label: 'Needs citation',
    icon: AlertTriangle,
    className: 'ui-badge-warning',
  },
  high_risk_factual_claim: {
    label: 'High-risk factual claim',
    icon: ShieldAlert,
    className: 'ui-badge-danger',
  },
};

const BENIGN_DISPLAY_FLAG_PATTERN =
  /^(?:none|n\/a|all clear|no (?:factual )?(?:risks?|issues?|critical flags?)(?: (?:were )?found)?\b.*|tidak ada (?:risiko|masalah|pelanggaran|flag|temuan)\b.*)$/i;

/* --- Copy Button --- */
const CopyButton = ({ text, label, onCopy }: { text: string; label: string; onCopy: (text: string, label: string) => void }) => (
  <button
    onClick={() => onCopy(text, label)}
    className="ml-2 ui-btn ui-btn-muted ui-btn-icon !h-7 !w-7 rounded-md"
    title={`Copy ${label}`}
    aria-label={`Copy ${label}`}
  >
    <Copy className="w-3.5 h-3.5" />
  </button>
);

const getSourceDisplay = (source: string) => {
  try {
    const parsed = new URL(source);
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`.replace(/^\/$/, '');
    return {
      isUrl: true,
      host: parsed.hostname.replace(/^www\./, ''),
      detail: path || parsed.protocol.replace(':', ''),
    };
  } catch {
    return {
      isUrl: false,
      host: 'Citation',
      detail: source,
    };
  }
};

export default function FeedbackPanel({
  result,
  title,
  onApplyFix,
  onApplyAll,
  isFocused,
  onFocusToggle,
  onHoveredFeedbackChange,
  activeFeedbackIndex,
  onActiveFeedbackChange,
  isProcessing = false,
  processStage = 'reviewing',
  processStartedAt,
  isRefining = false,
  onAcceptFeedback,
  onRemoveFeedbackAddition,
  onAddFeedbackSource,
  onMarkFeedbackVerified,
  onFixFeedbackWithEAI,
  isTargetedFixing = null,
}: FeedbackPanelProps) {
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<number>>(new Set());
  const [failedSuggestions,  setFailedSuggestions]  = useState<Set<number>>(new Set());
  const [expandedFeedback,   setExpandedFeedback]   = useState<Set<number>>(new Set());
  const [isSEOExpanded, setIsSEOExpanded] = useState(false);
  const [activeSourceInput, setActiveSourceInput] = useState<number | null>(null);
  const [sourceText, setSourceText] = useState('');

  const toggleFeedback = (index: number) => {
    setExpandedFeedback(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  /* ─── IDLE STATE ─── */
  if (result.status === 'idle') {
    return (
      <div className="ui-state-card flex h-full min-h-0 flex-col items-center justify-center p-8 text-center">
        <div className="w-10 h-10 rounded-md flex items-center justify-center mb-4 bg-[var(--surface-2)]">
          <FileSearch className="w-7 h-7 ui-muted" />
        </div>
        <h3 className="text-base font-semibold mb-1.5 ui-text">
          No Analysis Yet
        </h3>
        <p className="text-xs leading-relaxed max-w-[220px] ui-muted">
          Fill in metadata, paste your draft, and press{' '}
          <kbd className="ui-kbd mx-1 px-1.5 py-0.5 shadow-[inset_0_0_0_1px_var(--border)]">
            Ctrl+↵
          </kbd>
          to begin.
        </p>
      </div>
    );
  }

  /* ─── LOADING STATE ─── */
  if (result.status === 'loading' || isProcessing) {
    return (
      <div className="ui-state-card h-full min-h-0 overflow-hidden">
        <EditorialProgress
          compact
          stage={processStage}
          startedAt={processStartedAt}
          refining={isRefining}
        />
      </div>
    );
  }

  /* ─── ERROR STATE ─── */
  if (result.status === 'error') {
    return (
      <div className="ui-state-card flex h-full min-h-0 flex-col justify-center p-6">
        <div className="ui-alert ui-alert-danger flex-col p-5">
          <div className="flex items-center gap-2 text-[var(--error)]">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="font-semibold text-sm">Analysis Failed</span>
          </div>
          <p className="text-sm leading-relaxed ui-muted">
            {result.errorMessage || 'Unable to connect to the AI server. Please check your connection and try again.'}
          </p>
        </div>
      </div>
    );
  }

  /* ─── Helpers ─── */
  const readiness = result.readiness;
  const readinessClass =
    readiness === 'ready' ? 'ui-badge-success' :
    readiness === 'needs_review' ? 'ui-badge-warning' :
    readiness === 'blocked' ? 'ui-badge-danger' : 'ui-badge-muted';
  const readinessLabel =
    readiness === 'ready' ? 'Ready for Editorial Review' :
    readiness === 'needs_review' ? 'Needs Review' :
    readiness === 'blocked' ? 'Blocked' : 'Legacy Review';

  const handleApplyClick = (target: string, replacement: string, operation: 'replace' | 'insert_before' | 'insert_after' | 'manual', index: number) => {
    if (onApplyFix) {
      const success = onApplyFix(target, replacement, operation, index);
      if (success) setAppliedSuggestions(prev => new Set(prev).add(index));
      else         setFailedSuggestions(prev => new Set(prev).add(index));
    }
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied!`);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleCopySEOPack = async () => {
    if (!result.generatedMetadata) return;
    const { title: t, slug, metaTitle, excerpt, metaDescription, coverImageAltText, tags } = result.generatedMetadata;
    const pack = [
      t              ? `Title: ${t}`                        : '',
      slug           ? `Slug: ${slug}`                      : '',
      metaTitle      ? `Meta Title: ${metaTitle}`           : '',
      excerpt        ? `Excerpt: ${excerpt}`                 : '',
      metaDescription? `Meta Description: ${metaDescription}`: '',
      coverImageAltText? `Cover Image Alt: ${coverImageAltText}`: '',
      tags?.length   ? `Tags: ${tags.join(', ')}`           : '',
    ].filter(Boolean).join('\n\n');
    try {
      await navigator.clipboard.writeText(pack);
      toast.success('SEO Pack copied!');
    } catch {
      toast.error('Failed to copy SEO Pack');
    }
  };

  const autoApplicableCount = result.feedback?.filter(canAutoApplyFeedback).length || 0;
  const isManualFallback    = result.responseMode === 'manual_fallback';
  const isCompactFallback   = result.responseMode === 'compact';
  const visibleFlags = (result.flags ?? []).filter(
    (flag) => !BENIGN_DISPLAY_FLAG_PATTERN.test(flag.trim())
  );
  const hasCriticalFlags = readiness === 'blocked';

  /* ─── SUCCESS STATE ─── */
  return (
    <div className="ui-panel h-full">
      {/* ── Header ── */}
      <div className="ui-panel-header px-4 py-3">
        {/* Row 1: title + verdict + focus toggle */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="mb-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">
              Editorial Review
            </p>
            <h2
              className="truncate text-[13px] font-semibold text-[var(--foreground)]"
              title={title}
            >
              {title || 'Untitled Draft'}
            </h2>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {(readiness || result.verdict) && (
              <span className={`ui-badge ui-badge-xs tracking-wide ${readinessClass}`}>
                {readinessLabel}
              </span>
            )}
            {result.responseMode && (
              <span className="ui-badge ui-badge-xs ui-badge-muted uppercase tracking-wide">
                {result.responseMode.replace('_', ' ')}
              </span>
            )}
            {onFocusToggle && (
              <button
                onClick={onFocusToggle}
                className="ui-btn ui-btn-muted ui-btn-icon !h-[30px] !w-[30px]"
                title={isFocused ? 'Restore Split View' : 'Focus Panel'}
                aria-label={isFocused ? 'Restore split view' : 'Focus editorial review'}
              >
                {isFocused ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Final-draft quality gate summary */}
        <div className="feedback-score-summary flex items-start gap-4 mt-3">
          {result.summary && (
            <p className="text-xs leading-relaxed flex-1 text-[var(--foreground)] opacity-80">
              {result.summary}
            </p>
          )}
        </div>

        {/* Alerts (Borderless) */}
        {isManualFallback && (
          <div className="ui-alert ui-alert-warning mt-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="text-xs font-semibold ui-text">Manual Fallback Mode</p>
              <p className="mt-0.5 text-[11px] leading-relaxed ui-muted">
                AI review completed, auto-apply disabled to prevent truncation issues.
              </p>
            </div>
          </div>
        )}
        {isCompactFallback && (
          <div className="ui-alert ui-alert-muted mt-3 !p-2.5">
            <p className="text-[11px] ui-muted">
              Compact mode active — optimized for heavier drafts.
            </p>
          </div>
        )}

        {onApplyAll && autoApplicableCount > 0 && !isManualFallback && (
          <div className="feedback-apply-all mt-3 flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
            <p className="text-xs flex-1 ui-text">
              <span className="font-semibold">{autoApplicableCount}</span> suggested edits can be applied.
            </p>
            <button
              onClick={onApplyAll}
              className="ui-btn ui-btn-primary ui-btn-xs"
            >
              <Wand2 className="w-3.5 h-3.5" />
              Apply All
            </button>
          </div>
        )}
      </div>

      {/* ── Scrollable Body ── */}
      <div className="relative min-h-0 flex-1 overflow-y-auto p-3">
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-3">

          {result.changes && result.changes.length > 0 && (
            <motion.div variants={itemVariants} className="inspector-section overflow-hidden">
              <div className="flex items-center gap-2 px-3 pt-3 text-xs font-semibold ui-text">
                <ListChecks className="h-4 w-4 text-[var(--success)]" />
                What EAI improved
              </div>
              <ul className="space-y-2 px-3 pb-3 pt-2">
                {result.changes.map((change, index) => (
                  <li key={index} className="flex gap-2 text-xs leading-relaxed ui-muted">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--success)]" />
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          {/* SEO Metadata Accordion */}
          {result.generatedMetadata && (
            <motion.div
              variants={itemVariants}
              className="inspector-section overflow-hidden"
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setIsSEOExpanded(p => !p)}
                  aria-expanded={isSEOExpanded}
                  className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent text-left text-xs font-semibold text-[var(--foreground)] cursor-pointer hover:bg-[var(--surface-2)] px-2 py-1.5 -ml-2 rounded-md transition-colors"
                >
                  <Wand2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">SEO Metadata</span>
                  {isSEOExpanded ? <ChevronUp className="ml-auto w-4 h-4" /> : <ChevronDown className="ml-auto w-4 h-4" />}
                </button>
                <div className="ml-2 flex items-center gap-1">
                  <button
                    onClick={handleCopySEOPack}
                    className="ui-btn ui-btn-muted ui-btn-xs"
                    aria-label="Copy SEO metadata"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {isSEOExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 pt-1 space-y-3 text-xs">
                      {[
                        { label: 'Title',            value: result.generatedMetadata.title },
                        { label: 'Slug',             value: result.generatedMetadata.slug, mono: true },
                        { label: 'Meta Title',       value: result.generatedMetadata.metaTitle },
                        { label: 'Excerpt',          value: result.generatedMetadata.excerpt, italic: true },
                        { label: 'Meta Description', value: result.generatedMetadata.metaDescription },
                        { label: 'Cover Image Alt',  value: result.generatedMetadata.coverImageAltText },
                      ].map(({ label, value, mono, italic }) => value ? (
                        <div key={label}>
                          <div className="flex items-center justify-between mb-1.5 px-0.5">
                            <span className="font-bold text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</span>
                            <CopyButton text={value} label={label} onCopy={handleCopy} />
                          </div>
                          <div
                            className={`ui-card-soft px-3.5 py-2.5 break-words text-[var(--foreground)] opacity-85 ${mono ? 'font-mono text-[11px] break-all' : ''} ${italic ? 'italic' : ''}`}
                          >
                            {value}
                          </div>
                        </div>
                      ) : null)}
                      {result.generatedMetadata.tags && result.generatedMetadata.tags.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-1.5 px-0.5">
                            <span className="font-bold text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">Tags</span>
                            <CopyButton text={result.generatedMetadata.tags.join(', ')} label="Tags" onCopy={handleCopy} />
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {result.generatedMetadata.tags.map((tag, idx) => (
                              <span
                                key={idx}
                                className="ui-card-soft px-2.5 py-1 text-xs font-semibold text-[var(--foreground)]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Critical Flags (Borderless card) */}
          {visibleFlags.length > 0 && (
            <motion.div
              variants={itemVariants}
              className={`ui-alert flex-col p-3 relative overflow-hidden ${
                hasCriticalFlags ? 'ui-alert-danger' : 'ui-alert-warning'
              }`}
              style={{
                borderLeft: `3.5px solid ${hasCriticalFlags ? 'var(--error)' : 'var(--warning)'}`,
              }}
            >
              <h4
                className="flex items-center gap-2 text-xs font-semibold mb-2"
                style={{ color: hasCriticalFlags ? 'var(--error)' : 'var(--warning)' }}
              >
                <Flag className="w-3.5 h-3.5" />
                {hasCriticalFlags ? 'Critical Flags' : 'Review Flags'}
              </h4>
              <ul className="list-disc pl-4 space-y-1">
                {visibleFlags.map((flag, i) => (
                  <li key={i} className="text-xs leading-relaxed">{flag}</li>
                ))}
              </ul>
            </motion.div>
          )}

          {result.feedback && result.feedback.length > 0 && (
            <motion.div variants={itemVariants} className="flex items-center justify-between px-1 pt-1">
              <h3 className="text-[11px] font-semibold ui-muted">Remaining Checks</h3>
              <span className="text-[11px] ui-muted">{result.feedback.length}</span>
            </motion.div>
          )}

          {/* Final-draft checks */}
          {result.feedback?.map((item, index) => {
            const isApplied = appliedSuggestions.has(index);
            const isFailed  = failedSuggestions.has(index);
            const showApplyFeature = (item.status === 'warning' || item.status === 'fail') && canAutoApplyFeedback(item);
            const isExpanded = expandedFeedback.has(index);
            const verificationMeta = item.verificationStatus ? verificationBadgeMap[item.verificationStatus] : null;
            const VerificationIcon = verificationMeta?.icon;

            const isAccepted = item.isAccepted;
            const isVerified = item.isVerified;
            const isResolved = isAccepted || isVerified || item.status === 'pass';
            const sourceDisplay = item.verifiedSource ? getSourceDisplay(item.verifiedSource) : null;

            const borderColor =
              isResolved                ? 'var(--success)' :
              item.status === 'warning' ? 'var(--warning)' : 'var(--error)';
            const bgColor =
              isResolved                ? 'rgba(74,222,128,0.04)'  :
              item.status === 'warning' ? 'rgba(245,158,11,0.04)'  : 'rgba(248,113,113,0.04)';

            const isActiveCard = activeFeedbackIndex === index;

            return (
              <motion.div
                variants={itemVariants}
                key={index}
                className={`feedback-check overflow-hidden cursor-pointer ${isActiveCard ? 'is-active' : ''}`}
                style={{
                  background: bgColor,
                  borderLeftColor: borderColor,
                }}
                onMouseEnter={() => onHoveredFeedbackChange && onHoveredFeedbackChange(index)}
                onMouseLeave={() => onHoveredFeedbackChange && onHoveredFeedbackChange(null)}
              >
                <button
                  type="button"
                  onClick={() => {
                    toggleFeedback(index);
                    if (onActiveFeedbackChange) {
                      onActiveFeedbackChange(index);
                    }
                  }}
                  className="flex w-full items-center justify-between border-0 bg-transparent px-3 py-2.5 text-left cursor-pointer select-none transition-colors hover:bg-[var(--surface-2)]"
                  style={{ borderRadius: isExpanded ? '0' : undefined }}
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isResolved && <CheckCircle2  className="w-4 h-4 shrink-0" style={{ color: 'var(--success)' }} />}
                    {!isResolved && item.status === 'warning' && <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: 'var(--warning)' }} />}
                    {!isResolved && item.status === 'fail'    && <AlertCircle   className="w-4 h-4 shrink-0" style={{ color: 'var(--error)'   }} />}
                    <span className="truncate text-xs font-semibold ui-text">
                      {item.category}
                    </span>
                    {!isExpanded && item.message && (
                      <span className="hidden md:inline text-xs truncate ml-1 font-normal ui-muted">
                        — {item.message}
                      </span>
                    )}
                  </div>
                  <span className="ml-2 shrink-0 ui-muted">
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </span>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: 'easeInOut' }}
                      className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 pt-1 space-y-3">
                      <p className="text-xs leading-relaxed whitespace-pre-wrap break-words text-[var(--foreground)] opacity-85">
                        {item.message}
                      </p>

                      {verificationMeta && (
                        <div
                          className={`ui-badge ${verificationMeta.className}`}
                        >
                          {VerificationIcon && <VerificationIcon className="w-3.5 h-3.5" />}
                          <span>Verification Status: {verificationMeta.label}</span>
                        </div>
                      )}

                      {item.targetText && !showApplyFeature && (
                        <div className="ui-card-soft px-4 py-3">
                          <span
                            className="text-[12px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1.5"
                            style={{ color: verificationMeta ? 'var(--warning)' : 'var(--primary)' }}
                          >
                            <FileSearch className="w-3.5 h-3.5" />
                            {verificationMeta ? 'Flagged claim' : 'Target text'}
                          </span>
                          <p className="text-xs leading-relaxed break-words font-mono text-[var(--foreground)] opacity-90">
                            {item.targetText}
                          </p>
                        </div>
                      )}

                      {item.reason && (
                        <div className="ui-card-soft px-4 py-3 text-xs ui-muted">
                          <span className="font-bold ui-text">Reason: </span>
                          {item.reason}
                        </div>
                      )}

                      {item.suggestion && !showApplyFeature && (
                        <div className="ui-card-soft px-4 py-3.5">
                          <span
                            className="text-[12px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1.5"
                            style={{ color: 'var(--primary)' }}
                          >
                            <Wand2 className="w-3.5 h-3.5" /> Suggestion
                          </span>
                          <p className="text-xs italic leading-relaxed text-[var(--foreground)] opacity-90">
                            {item.suggestion}
                          </p>
                        </div>
                      )}

                      {showApplyFeature && (
                        <div className="ui-card overflow-hidden">
                          <div className="px-3.5 py-2.5 bg-[var(--surface-2)]">
                            <span className="text-[12px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--primary)' }}>
                              <ArrowRightCircle className="w-3.5 h-3.5" />
                              {item.operation === 'insert_before' ? 'Insert Before Target' :
                               item.operation === 'insert_after'  ? 'Insert After Target'  : 'Auto-Replace'}
                            </span>
                          </div>
                          <div className="p-3.5 space-y-3">
                            <div>
                              <span className="text-[12px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--error)' }}>Before</span>
                              <p
                                className="rounded-md px-3 py-2 text-xs line-through break-words font-mono border-none"
                                style={{
                                  background: 'rgba(248,113,113,0.06)',
                                  color: 'var(--muted-foreground)',
                                  textDecorationColor: 'rgba(248,113,113,0.4)',
                                }}
                              >
                                {item.targetText}
                              </p>
                            </div>
                            <div>
                              <span className="text-[12px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--success)' }}>After</span>
                              <p
                                className="rounded-md px-3 py-2 text-xs break-words font-mono border-none"
                                style={{
                                  background: 'rgba(74,222,128,0.06)',
                                  color: 'var(--foreground)',
                                  opacity: 0.9,
                                }}
                              >
                                {item.replacementText}
                              </p>
                            </div>
                            <div className="flex justify-end pt-1">
                              <button
                                onClick={() => handleApplyClick(item.targetText!, item.replacementText!, item.operation!, index)}
                                disabled={isApplied}
                                className={`ui-btn ui-btn-sm ${isApplied || isFailed ? '' : 'ui-btn-primary'}`}
                                style={isApplied ? {
                                  background: 'rgba(74,222,128,0.1)',
                                  color: 'var(--success)',
                                } : isFailed ? {
                                  background: 'rgba(245,158,11,0.1)',
                                  color: 'var(--warning)',
                                } : {
                                  background: 'var(--primary)',
                                  color: 'var(--primary-foreground)',
                                }}
                              >
                                  {isApplied ? (
                                    <><Check className="w-3.5 h-3.5" /> Applied</>
                                  ) : isFailed ? (
                                    <><HelpCircle className="w-3.5 h-3.5" /> Review Manually</>
                                  ) : (
                                    <><Wand2 className="w-3.5 h-3.5" /> Apply</>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Interactive Actions for Post-Polish Review Loop */}
                        {!isAccepted && !isVerified && (
                          <div className="mt-3 pt-3 border-t border-[var(--border)]/50 flex flex-wrap gap-2">
                            {item.category === 'Editorial Addition' && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onAcceptFeedback) onAcceptFeedback(index);
                                  }}
                                  className="ui-btn ui-btn-success ui-btn-xs"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  Accept Addition
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onRemoveFeedbackAddition) onRemoveFeedbackAddition(index);
                                  }}
                                  disabled={isTargetedFixing !== null}
                                  className="ui-btn ui-btn-muted ui-btn-xs"
                                >
                                  {isTargetedFixing === index ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                  Remove Addition
                                </button>
                              </>
                            )}

                            {item.category === 'Internal Linking' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onAcceptFeedback) onAcceptFeedback(index);
                                }}
                                className="ui-btn ui-btn-success ui-btn-xs"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Confirm Link
                              </button>
                            )}

                            {item.verificationStatus && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveSourceInput(prev => prev === index ? null : index);
                                    setSourceText('');
                                  }}
                                  className="ui-btn ui-btn-primary ui-btn-xs"
                                >
                                  <Link className="w-3.5 h-3.5" />
                                  Add Source
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onMarkFeedbackVerified) onMarkFeedbackVerified(index);
                                  }}
                                  className="ui-btn ui-btn-success ui-btn-xs"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  Mark Verified
                                </button>
                              </>
                            )}

                            {item.targetText
                              && (item.category === 'Source Fidelity' || item.category === 'Internal Linking')
                              && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onRemoveFeedbackAddition) onRemoveFeedbackAddition(index);
                                  }}
                                  disabled={isTargetedFixing !== null}
                                  className="ui-btn ui-btn-muted ui-btn-xs"
                                >
                                  {isTargetedFixing === index ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                  Remove or Neutralize
                                </button>
                              )}

                            {item.targetText && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onFixFeedbackWithEAI) onFixFeedbackWithEAI(index);
                                }}
                                disabled={isTargetedFixing !== null}
                                className="ui-btn ui-btn-primary ui-btn-xs"
                              >
                                {isTargetedFixing === index ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Wand2 className="w-3.5 h-3.5" />
                                )}
                                Rewrite with EAI
                              </button>
                            )}
                          </div>
                        )}

                        {/* Inline Input for Add Source */}
                        {activeSourceInput === index && (
                          <div className="mt-3 p-3 rounded-md bg-[var(--surface-2)] space-y-2" onClick={e => e.stopPropagation()}>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                              Enter Source URL or Citation
                            </div>
                            <div className="flex min-w-0 gap-2">
                              <input
                                type="text"
                                name={`feedback-source-${index}`}
                                autoComplete="off"
                                aria-label="Source URL or citation"
                                placeholder="https://example.com/source…"
                                value={sourceText}
                                onChange={(e) => setSourceText(e.target.value)}
                                className="ui-control ui-input min-w-0 flex-1 text-xs"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    if (onAddFeedbackSource) {
                                      onAddFeedbackSource(index, sourceText);
                                      setActiveSourceInput(null);
                                    }
                                  }
                                }}
                              />
                              <button
                                onClick={() => {
                                  if (onAddFeedbackSource) {
                                    onAddFeedbackSource(index, sourceText);
                                    setActiveSourceInput(null);
                                  }
                                }}
                                className="ui-btn ui-btn-primary ui-btn-xs"
                              >
                                Submit
                              </button>
                              <button
                                onClick={() => setActiveSourceInput(null)}
                                className="ui-btn ui-btn-muted ui-btn-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Accepted Banner */}
                        {isAccepted && (
                          <div className="mt-2 ui-badge ui-badge-success w-max">
                            <Check className="w-3.5 h-3.5" />
                            <span>Accepted as Editorial Choice</span>
                          </div>
                        )}

                        {/* Verified Banner */}
                        {isVerified && (
                          <div className="mt-3 overflow-hidden rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-100 shadow-[inset_3px_0_0_rgba(16,185,129,0.75)]">
                            <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-emerald-300">
                              <Check className="h-3.5 w-3.5 shrink-0" />
                              <span className="min-w-0 truncate">
                                {item.verifiedSource ? 'Source verified' : 'Verified by editor'}
                              </span>
                            </div>
                            {item.verifiedSource && sourceDisplay && (
                              <div className="border-t border-emerald-500/15 px-3 py-2.5">
                                <div className="flex min-w-0 items-start gap-2">
                                  <Link className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-[11px] font-semibold text-emerald-200">
                                      {sourceDisplay.host}
                                    </div>
                                    <div
                                      className="mt-0.5 max-h-12 overflow-y-auto break-all pr-1 text-[10.5px] leading-relaxed text-emerald-50/70"
                                      title={item.verifiedSource}
                                    >
                                      {sourceDisplay.detail}
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleCopy(item.verifiedSource!, 'Source URL');
                                      }}
                                      className="ui-btn ui-btn-muted ui-btn-icon !h-7 !w-7 rounded-md border-emerald-500/20 bg-emerald-950/30 text-emerald-100 hover:bg-emerald-900/45"
                                      title="Copy source URL"
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </button>
                                    {sourceDisplay.isUrl && (
                                      <a
                                        href={item.verifiedSource}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={(event) => event.stopPropagation()}
                                        className="ui-btn ui-btn-muted ui-btn-icon !h-7 !w-7 rounded-md border-emerald-500/20 bg-emerald-950/30 text-emerald-100 hover:bg-emerald-900/45"
                                        title="Open source"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
