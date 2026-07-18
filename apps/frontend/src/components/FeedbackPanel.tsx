'use client';

import {
  AlertCircle,
  FileSearch,
  CheckCircle2,
  ListChecks,
  Wand2,
  Copy,
  ChevronDown,
  ChevronUp,
  Flag,
} from 'lucide-react';
import { motion, Variants, AnimatePresence } from 'framer-motion';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import EditorialProgress from '@/components/EditorialProgress';
import { FeedbackPanelProps } from './feedback-panel/types';
import { useFeedbackActions } from './feedback-panel/hooks/useFeedbackActions';
import { QualityGateSummary } from './feedback-panel/components/QualityGateSummary';
import { FeedbackItemCard } from './feedback-panel/components/FeedbackItemCard';
import {
  countAutoApplicableFeedback,
  getFeedbackIdentity,
} from './feedback-panel/utils';

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 320, damping: 26 },
  },
};

const BENIGN_DISPLAY_FLAG_PATTERN =
  /^(?:none|n\/a|all clear|no (?:factual )?(?:risks?|issues?|critical flags?)(?: (?:were )?found)?\b.*|tidak ada (?:risiko|masalah|pelanggaran|flag|temuan)\b.*)$/i;

const CopyButton = ({
  text,
  label,
  onCopy,
}: {
  text: string;
  label: string;
  onCopy: (text: string, label: string) => void;
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <button
          onClick={() => onCopy(text, label)}
          className="ml-2 ui-btn ui-btn-muted ui-btn-icon !h-7 !w-7 rounded-md"
          aria-label={`Copy ${label}`}
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      }
    />
    <TooltipContent side="top" className="text-xs">
      {`Copy ${label}`}
    </TooltipContent>
  </Tooltip>
);

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
  onFixFeedbackWithEAI,
  isTargetedFixing = null,
}: FeedbackPanelProps) {
  const {
    expandedFeedback,
    isSEOExpanded,
    setIsSEOExpanded,
    activeSourceInput,
    setActiveSourceInput,
    sourceText,
    setSourceText,
    applyingFeedback,
    submittingSource,
    setSubmittingSource,
    toggleFeedback,
    handleApplyClick,
    handleCopy,
    handleCopySEOPack,
  } = useFeedbackActions(result, onApplyFix);

  if (result.status === 'idle') {
    return (
      <div className="ui-state-card flex h-full min-h-0 flex-col items-center justify-center p-8 text-center">
        <div className="w-10 h-10 rounded-md flex items-center justify-center mb-4 bg-[var(--surface-2)]">
          <FileSearch className="w-7 h-7 ui-muted" />
        </div>
        <h3 className="text-base font-semibold mb-1.5 ui-text">No Analysis Yet</h3>
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

  if (result.status === 'error') {
    return (
      <div className="ui-state-card flex h-full min-h-0 flex-col justify-center p-6">
        <div className="ui-alert ui-alert-danger flex-col p-5">
          <div className="flex items-center gap-2 text-[var(--error)]">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="font-semibold text-sm">Analysis Failed</span>
          </div>
          <p className="text-sm leading-relaxed ui-muted">
            {result.errorMessage ||
              'Unable to connect to the AI server. Please check your connection and try again.'}
          </p>
        </div>
      </div>
    );
  }

  const readiness = result.readiness;
  const isManualFallback = result.responseMode === 'manual_fallback';
  const isCompactFallback = result.responseMode === 'compact';
  const autoApplicableCount = countAutoApplicableFeedback(
    result.feedback,
    isManualFallback
  );
  const visibleFlags = (result.flags ?? []).filter(
    (flag) => !BENIGN_DISPLAY_FLAG_PATTERN.test(flag.trim())
  );
  const hasCriticalFlags = readiness === 'blocked';

  return (
    <div className="ui-panel h-full min-w-0 w-full overflow-hidden">
      <QualityGateSummary
        result={result}
        title={title}
        isFocused={isFocused}
        onFocusToggle={onFocusToggle}
        onApplyAll={onApplyAll}
        autoApplicableCount={autoApplicableCount}
        isManualFallback={isManualFallback}
        isCompactFallback={isCompactFallback}
      />

      <div className="relative min-h-0 flex-1 overflow-y-auto p-3 w-full max-w-full overflow-x-hidden min-w-0">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-3"
        >
          {result.changes && result.changes.length > 0 && (
            <motion.div
              variants={itemVariants}
              className="inspector-section overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 pt-3 text-xs font-semibold ui-text">
                <ListChecks className="h-4 w-4 text-[var(--success)]" />
                What EAI improved
              </div>
              <ul className="space-y-2 px-3 pb-3 pt-2">
                {result.changes.map((change, index) => (
                  <li
                    key={index}
                    className="flex gap-2 text-xs leading-relaxed ui-muted min-w-0"
                  >
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--success)]" />
                    <span className="flex-1 min-w-0 break-words whitespace-pre-wrap">
                      {change}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          {result.generatedMetadata && (
            <motion.div
              variants={itemVariants}
              className="inspector-section overflow-hidden"
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setIsSEOExpanded((p) => !p)}
                  aria-expanded={isSEOExpanded}
                  className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent text-left text-xs font-semibold text-[var(--foreground)] cursor-pointer hover:bg-[var(--surface-2)] px-2 py-1.5 -ml-2 rounded-md transition-colors"
                >
                  <Wand2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="flex-1 min-w-0 break-words whitespace-normal text-left">
                    SEO Metadata
                  </span>
                  {isSEOExpanded ? (
                    <ChevronUp className="ml-auto w-4 h-4" />
                  ) : (
                    <ChevronDown className="ml-auto w-4 h-4" />
                  )}
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
                    className="overflow-hidden min-w-0 w-full"
                  >
                    <div className="px-3 pb-3 pt-1 space-y-3 text-xs min-w-0 w-full overflow-hidden">
                      {[
                        {
                          label: 'Title',
                          value: result.generatedMetadata.title,
                        },
                        {
                          label: 'Slug',
                          value: result.generatedMetadata.slug,
                          mono: true,
                        },
                        {
                          label: 'Meta Title',
                          value: result.generatedMetadata.metaTitle,
                        },
                        {
                          label: 'Excerpt',
                          value: result.generatedMetadata.excerpt,
                          italic: true,
                        },
                        {
                          label: 'Meta Description',
                          value: result.generatedMetadata.metaDescription,
                        },
                        {
                          label: 'Cover Image Alt',
                          value: result.generatedMetadata.coverImageAltText,
                        },
                      ].map(({ label, value, mono, italic }) =>
                        value ? (
                          <div key={label}>
                            <div className="flex items-center justify-between mb-1.5 px-0.5">
                              <span className="font-bold text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                {label}
                              </span>
                              <CopyButton
                                text={value}
                                label={label}
                                onCopy={handleCopy}
                              />
                            </div>
                            <div
                              className={`ui-card-soft px-3.5 py-2.5 break-words whitespace-pre-wrap text-[var(--foreground)] opacity-85 ${
                                mono ? 'font-mono text-[11px] break-all' : ''
                              } ${italic ? 'italic' : ''}`}
                            >
                              {value}
                            </div>
                          </div>
                        ) : null
                      )}
                      {result.generatedMetadata.tags &&
                        result.generatedMetadata.tags.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-1.5 px-0.5">
                              <span className="font-bold text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                Tags
                              </span>
                              <CopyButton
                                text={result.generatedMetadata.tags.join(', ')}
                                label="Tags"
                                onCopy={handleCopy}
                              />
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

          {visibleFlags.length > 0 && (
            <motion.div
              variants={itemVariants}
              className={`ui-alert flex-col p-3 relative overflow-hidden ${
                hasCriticalFlags ? 'ui-alert-danger' : 'ui-alert-warning'
              }`}
              style={{
                borderLeft: `3.5px solid ${
                  hasCriticalFlags ? 'var(--error)' : 'var(--warning)'
                }`,
              }}
            >
              <h4
                className="flex items-center gap-2 text-xs font-semibold mb-2"
                style={{
                  color: hasCriticalFlags ? 'var(--error)' : 'var(--warning)',
                }}
              >
                <Flag className="w-3.5 h-3.5" />
                {hasCriticalFlags ? 'Critical Flags' : 'Review Flags'}
              </h4>
              <ul className="list-disc pl-4 space-y-1">
                {visibleFlags.map((flag, i) => (
                  <li
                    key={i}
                    className="text-xs leading-relaxed break-words whitespace-pre-wrap"
                  >
                    {flag}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          {result.feedback && result.feedback.length > 0 && (
            <motion.div
              variants={itemVariants}
              className="flex items-center justify-between px-1 pt-1"
            >
              <h3 className="text-[11px] font-semibold ui-muted">
                Remaining Checks
              </h3>
              <span className="text-[11px] ui-muted">
                {result.feedback.length}
              </span>
            </motion.div>
          )}

          {result.feedback?.map((item, index) => {
            const feedbackKey = getFeedbackIdentity(item, index);
            return (
              <FeedbackItemCard
                key={feedbackKey}
                item={item}
                index={index}
                feedbackKey={feedbackKey}
                isExpanded={expandedFeedback.has(feedbackKey)}
                isActiveCard={activeFeedbackIndex === index}
                isApplied={Boolean(item.isApplied)}
                isApplying={applyingFeedback === feedbackKey}
                isSubmittingSource={submittingSource === feedbackKey}
                autoApplyDisabled={isManualFallback}
                activeSourceInput={activeSourceInput}
                sourceText={sourceText}
                isTargetedFixing={isTargetedFixing}
                onToggleFeedback={toggleFeedback}
                onActiveFeedbackChange={onActiveFeedbackChange}
                onHoveredFeedbackChange={onHoveredFeedbackChange}
                onApplyClick={handleApplyClick}
                onCopy={handleCopy}
                onAcceptFeedback={onAcceptFeedback}
                onRemoveFeedbackAddition={onRemoveFeedbackAddition}
                onSubmitSource={async (feedbackIndex, key) => {
                  if (!onAddFeedbackSource || submittingSource !== null) return;
                  setSubmittingSource(key);
                  try {
                    const saved = await onAddFeedbackSource(feedbackIndex, sourceText);
                    if (saved) {
                      setActiveSourceInput(null);
                      setSourceText('');
                    }
                  } finally {
                    setSubmittingSource(null);
                  }
                }}
                onFixFeedbackWithEAI={onFixFeedbackWithEAI}
                setActiveSourceInput={setActiveSourceInput}
                setSourceText={setSourceText}
              />
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
