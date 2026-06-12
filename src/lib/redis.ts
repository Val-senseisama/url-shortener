import { createClient, type RedisClientType } from "redis";

// ─── Key Namespace ────────────────────────────────────────────────────────────
// All keys are prefixed with "snaplink:" to avoid collisions with other
// projects sharing this Redis instance.
const NS = "snaplink";

function key(...parts: string[]): string {
  return `${NS}:${parts.join(":")}`;
}

// ─── Singleton Client ─────────────────────────────────────────────────────────
let redisClient: RedisClientType | null = null;
let connectPromise: Promise<unknown> | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClient) {
    const url = process.env.REDIS_URL;

    if (!url || url.includes("placeholder")) {
      // Return a no-op stub in dev if Redis isn't configured
      throw new Error("REDIS_URL is not set. Please configure it in .env.local");
    }

    redisClient = createClient({
      url,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
        connectTimeout: 5000,
      },
    }) as RedisClientType;

    redisClient.on("error", (err) => {
      console.error("[Redis] Client error:", err.message);
    });
  }

  // Connect once; subsequent calls reuse the live connection
  if (!redisClient.isOpen) {
    if (!connectPromise) {
      connectPromise = redisClient.connect().finally(() => {
        connectPromise = null;
      });
    }
    await connectPromise;
  }

  return redisClient;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CachedUrl {
  originalUrl: string;
  expiresAt: string | null;
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

/**
 * Cache a URL mapping.
 * Key pattern: snaplink:url:{shortKey}
 * Default TTL: 24 hours, capped to remaining URL lifetime if it has an expiry.
 */
export async function cacheUrl(
  redis: RedisClientType,
  shortKey: string,
  originalUrl: string,
  expiresAt: string | null
): Promise<void> {
  const cacheKey = key("url", shortKey);
  const payload: CachedUrl = { originalUrl, expiresAt };

  let ttl = 86400; // 24 hours default
  if (expiresAt) {
    const remaining = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
    if (remaining <= 0) return; // Already expired — skip caching
    ttl = Math.min(ttl, remaining);
  }

  await redis.set(cacheKey, JSON.stringify(payload), { EX: ttl });
}

/**
 * Retrieve a cached URL mapping.
 * Key pattern: snaplink:url:{shortKey}
 */
export async function getCachedUrl(
  redis: RedisClientType,
  shortKey: string
): Promise<CachedUrl | null> {
  const data = await redis.get(key("url", shortKey));
  if (!data) return null;

  try {
    return JSON.parse(data) as CachedUrl;
  } catch {
    return null;
  }
}

/**
 * Evict a URL mapping from cache.
 * Key pattern: snaplink:url:{shortKey}
 */
export async function invalidateCache(
  redis: RedisClientType,
  shortKey: string
): Promise<void> {
  await redis.del(key("url", shortKey));
}

// ─── Rate Limiter ─────────────────────────────────────────────────────────────

/**
 * Sliding-window rate limiter using Redis Sorted Sets.
 * Key pattern: snaplink:rate:{ip}:{action}
 *
 * @param redis    - Connected RedisClientType instance
 * @param ip       - Client IP address
 * @param action   - Action identifier (e.g. "redirect" | "shorten")
 * @param limit    - Max requests allowed in the window
 * @param windowSec - Window size in seconds
 */
export async function checkRateLimit(
  redis: RedisClientType,
  ip: string,
  action: string,
  limit: number,
  windowSec: number
): Promise<{ allowed: boolean; remaining: number; reset: number }> {
  const rateKey = key("rate", ip, action);
  const now = Date.now();
  const clearBefore = now - windowSec * 1000;
  const member = `${now}-${Math.random().toString(36).slice(2)}`;

  // Pipeline: remove stale entries, add current request, count total, set expiry
  const multi = redis.multi();
  multi.zRemRangeByScore(rateKey, 0, clearBefore);
  multi.zAdd(rateKey, { score: now, value: member });
  multi.zCard(rateKey);
  multi.expire(rateKey, windowSec + 5);

  const results = await multi.exec();
  const currentCount = (results[2] as unknown) as number;

  const allowed = currentCount <= limit;
  const remaining = Math.max(0, limit - currentCount);
  const reset = Math.round((now + windowSec * 1000) / 1000);

  return { allowed, remaining, reset };
}
