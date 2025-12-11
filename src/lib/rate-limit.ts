type Bucket = { tokens: number; last: number };

// Simple in-memory limiter for dev. Replace with Redis in production.
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, { tokens = 20, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens, last: now };
  const elapsed = now - bucket.last;
  const refill = Math.floor(elapsed / windowMs) * tokens;
  bucket.tokens = Math.min(tokens, bucket.tokens + refill);
  bucket.last = now;
  if (bucket.tokens <= 0) {
    return { ok: false };
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return { ok: true };
}

