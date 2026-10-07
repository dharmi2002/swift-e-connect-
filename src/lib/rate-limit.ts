type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Best-effort per-isolate guard; use an edge/WAF or durable store for multi-instance limits. */
export function allowRequest(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export function clearRateLimitBucketsForTests(): void {
  buckets.clear();
}
