'use client';

import { useTranslations } from 'next-intl';
import type { ArticleWorkflowSnapshot } from '@eai/shared';
import { CompleteStatusIcon } from '@/components/ui/icons/status';

type ArticlePhase = 'draft' | 'review' | 'publication';

const phaseForStage = (stage: ArticleWorkflowSnapshot['stage']): ArticlePhase => {
  if (stage === 'drafting' || stage === 'refining') return 'draft';
  if (stage === 'review_required') return 'review';
  return 'publication';
};

const phases: ArticlePhase[] = ['draft', 'review', 'publication'];

export function ArticleWorkflowBar({ workflow }: { workflow: ArticleWorkflowSnapshot }) {
  const t = useTranslations('ArticleWorkflow');
  const activePhase = phaseForStage(workflow.stage);
  const activeIndex = phases.indexOf(activePhase);

  return (
    <section
      className="border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-2.5"
      aria-label={t('label')}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-2 sm:gap-3">
        {phases.map((phase, index) => {
          const complete = index < activeIndex || workflow.stage === 'exported';
          const active = phase === activePhase && workflow.stage !== 'exported';
          return (
            <div key={phase} className="contents">
              {index > 0 && (
                <div
                  className={`h-px min-w-4 flex-1 ${index <= activeIndex ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'}`}
                  aria-hidden="true"
                />
              )}
              <div
                className={`flex shrink-0 items-center gap-1.5 text-[11px] font-semibold ${
                  active || complete
                    ? 'text-[var(--foreground)]'
                    : 'text-[var(--muted-foreground)]'
                }`}
                aria-current={active ? 'step' : undefined}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                    complete
                      ? 'border-[var(--success)] bg-[var(--success)] text-white'
                      : active
                        ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                        : 'border-[var(--border)] bg-[var(--surface-2)]'
                  }`}
                >
                  {complete ? (
                    <CompleteStatusIcon className="h-3 w-3" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className={active ? '' : 'hidden sm:inline'}>{t(`phase.${phase}`)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-center text-[11px] text-[var(--muted-foreground)]" role="status">
        {t(`nextAction.${workflow.nextAction}`, {
          count: workflow.unresolvedDecisionCount,
        })}
      </p>
    </section>
  );
}
