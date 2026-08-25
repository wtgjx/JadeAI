/**
 * Lightweight in-memory sliding-window rate limiter.
 *
 * NOTE: This is per-instance state. On serverless platforms (Vercel) each
 * lambda instance has its own counter, so the effective limit is multiplied by
 * the number of concurrent instances. It is still a useful backstop against
 * single-source brute force, but for strict cross-instance limits use a shared
 * store (e.g. Upstash Redis) instead.
 */
type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

export function isRateLimited(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const bucket = buckets.get(key);
  if (!bucket) {
    buckets.set(key, { timestamps: [now] });
    return false;
  }
  const cutoff = now - windowMs;
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
  if (bucket.timestamps.length >= limit) {
    return true;
  }
  bucket.timestamps.push(now);
  return false;
}
