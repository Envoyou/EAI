import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  getStrategistTypewriterChunkSize,
  StrategistTypewriterQueue,
} from '@/lib/strategist-typewriter';

afterEach(() => {
  vi.useRealTimers();
});

describe('StrategistTypewriterQueue', () => {
  test('reveals queued text progressively and preserves appended chunks', () => {
    vi.useFakeTimers();
    const updates: string[] = [];
    const queue = new StrategistTypewriterQueue({
      intervalMs: 18,
      prefersReducedMotion: () => false,
    });

    queue.enqueue('message:thinking', 'First sentence. ', 'append', (text) => {
      updates.push(text);
    });
    queue.enqueue('message:thinking', 'Second sentence.', 'append', (text) => {
      updates.push(text);
    });

    vi.advanceTimersByTime(18);
    expect(updates.at(-1)).not.toBe('First sentence. Second sentence.');

    vi.runAllTimers();
    expect(updates.at(-1)).toBe('First sentence. Second sentence.');
    queue.dispose();
  });

  test('replaces an incompatible target from the beginning', () => {
    vi.useFakeTimers();
    const updates: string[] = [];
    const queue = new StrategistTypewriterQueue({
      intervalMs: 18,
      prefersReducedMotion: () => false,
    });

    queue.enqueue('message:content', 'Old answer', 'replace', (text) => {
      updates.push(text);
    });
    vi.advanceTimersByTime(36);
    queue.enqueue('message:content', 'New final answer', 'replace', (text) => {
      updates.push(text);
    });
    vi.advanceTimersByTime(18);

    expect(updates.at(-1)).toBe('N');
    vi.runAllTimers();
    expect(updates.at(-1)).toBe('New final answer');
    queue.dispose();
  });

  test('shows complete text immediately for reduced motion', () => {
    const onUpdate = vi.fn();
    const queue = new StrategistTypewriterQueue({
      prefersReducedMotion: () => true,
    });

    queue.enqueue('message:content', 'Complete answer', 'replace', onUpdate);

    expect(onUpdate).toHaveBeenCalledWith('Complete answer', true);
    queue.dispose();
  });

  test('uses larger batches only for longer backlogs', () => {
    expect(getStrategistTypewriterChunkSize(20)).toBe(1);
    expect(getStrategistTypewriterChunkSize(30)).toBe(3);
    expect(getStrategistTypewriterChunkSize(100)).toBe(5);
    expect(getStrategistTypewriterChunkSize(300)).toBe(8);
    expect(getStrategistTypewriterChunkSize(800)).toBe(14);
    expect(getStrategistTypewriterChunkSize(2_000)).toBe(24);
  });
});
