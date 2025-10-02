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
