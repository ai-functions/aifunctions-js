/**
 * Wraps a promise with an AbortController-based timeout.
 * Rejects with NxAiApiError (code: TIMEOUT) on expiry.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  createTimeoutError: () => Error
): Promise<T> {
  if (timeoutMs <= 0) return promise;

  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(createTimeoutError()), timeoutMs);
    promise
      .then((v) => {
        clearTimeout(id);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(id);
        reject(e);
      });
  });
}
