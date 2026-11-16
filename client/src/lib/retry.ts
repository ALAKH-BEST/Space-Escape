/** A response that came back with an error status. */
export class HttpError extends Error {
  constructor(public readonly status: number) {
    super(`Request failed (${status})`);
    this.name = "HttpError";
  }
}

/**
 * Worth trying again: the connection dropped or timed out, or the server was busy or briefly down.
 * Anything else (the run was rejected, the login expired, the reply was malformed) will fail the same way again.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof HttpError) {
    return error.status >= 500 || error.status === 408 || error.status === 429;
  }
  // fetch rejects with a TypeError when the network is down, and with an AbortError on our own timeout.
  return error instanceof TypeError || (error instanceof Error && error.name === "AbortError");
}

export type RetryOptions = {
  /** Wait before each retry, in order. Its length is the number of retries. */
  delaysMs: number[];
  shouldRetry?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs `task`, retrying after each delay while the failure is worth retrying. Reports how many attempts it took. */
export async function withRetries<T>(
  task: (attempt: number) => Promise<T>,
  { delaysMs, shouldRetry = isRetryableError, sleep = realSleep }: RetryOptions,
): Promise<{ value: T; attempts: number }> {
  for (let attempt = 1; ; attempt++) {
    try {
      return { value: await task(attempt), attempts: attempt };
    } catch (error) {
      const delay = delaysMs[attempt - 1];
      if (delay === undefined || !shouldRetry(error)) throw error;
      await sleep(delay);
    }
  }
}
