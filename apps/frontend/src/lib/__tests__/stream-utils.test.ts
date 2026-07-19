import { describe, expect, test, vi } from 'vitest';
import { readWithTimeout } from '../stream-utils';

describe('readWithTimeout', () => {
  test('cancels the reader when the stream remains idle', async () => {
    vi.useFakeTimers();
    const reader = {
      read: vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined)),
      cancel: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;

    const read = readWithTimeout(reader, 1_000);
    const expectation = expect(read).rejects.toThrow('Stream idle timeout');
    await vi.advanceTimersByTimeAsync(1_000);
    await expectation;
    expect(reader.cancel).toHaveBeenCalledWith('Stream idle timeout');
    vi.useRealTimers();
  });
});
