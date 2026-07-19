'use client';

import { FeedbackItem, VerificationStatus } from '@eai/shared';
import {
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  FileSearch,
  Wand2,
  ShieldAlert,
  Copy,
  ChevronDown,
  ChevronUp,
  ArrowRightCircle,
  Check,
  Loader2,
  Trash2,
  Link,
  ExternalLink,
} from 'lucide-react';
import { motion, Variants, AnimatePresence } from 'framer-motion';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { canShowAutoApply } from '../utils';

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 320, damping: 26 },
  },
};

const verificationBadgeMap: Record<
  VerificationStatus,
  {
    label: string;
    icon: typeof ShieldAlert;
    className: string;
  }
> = {
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

const getSourceDisplay = (source: string) => {
  try {
    const parsed = new URL(source);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Unsupported source protocol');
    }
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`.replace(
      /^\/$/,
      ''
    );
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

interface FeedbackItemCardProps {
  item: FeedbackItem;
  index: number;
  feedbackKey: string;
  isExpanded: boolean;
  isActiveCard: boolean;
  isApplied: boolean;
  isApplying: boolean;
  isSubmittingSource: boolean;
  autoApplyDisabled: boolean;
  activeSourceInput: string | null;
  sourceText: string;
  isTargetedFixing: number | null;
  onToggleFeedback: (feedbackKey: string) => void;
  onActiveFeedbackChange?: (index: number | null) => void;
  onHoveredFeedbackChange?: (index: number | null) => void;
  onApplyClick: (
    target: string,
    replacement: string,
    operation: 'replace' | 'insert_before' | 'insert_after' | 'manual',
    index: number,
    feedbackKey: string
  ) => Promise<void>;
  onCopy: (text: string, label: string) => void;
  onAcceptFeedback?: (index: number) => Promise<void>;
  onRemoveFeedbackAddition?: (index: number) => Promise<void>;
  onSubmitSource: (index: number, feedbackKey: string) => Promise<void>;
  onFixFeedbackWithEAI?: (index: number) => Promise<void>;
  setActiveSourceInput: (feedbackKey: string | null) => void;
  setSourceText: (text: string) => void;
}

export function FeedbackItemCard({
  item,
  index,
  feedbackKey,
  isExpanded,
  isActiveCard,
  isApplied,
  isApplying,
  isSubmittingSource,
  autoApplyDisabled,
  activeSourceInput,
  sourceText,
  isTargetedFixing,
  onToggleFeedback,
  onActiveFeedbackChange,
  onHoveredFeedbackChange,
  onApplyClick,
  onCopy,
  onAcceptFeedback,
  onRemoveFeedbackAddition,
  onSubmitSource,
  onFixFeedbackWithEAI,
  setActiveSourceInput,
  setSourceText,
}: FeedbackItemCardProps) {
  const targetText = item.targetText;
  const replacementText = item.replacementText;
  const operation = item.operation;
  const showApplyFeature = canShowAutoApply(item, autoApplyDisabled);

  const verificationMeta = item.verificationStatus
    ? verificationBadgeMap[item.verificationStatus]
    : null;
  const VerificationIcon = verificationMeta?.icon;

  const isAccepted = item.isAccepted;
  const isVerified = item.isVerified;
  const isResolved = isApplied || isAccepted || isVerified || item.status === 'pass';
  const sourceDisplay = item.verifiedSource
    ? getSourceDisplay(item.verifiedSource)
    : null;

  const borderColor = isResolved
    ? 'var(--success)'
    : item.status === 'warning'
      ? 'var(--warning)'
      : 'var(--error)';
  const bgColor = isResolved
    ? 'rgba(74,222,128,0.04)'
    : item.status === 'warning'
      ? 'rgba(245,158,11,0.04)'
      : 'rgba(248,113,113,0.04)';

  return (
    <motion.div
      variants={itemVariants}
      key={index}
      className={`feedback-check overflow-hidden cursor-pointer min-w-0 w-full ${
        isActiveCard ? 'is-active' : ''
      }`}
      style={{
        background: bgColor,
        borderLeftColor: borderColor,
      }}
      onMouseEnter={() =>
        onHoveredFeedbackChange && onHoveredFeedbackChange(index)
      }
      onMouseLeave={() =>
        onHoveredFeedbackChange && onHoveredFeedbackChange(null)
      }
    >
      <button
        type="button"
        onClick={() => {
          onToggleFeedback(feedbackKey);
          if (onActiveFeedbackChange) {
            onActiveFeedbackChange(isActiveCard ? null : index);
          }
        }}
        className="flex w-full items-center justify-between border-0 bg-transparent px-3 py-2.5 text-left cursor-pointer select-none transition-colors hover:bg-[var(--surface-2)]"
        style={{ borderRadius: isExpanded ? '0' : undefined }}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isResolved && (
            <CheckCircle2
              className="w-4 h-4 shrink-0"
              style={{ color: 'var(--success)' }}
            />
          )}
          {!isResolved && item.status === 'warning' && (
            <AlertTriangle
              className="w-4 h-4 shrink-0"
              style={{ color: 'var(--warning)' }}
            />
          )}
          {!isResolved && item.status === 'fail' && (
            <AlertCircle
              className="w-4 h-4 shrink-0"
              style={{ color: 'var(--error)' }}
            />
          )}
          <span className="text-xs font-semibold ui-text shrink-0 whitespace-nowrap">
            {item.category}
          </span>
          {!isExpanded && item.message && (
            <span className="hidden md:block text-xs truncate ml-1 font-normal ui-muted flex-1 min-w-0">
              — {item.message}
            </span>
          )}
        </div>
        <span className="ml-2 shrink-0 ui-muted">
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </span>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden min-w-0 w-full"
          >
            <div className="px-3 pb-3 pt-1 space-y-3 min-w-0 w-full overflow-hidden">
              <p className="text-xs leading-relaxed whitespace-pre-wrap break-words text-[var(--foreground)] opacity-85 w-full">
                {item.message}
              </p>

              {verificationMeta && (
                <div
                  className={`ui-badge ${verificationMeta.className} whitespace-normal flex-wrap h-auto py-1.5`}
                >
                  {VerificationIcon && (
                    <VerificationIcon className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="break-words">
                    Verification Status: {verificationMeta.label}
                  </span>
                </div>
              )}

              {targetText && !showApplyFeature && (
                <div className="ui-card-soft px-4 py-3 min-w-0 w-full">
                  <span
                    className="text-[12px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1.5"
                    style={{
                      color: verificationMeta
                        ? 'var(--warning)'
                        : 'var(--primary)',
                    }}
                  >
                    <FileSearch className="w-3.5 h-3.5" />
                    {verificationMeta ? 'Flagged claim' : 'Target text'}
                  </span>
                  <p className="text-xs leading-relaxed break-all whitespace-pre-wrap font-mono text-[var(--foreground)] opacity-90 w-full">
                    {targetText}
                  </p>
                </div>
              )}

              {item.reason && (
                <div className="ui-card-soft px-4 py-3 text-xs ui-muted break-words whitespace-pre-wrap min-w-0 w-full">
                  <span className="font-bold ui-text">Reason: </span>
                  {item.reason}
                </div>
              )}

              {item.suggestion && !showApplyFeature && (
                <div className="ui-card-soft px-4 py-3.5 min-w-0 w-full">
                  <span
                    className="text-[12px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1.5"
                    style={{ color: 'var(--primary)' }}
                  >
                    <Wand2 className="w-3.5 h-3.5" /> Suggestion
                  </span>
                  <p className="text-xs italic leading-relaxed break-words whitespace-pre-wrap text-[var(--foreground)] opacity-90 w-full">
                    {item.suggestion}
                  </p>
                </div>
              )}

              {showApplyFeature && targetText && replacementText && operation && (
                <div className="ui-card overflow-hidden min-w-0 w-full">
                  <div className="px-3.5 py-2.5 bg-[var(--surface-2)]">
                    <span
                      className="text-[12px] font-bold uppercase tracking-wider flex items-center gap-1.5"
                      style={{ color: 'var(--primary)' }}
                    >
                      <ArrowRightCircle className="w-3.5 h-3.5" />
                      {operation === 'insert_before'
                        ? 'Insert Before Target'
                        : operation === 'insert_after'
                          ? 'Insert After Target'
                          : 'Auto-Replace'}
                    </span>
                  </div>
                  <div className="p-3.5 space-y-3">
                    <div>
                      <span
                        className="text-[12px] font-bold uppercase tracking-wider mb-1 block"
                        style={{
                          color: operation === 'replace'
                            ? 'var(--error)'
                            : 'var(--muted-foreground)',
                        }}
                      >
                        {operation === 'replace' ? 'Before' : 'Target retained'}
                      </span>
                      <p
                        className={`rounded-md px-3 py-2 text-xs break-all whitespace-pre-wrap font-mono border-none w-full ${
                          operation === 'replace' ? 'line-through' : ''
                        }`}
                        style={{
                          background: operation === 'replace'
                            ? 'rgba(248,113,113,0.06)'
                            : 'var(--surface-2)',
                          color: 'var(--muted-foreground)',
                          textDecorationColor: 'rgba(248,113,113,0.4)',
                        }}
                      >
                        {targetText}
                      </p>
                    </div>
                    <div>
                      <span
                        className="text-[12px] font-bold uppercase tracking-wider mb-1 block"
                        style={{ color: 'var(--success)' }}
                      >
                        {operation === 'replace'
                          ? 'After'
                          : operation === 'insert_before'
                            ? 'Insert before target'
                            : 'Insert after target'}
                      </span>
                      <p
                        className="rounded-md px-3 py-2 text-xs break-all whitespace-pre-wrap font-mono border-none w-full"
                        style={{
                          background: 'rgba(74,222,128,0.06)',
                          color: 'var(--foreground)',
                          opacity: 0.9,
                        }}
                      >
                        {replacementText}
                      </p>
                    </div>
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() =>
                          onApplyClick(
                            targetText,
                            replacementText,
                            operation,
                            index,
                            feedbackKey
                          )
                        }
                        disabled={isApplied || isApplying}
                        className={`ui-btn ui-btn-sm ${
                          isApplied ? '' : 'ui-btn-primary'
                        }`}
                        style={
                          isApplied
                            ? {
                                background: 'rgba(74,222,128,0.1)',
                                color: 'var(--success)',
                              }
                            : {
                                  background: 'var(--primary)',
                                  color: 'var(--primary-foreground)',
                                }
                        }
                      >
                        {isApplied ? (
                          <>
                            <Check className="w-3.5 h-3.5" /> Applied
                          </>
                        ) : isApplying ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Applying
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-3.5 h-3.5" /> Apply
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Interactive Actions for Post-Polish Review Loop */}
              {!isAccepted && !isVerified && (
                <div className="mt-3 pt-3 border-t border-[var(--border)]/50 flex flex-wrap gap-2">
                  {/* Manual or incomplete suggestions remain copy-only. */}
                  {!showApplyFeature &&
                    (item.status === 'warning' || item.status === 'fail') &&
                    item.suggestion && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCopy(item.suggestion!, 'Suggestion');
                        }}
                        className="ui-btn ui-btn-xs ui-btn-muted"
                      >
                        <Copy className="w-3.5 h-3.5" /> Copy Suggestion
                      </button>
                    )}


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
                          if (onRemoveFeedbackAddition)
                            onRemoveFeedbackAddition(index);
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
                          setActiveSourceInput(
                            activeSourceInput === feedbackKey ? null : feedbackKey
                          );
                          setSourceText('');
                        }}
                        className="ui-btn ui-btn-primary ui-btn-xs"
                      >
                        <Link className="w-3.5 h-3.5" />
                        Add Source
                      </button>
                    </>
                  )}

                  {targetText &&
                    (item.category === 'Source Fidelity' ||
                      item.category === 'Internal Linking') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onRemoveFeedbackAddition)
                            onRemoveFeedbackAddition(index);
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

                  {targetText && (
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
              {activeSourceInput === feedbackKey && (
                <div
                  className="mt-3 p-3 rounded-md bg-[var(--surface-2)] space-y-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                    Enter Source URL
                  </div>
                  <div className="flex min-w-0 gap-2">
                    <Input
                      variant="surface"
                      type="text"
                      name={`feedback-source-${index}`}
                      autoComplete="off"
                      aria-label="Source URL"
                      placeholder="https://example.com/source…"
                      value={sourceText}
                      onChange={(e) => setSourceText(e.target.value)}
                      className="min-w-0 flex-1 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isSubmittingSource) {
                          e.preventDefault();
                          void onSubmitSource(index, feedbackKey);
                        }
                      }}
                    />
                    <button
                      onClick={() => void onSubmitSource(index, feedbackKey)}
                      disabled={isSubmittingSource}
                      className="ui-btn ui-btn-primary ui-btn-xs"
                    >
                      {isSubmittingSource && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
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

              {isApplied && (
                <div className="mt-2 ui-badge ui-badge-success w-max">
                  <Check className="w-3.5 h-3.5" />
                  <span>Applied to draft</span>
                </div>
              )}

              {/* Verified Banner */}
              {isVerified && (
                <div className="mt-3 overflow-hidden rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-100 shadow-[inset_3px_0_0_rgba(16,185,129,0.75)]">
                  <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-emerald-300">
                    <Check className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 truncate">
                      {item.verifiedSource
                        ? 'Source verified'
                        : 'Verified by editor'}
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
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onCopy(item.verifiedSource!, 'Source URL');
                                  }}
                                  className="ui-btn ui-btn-muted ui-btn-icon !h-7 !w-7 rounded-md border-emerald-500/20 bg-emerald-950/30 text-emerald-100 hover:bg-emerald-900/45"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                              }
                            />
                            <TooltipContent>Copy source URL</TooltipContent>
                          </Tooltip>
                          {sourceDisplay.isUrl && (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <a
                                    href={item.verifiedSource}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(event) => event.stopPropagation()}
                                    className="ui-btn ui-btn-muted ui-btn-icon !h-7 !w-7 rounded-md border-emerald-500/20 bg-emerald-950/30 text-emerald-100 hover:bg-emerald-900/45"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                }
                              />
                              <TooltipContent>Open source</TooltipContent>
                            </Tooltip>
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
}
