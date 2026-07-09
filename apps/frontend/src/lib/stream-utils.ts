/**
 * Safely reads from a stream reader with a specified idle timeout.
 * Throws an error if no chunk is received within the timeout period.
 */
export async function readWithTimeout<T>(
  reader: ReadableStreamDefaultReader<T>,
  timeoutMs = 45000
): Promise<ReadableStreamReadResult<T>> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Stream idle timeout: No response received from the server for ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([reader.read(), timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
