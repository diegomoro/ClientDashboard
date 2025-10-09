import { withRetry } from "@/utils/retry";

export async function sequentialProcess<T>(
  items: readonly T[],
  handler: (item: T, index: number) => Promise<void>,
  options?: { retries?: number; baseDelayMs?: number },
) {
  const retries = options?.retries ?? 4;
  const baseDelayMs = options?.baseDelayMs ?? 250;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    await withRetry(() => handler(item, index), { retries, baseDelayMs });
  }
}

export function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Run up to `limit` operations in parallel with retries.
export async function parallelLimit<T>(
  items: readonly T[],
  limit: number,
  handler: (item: T, index: number) => Promise<void>,
  options?: { retries?: number; baseDelayMs?: number },
) {
  if (items.length === 0 || limit <= 1) {
    return sequentialProcess(items, handler, options);
  }
  let index = 0;
  const workers: Promise<void>[] = [];
  const next = async () => {
    const current = index++;
    if (current >= items.length) return;
    const item = items[current]!;
    await withRetry(() => handler(item, current), {
      retries: options?.retries ?? 3,
      baseDelayMs: options?.baseDelayMs ?? 250,
    });
    await next();
  };
  for (let i = 0; i < Math.min(limit, items.length); i += 1) {
    workers.push(next());
  }
  await Promise.all(workers);
}
