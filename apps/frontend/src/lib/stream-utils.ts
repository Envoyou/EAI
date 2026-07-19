/**
 * Safely reads from a stream reader with a specified idle timeout.
 * Throws an error if no chunk is received within the timeout period.
 */
export class StreamIdleTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Stream idle timeout: No response received from the server for ${Math.round(timeoutMs / 1000)} seconds.`);
    this.name = 'StreamIdleTimeoutError';
  }
}

export async function readWithTimeout<T>(
  reader: ReadableStreamDefaultReader<T>,
  timeoutMs = 45000,
  abortRequest?: (reason: StreamIdleTimeoutError) => void
): Promise<ReadableStreamReadResult<T>> {
  let timeoutId: NodeJS.Timeout | undefined;
  let timeoutError: StreamIdleTimeoutError | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timeoutError = new StreamIdleTimeoutError(timeoutMs);
      reject(timeoutError);
    }, timeoutMs);
  });
  try {
    return await Promise.race([reader.read(), timeoutPromise]);
  } catch (error) {
    if (timeoutError) {
      abortRequest?.(timeoutError);
      await reader.cancel('Stream idle timeout').catch(() => undefined);
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
