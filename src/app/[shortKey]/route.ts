import { NextRequest, NextResponse } from "next/server";
import { getRedisClient, getCachedUrl, cacheUrl, checkRateLimit } from "@/lib/redis";
import { createAdminClient } from "@/lib/supabase/server";

// TCP-based Redis (node-redis) requires the Node.js runtime, not edge.
// Vercel's Node.js runtime still provides fast global routing.
export const runtime = "nodejs";

const ROUTE_BLACKLIST = new Set([
  "api",
  "health",
  "metrics",
  "static",
  "admin",
  "login",
  "register",
  "dashboard",
  "favicon.ico",
]);

interface RouteContext {
  params: Promise<{
    shortKey: string;
  }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { shortKey } = await context.params;

  // 1. Bypass blacklist paths & asset requests
  if (ROUTE_BLACKLIST.has(shortKey.toLowerCase()) || shortKey.includes(".")) {
    return new Response("Not Found", { status: 404 });
  }

  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1";

  let redis;
  try {
    redis = await getRedisClient();
  } catch (err) {
    console.error("[Redis] Failed to connect:", err);
    // Fall through to DB lookup without rate-limit / cache
    return handleDbLookup(request, shortKey);
  }

  // 2. Rate Limiting — 100 redirects per second per IP
  const rateLimit = await checkRateLimit(redis, clientIp, "redirect", 100, 1);
  if (!rateLimit.allowed) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": "1",
        "X-RateLimit-Limit": "100",
        "X-RateLimit-Remaining": String(rateLimit.remaining),
        "X-RateLimit-Reset": String(rateLimit.reset),
      },
    });
  }

  // 3. L2 Cache (Redis)
  const cached = await getCachedUrl(redis, shortKey);
  if (cached) {
    return buildRedirect(request, shortKey, cached.originalUrl, cached.expiresAt);
  }

  // 4. Cache miss — query Supabase and populate cache
  return handleDbLookup(request, shortKey, redis);
}

async function handleDbLookup(
  request: NextRequest,
  shortKey: string,
  redis?: Awaited<ReturnType<typeof getRedisClient>>
) {
  const supabase = createAdminClient();
  const { data: mapping, error } = await supabase
    .from("urls")
    .select("original_url, expires_at, is_active")
    .eq("short_key", shortKey)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error(`[DB] Error fetching shortKey "${shortKey}":`, error.message);
  }

  if (!mapping) {
    return new Response("Short URL Not Found", { status: 404 });
  }

  // Populate cache for future requests
  if (redis) {
    await cacheUrl(redis, shortKey, mapping.original_url, mapping.expires_at);
  }

  return buildRedirect(request, shortKey, mapping.original_url, mapping.expires_at);
}

function buildRedirect(
  request: NextRequest,
  shortKey: string,
  destination: string,
  expiresAt: string | null
) {
  // Check expiry
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    return new Response("Short URL Has Expired", { status: 410 });
  }

  // Log analytics (fire and forget — don't await to avoid blocking redirect)
  logClick(request, shortKey);

  return NextResponse.redirect(destination, {
    status: 302,
    headers: { "Cache-Control": "no-store, must-revalidate" },
  });
}

function logClick(request: NextRequest, shortKey: string) {
  const countryCode = request.headers.get("x-vercel-ip-country") ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;
  const referrer = request.headers.get("referer") ?? null;

  const supabase = createAdminClient();
  supabase
    .from("analytics")
    .insert({
      short_key: shortKey,
      country_code: countryCode?.substring(0, 2) ?? null,
      user_agent: userAgent,
      referrer: referrer,
    })
    .then(({ error }) => {
      if (error) console.error("[Analytics] Failed to log click:", error.message);
    });
}
