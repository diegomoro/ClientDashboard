export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, options?: { retries?: number; baseDelayMs?: number }) {
  const retries = options?.retries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 500;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (attempt > retries) {
        throw error;
      }
      const backoff = baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 100);
      await sleep(backoff);
    }
  }
}
