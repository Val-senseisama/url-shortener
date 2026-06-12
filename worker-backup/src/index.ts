import { getDbClient, getUrlByKey, createShortUrl, logRedirectClick } from "./db";
import { getRedisClient, getCachedUrl, cacheUrl, checkRateLimit } from "./redis";

export interface Env {
  DATABASE_URL: string;
  REDIS_URL: string;
  REDIS_TOKEN: string;
}

const ROUTE_BLACKLIST = new Set([
  "api",
  "health",
  "metrics",
  "static",
  "admin",
  "login",
  "register",
  "dashboard",
  "favicon.ico"
]);

/**
 * Validates whether a string is a valid HTTP/HTTPS URL.
 */
function isValidUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validates a custom short key alias format.
 */
function isValidAlias(alias: string): boolean {
  const aliasRegex = /^[a-zA-Z0-9_-]{3,64}$/;
  return aliasRegex.test(alias) && !ROUTE_BLACKLIST.has(alias.toLowerCase());
}

/**
 * Log redirection click event asynchronously to not block client redirection response.
 */
async function logClickBackground(
  env: Env,
  shortKey: string,
  countryCode: string | null,
  userAgent: string | null,
  referrer: string | null
): Promise<void> {
  let client = null;
  try {
    client = await getDbClient(env);
    await logRedirectClick(client, shortKey, countryCode, userAgent, referrer);
  } catch (error) {
    console.error(`Error logging analytics background click for ${shortKey}:`, error);
  } finally {
    if (client) {
      try {
        await client.end();
      } catch (e) {
        console.error("Error closing pg client in background:", e);
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.split("/").filter(Boolean);
    const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";

    const redis = getRedisClient(env);

    // --- HEALTH CHECK ---
    if (url.pathname === "/health" || url.pathname === "/api/health") {
      return new Response(JSON.stringify({ status: "healthy", timestamp: new Date() }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // --- API: CREATE SHORT URL ---
    if (request.method === "POST" && url.pathname === "/api/shorten") {
      // 1. Rate Limiting: 10 writes per minute per IP
      const rateLimit = await checkRateLimit(redis, clientIp, "shorten", 10, 60);
      if (!rateLimit.allowed) {
        return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Limit": "10",
            "X-RateLimit-Remaining": String(rateLimit.remaining),
            "X-RateLimit-Reset": String(rateLimit.reset)
          }
        });
      }

      let body: any;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      const { url: originalUrl, customAlias, ttlSeconds } = body;

      // 2. Validate Original URL
      if (!originalUrl || !isValidUrl(originalUrl)) {
        return new Response(JSON.stringify({ error: "A valid original URL starting with http:// or https:// is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      // 3. Validate Custom Alias (if provided)
      if (customAlias && !isValidAlias(customAlias)) {
        return new Response(
          JSON.stringify({
            error: "Custom alias must be 3-64 characters alphanumeric (including '-' and '_') and cannot be a reserved path name."
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Calculate Expiration
      let expiresAt: Date | null = null;
      if (ttlSeconds && typeof ttlSeconds === "number") {
        if (ttlSeconds <= 0) {
          return new Response(JSON.stringify({ error: "ttlSeconds must be a positive integer" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }
        expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      }

      let pgClient = null;
      try {
        pgClient = await getDbClient(env);
        const shortKey = await createShortUrl(pgClient, originalUrl, customAlias, expiresAt);

        // Pre-cache the successfully created mapping in Redis
        const expiresStr = expiresAt ? expiresAt.toISOString() : null;
        await cacheUrl(redis, shortKey, originalUrl, expiresStr);

        const shortUrl = `${url.protocol}//${url.host}/${shortKey}`;

        return new Response(
          JSON.stringify({
            success: true,
            shortKey,
            shortUrl,
            originalUrl,
            expiresAt: expiresStr
          }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" }
          }
        );
      } catch (error: any) {
        console.error("Error creating short URL:", error);
        // Handle database unique key constraint violation (Postgres error code 23505)
        if (error.code === "23505") {
          return new Response(JSON.stringify({ error: "Custom alias is already taken" }), {
            status: 409,
            headers: { "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({ error: "Internal Server Error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      } finally {
        if (pgClient) {
          await pgClient.end();
        }
      }
    }

    // --- REDIRECTION PATH ---
    if (request.method === "GET" && path.length === 1) {
      const shortKey = path[0];

      // Block reserved paths and file requests
      if (ROUTE_BLACKLIST.has(shortKey.toLowerCase()) || shortKey.includes(".")) {
        return new Response("Not Found", { status: 404 });
      }

      // 1. Rate Limiting: 100 reads per second per IP on redirections
      const rateLimit = await checkRateLimit(redis, clientIp, "redirect", 100, 1);
      if (!rateLimit.allowed) {
        return new Response("Too Many Requests", {
          status: 429,
          headers: {
            "Retry-After": "1",
            "X-RateLimit-Limit": "100",
            "X-RateLimit-Remaining": String(rateLimit.remaining),
            "X-RateLimit-Reset": String(rateLimit.reset)
          }
        });
      }

      // 2. Query cache (L2 Cache)
      let destination: string | null = null;
      let expiresAtStr: string | null = null;

      const cached = await getCachedUrl(redis, shortKey);
      if (cached) {
        destination = cached.originalUrl;
        expiresAtStr = cached.expiresAt;
      } else {
        // Cache Miss: Query PostgreSQL
        let pgClient = null;
        try {
          pgClient = await getDbClient(env);
          const mapping = await getUrlByKey(pgClient, shortKey);

          if (mapping && mapping.is_active) {
            destination = mapping.original_url;
            expiresAtStr = mapping.expires_at;

            // Cache it back to Redis
            await cacheUrl(redis, shortKey, destination, expiresAtStr);
          }
        } catch (error) {
          console.error(`Database error fetching shortKey ${shortKey}:`, error);
        } finally {
          if (pgClient) {
            await pgClient.end();
          }
        }
      }

      // 3. Process redirect/expiration outcomes
      if (!destination) {
        return new Response("Short URL Not Found", { status: 404 });
      }

      if (expiresAtStr && new Date(expiresAtStr).getTime() < Date.now()) {
        return new Response("Short URL Has Expired", { status: 410 });
      }

      // 4. Asynchronously log click details to Postgres without blocking client response
      const countryCode = request.headers.get("CF-IPCountry");
      const userAgent = request.headers.get("User-Agent");
      const referrer = request.headers.get("Referer");

      ctx.waitUntil(logClickBackground(env, shortKey, countryCode, userAgent, referrer));

      // 5. Respond with HTTP 302 Found redirect
      return new Response(null, {
        status: 302,
        headers: {
          Location: destination,
          "Cache-Control": "no-store, must-revalidate"
        }
      });
    }

    // Default Fallback
    return new Response("Not Found", { status: 404 });
  }
};
