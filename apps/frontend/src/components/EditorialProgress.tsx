'use client';

import { useEffect, useState } from 'react';
import { Check, Clock3, LoaderCircle } from 'lucide-react';
import { EditorialProcessStage } from '@eai/shared';

const PROCESS_STEPS: Array<{
  stage: EditorialProcessStage;
  label: string;
  description: string;
}> = [
  {
    stage: 'reviewing',
    label: 'Reviewing source',
    description: 'Reading the draft and editorial brief',
  },
  {
    stage: 'rewriting',
    label: 'Rewriting article',
    description: 'Building the Envoyou editorial version',
  },
  {
    stage: 'quality_gate',
    label: 'Quality and source checks',
    description: 'Checking fidelity, structure, and publish readiness',
  },
  {
    stage: 'seo',
    label: 'SEO metadata',
    description: 'Preparing title, description, slug, and tags',
  },
  {
    stage: 'finalizing',
    label: 'Finalizing draft',
    description: 'Saving the final editorial package',
  },
];

const formatElapsed = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0
    ? `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
    : `${remainingSeconds}s`;
};

interface EditorialProgressProps {
  stage: EditorialProcessStage;
  startedAt?: number | null;
  compact?: boolean;
  refining?: boolean;
}

export default function EditorialProgress({
  stage,
  startedAt,
  compact = false,
  refining = false,
}: EditorialProgressProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(() =>
    startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0
  );

  useEffect(() => {
    const updateElapsed = () => {
      setElapsedSeconds(
        startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0
      );
    };
    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(intervalId);
  }, [startedAt]);

  const activeIndex = Math.max(
    PROCESS_STEPS.findIndex((step) => step.stage === stage),
    0
  );
  const activeStep = PROCESS_STEPS[activeIndex];

  if (compact) {
    return (
      <div
        className="flex h-full min-h-0 flex-col p-6"
        role="status"
        aria-live="polite"
        aria-label={`${activeStep.label}. ${activeStep.description}`}
      >
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="ui-eyebrow mb-2">
              {refining ? 'Refining Draft' : 'Editorial Pipeline'}
            </p>
            <h3 className="font-serif text-lg font-semibold text-[var(--foreground)]">
              {activeStep.label}
            </h3>
            <p className="mt-1 text-xs leading-relaxed ui-muted">
              {activeStep.description}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-500/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-[var(--primary)]">
            <Clock3 className="h-3 w-3" />
            {formatElapsed(elapsedSeconds)}
          </span>
        </div>

        <div className="space-y-1">
          {PROCESS_STEPS.map((step, index) => {
            const complete = index < activeIndex;
            const active = index === activeIndex;
            return (
              <div
                key={step.stage}
                className={`relative flex min-h-12 items-center gap-3 rounded-xl px-3 transition-colors ${
                  active ? 'bg-primary-500/10' : ''
                }`}
              >
                <div
                  className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                    complete
                      ? 'border-primary-500 bg-primary-500 text-white'
                      : active
                        ? 'border-primary-500 bg-primary-500/10 text-[var(--primary)]'
                        : 'border-[var(--border)] bg-[var(--card)] ui-muted'
                  }`}
                >
                  {complete ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  ) : active ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />
                  )}
                </div>
                {index < PROCESS_STEPS.length - 1 && (
                  <span
                    className={`absolute left-[23px] top-[36px] h-6 w-px ${
                      complete ? 'bg-primary-500/60' : 'bg-[var(--border)]'
                    }`}
                    aria-hidden
                  />
                )}
                <div className="min-w-0">
                  <p className={`text-xs font-semibold ${active || complete ? 'ui-text' : 'ui-muted'}`}>
                    {step.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-auto pt-6 text-[11px] leading-relaxed ui-muted">
          Keep this tab open. The draft will appear as soon as writing begins.
        </p>
      </div>
    );
  }

  const progress = ((activeIndex + 0.45) / PROCESS_STEPS.length) * 100;

  return (
    <div
      className="border-b border-[var(--border)] bg-[var(--surface-1)] px-5 py-3"
      role="status"
      aria-live="polite"
      aria-label={`${activeStep.label}. ${activeStep.description}`}
    >
      <div className="mb-2 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-[var(--primary)]" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold ui-text">{activeStep.label}</p>
            <p className="truncate text-[10px] ui-muted">{activeStep.description}</p>
          </div>
        </div>
        <span className="shrink-0 font-mono text-[10px] tabular-nums ui-muted">
          {formatElapsed(elapsedSeconds)}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div
          className="editorial-progress-fill h-full rounded-full bg-[var(--primary)] transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
