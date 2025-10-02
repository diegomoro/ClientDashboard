type Bucket = {
  tokens: number;
  resetAt: number;
};

const store = new Map<string, Bucket>();

export function enforceRateLimit(key: string, options: { limit: number; windowMs: number }) {
  const now = Date.now();
  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { tokens: options.limit - 1, resetAt: now + options.windowMs });
    return;
  }
  if (bucket.tokens <= 0) {
    throw new Error("Rate limit exceeded");
  }
  bucket.tokens -= 1;
}
