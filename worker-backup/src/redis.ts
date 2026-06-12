import { Redis } from "@upstash/redis";

export interface RedisEnv {
  REDIS_URL: string;
  REDIS_TOKEN: string;
}

export interface CachedUrl {
  originalUrl: string;
  expiresAt: string | null;
}

/**
 * Returns a configured Upstash Redis client.
 */
export function getRedisClient(env: RedisEnv): Redis {
  return new Redis({
    url: env.REDIS_URL,
    token: env.REDIS_TOKEN,
  });
}

/**
 * Cache URL mapping in Redis.
 * Sets a default cache expiration of 24 hours (86400 seconds) if no specific TTL exists.
 */
export async function cacheUrl(
  redis: Redis,
  shortKey: string,
  originalUrl: string,
  expiresAt: string | null
): Promise<void> {
  const cacheKey = `url:${shortKey}`;
  const payload: CachedUrl = { originalUrl, expiresAt };

  let ttl = 86400; // Default cache TTL: 24 hours
  if (expiresAt) {
    const timeRemaining = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
    if (timeRemaining <= 0) return; // Already expired, don't cache
    ttl = Math.min(ttl, timeRemaining);
  }

  await redis.set(cacheKey, JSON.stringify(payload), { ex: ttl });
}

/**
 * Retrieve cached URL mapping from Redis.
 */
export async function getCachedUrl(redis: Redis, shortKey: string): Promise<CachedUrl | null> {
  const data = await redis.get<string | CachedUrl>(`url:${shortKey}`);
  if (!data) return null;
  
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as CachedUrl;
    } catch {
      return null;
    }
  }
  return data as CachedUrl;
}

/**
 * Evict a URL mapping from the Redis cache.
 */
export async function invalidateCache(redis: Redis, shortKey: string): Promise<void> {
  await redis.del(`url:${shortKey}`);
}

/**
 * Sliding Window Rate Limiter using Redis Sorted Sets.
 * Tracks access frequencies per IP to limit writes and reads.
 */
export async function checkRateLimit(
  redis: Redis,
  ip: string,
  action: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; reset: number }> {
  const key = `rate_limit:${ip}:${action}`;
  const now = Date.now();
  const clearBefore = now - windowSeconds * 1000;
  const uniqueMember = `${now}-${Math.random()}`;

  const multi = redis.multi();
  // 1. Remove all items older than the sliding window boundary
  multi.zremrangebyscore(key, 0, clearBefore);
  // 2. Add the current access timestamp
  multi.zadd(key, { score: now, member: uniqueMember });
  // 3. Count total items inside the sliding window
  multi.zcard(key);
  // 4. Update the key expiry to prevent Redis memory leak
  multi.expire(key, windowSeconds + 5);

  const results = await multi.exec();
  const currentCount = results[2] as number;

  const allowed = currentCount <= limit;
  const remaining = Math.max(0, limit - currentCount);
  const reset = Math.round((now + windowSeconds * 1000) / 1000);

  return { allowed, remaining, reset };
}
