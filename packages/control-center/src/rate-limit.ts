export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

interface Bucket {
  timestamps: number[];
}

export class SlidingWindowRateLimiter {
  private buckets = new Map<string, Bucket>();
  private global: Bucket = { timestamps: [] };

  constructor(
    private readonly maxPerKey: number,
    private readonly windowMs: number,
    private readonly maxGlobal: number,
  ) {}

  attempt(key: string, now = Date.now()): RateLimitResult {
    this.prune(this.global, now);
    const bucket = this.buckets.get(key) || { timestamps: [] };
    this.prune(bucket, now);

    if (this.global.timestamps.length >= this.maxGlobal) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: this.retryAfter(this.global, now),
      };
    }
    if (bucket.timestamps.length >= this.maxPerKey) {
      this.buckets.set(key, bucket);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: this.retryAfter(bucket, now),
      };
    }

    bucket.timestamps.push(now);
    this.global.timestamps.push(now);
    this.buckets.set(key, bucket);
    return {
      allowed: true,
      remaining: Math.max(0, this.maxPerKey - bucket.timestamps.length),
      retryAfterMs: 0,
    };
  }

  private prune(bucket: Bucket, now: number): void {
    const cutoff = now - this.windowMs;
    bucket.timestamps = bucket.timestamps.filter((t) => t >= cutoff);
  }

  private retryAfter(bucket: Bucket, now: number): number {
    if (!bucket.timestamps.length) return this.windowMs;
    const earliest = bucket.timestamps[0]!;
    return Math.max(0, this.windowMs - (now - earliest));
  }
}
