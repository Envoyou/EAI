/**
 * Safely reads from a stream reader with a specified idle timeout.
 * Throws an error if no chunk is received within the timeout period.
 */
export async function readWithTimeout<T>(
  reader: ReadableStreamDefaultReader<T>,
  timeoutMs = 45000
): Promise<ReadableStreamReadResult<T>> {
  let timeoutId: NodeJS.Timeout | undefined;
  let didTimeout = false;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      reject(new Error(`Stream idle timeout: No response received from the server for ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([reader.read(), timeoutPromise]);
  } catch (error) {
    if (didTimeout) {
      await reader.cancel('Stream idle timeout').catch(() => undefined);
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
