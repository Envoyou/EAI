export type StrategistTypewriterMode = 'append' | 'replace';

type QueueEntry = {
  displayed: string;
  target: string;
  onUpdate: (text: string, complete: boolean) => void;
};

type StrategistTypewriterQueueOptions = {
  intervalMs?: number;
  prefersReducedMotion?: () => boolean;
};

export const getStrategistTypewriterChunkSize = (remaining: number): number => {
  if (remaining > 1_200) return 24;
  if (remaining > 480) return 14;
  if (remaining > 160) return 8;
  if (remaining > 60) return 5;
  if (remaining > 24) return 3;
  return 1;
};

export class StrategistTypewriterQueue {
  private readonly entries = new Map<string, QueueEntry>();
  private readonly intervalMs: number;
  private readonly prefersReducedMotion: () => boolean;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: StrategistTypewriterQueueOptions = {}) {
    this.intervalMs = options.intervalMs ?? 18;
    this.prefersReducedMotion =
      options.prefersReducedMotion ??
      (() =>
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  enqueue(
    key: string,
    text: string,
    mode: StrategistTypewriterMode,
    onUpdate: QueueEntry['onUpdate']
  ): void {
    const existing = this.entries.get(key);
    const target =
      mode === 'append' ? `${existing?.target ?? ''}${text}` : text;

    if (this.prefersReducedMotion()) {
      this.entries.delete(key);
      onUpdate(target, true);
      this.stopTimerWhenIdle();
      return;
    }

    const displayed =
      mode === 'replace' &&
      existing &&
      !target.startsWith(existing.displayed)
        ? ''
        : existing?.displayed ?? '';

    this.entries.set(key, {
      displayed,
      target,
      onUpdate,
    });
    this.startTimer();
  }

  drop(key: string): void {
    this.entries.delete(key);
    this.stopTimerWhenIdle();
  }

  dropByPrefix(prefix: string): void {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
    this.stopTimerWhenIdle();
  }

  clear(): void {
    this.entries.clear();
    this.stopTimer();
  }

  isActive(): boolean {
    return this.entries.size > 0;
  }

  dispose(): void {
    this.clear();
  }

  private startTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  private tick(): void {
    for (const [key, entry] of this.entries) {
      const remaining = entry.target.length - entry.displayed.length;
      if (remaining <= 0) {
        entry.onUpdate(entry.target, true);
        this.entries.delete(key);
        continue;
      }

      const nextLength =
        entry.displayed.length + getStrategistTypewriterChunkSize(remaining);
      entry.displayed = entry.target.slice(0, nextLength);
      const complete = entry.displayed.length >= entry.target.length;
      entry.onUpdate(entry.displayed, complete);
      if (complete) this.entries.delete(key);
    }
    this.stopTimerWhenIdle();
  }

  private stopTimerWhenIdle(): void {
    if (this.entries.size === 0) this.stopTimer();
  }

  private stopTimer(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
