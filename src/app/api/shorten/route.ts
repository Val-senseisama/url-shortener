import { NextRequest, NextResponse } from "next/server";
import { getRedisClient, cacheUrl, checkRateLimit } from "@/lib/redis";
import { createClient } from "@/lib/supabase/server";
import { encodeToBase62 } from "@/lib/base62";

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

function isValidUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidAlias(alias: string): boolean {
  const aliasRegex = /^[a-zA-Z0-9_-]{3,64}$/;
  return aliasRegex.test(alias) && !ROUTE_BLACKLIST.has(alias.toLowerCase());
}

export async function POST(request: NextRequest) {
  const clientIp = request.headers.get("x-real-ip") || "127.0.0.1";
  let redis;
  try {
    redis = await getRedisClient();
  } catch (err) {
    console.error("[Redis] Could not connect — rate limiting skipped:", err);
  }

  // 1. Rate Limiting: 10 writes per minute per IP
  if (redis) {
    const rateLimit = await checkRateLimit(redis, clientIp, "shorten", 10, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": "10",
            "X-RateLimit-Remaining": String(rateLimit.remaining),
            "X-RateLimit-Reset": String(rateLimit.reset),
          },
        }
      );
    }
  }

  // 2. Auth checking: Check if user is logged in
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url: originalUrl, customAlias, ttlSeconds } = body;

  // 3. Request Validations
  if (!originalUrl || !isValidUrl(originalUrl)) {
    return NextResponse.json(
      { error: "A valid original URL starting with http:// or https:// is required" },
      { status: 400 }
    );
  }

  if (customAlias && !isValidAlias(customAlias)) {
    return NextResponse.json(
      { error: "Custom alias must be 3-64 characters alphanumeric (including '-' and '_') and cannot be a reserved route." },
      { status: 400 }
    );
  }

  // Calculate Expiration
  let expiresAt: Date | null = null;
  if (ttlSeconds && typeof ttlSeconds === "number") {
    if (ttlSeconds <= 0) {
      return NextResponse.json({ error: "ttlSeconds must be a positive integer" }, { status: 400 });
    }
    expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  }

  try {
    let shortKey: string;

    if (customAlias) {
      // 4a. Write with custom alias
      const { data: inserted, error: insertErr } = await supabase
        .from("urls")
        .insert({
          short_key: customAlias,
          original_url: originalUrl,
          custom_alias: customAlias,
          user_id: user?.id || null,
          expires_at: expiresAt ? expiresAt.toISOString() : null
        })
        .select("short_key")
        .single();

      if (insertErr) {
        // Postgrest unique constraint error code
        if (insertErr.code === "23505") {
          return NextResponse.json({ error: "Custom alias is already taken" }, { status: 409 });
        }
        throw insertErr;
      }
      shortKey = inserted.short_key;
    } else {
      // 4b. Write auto-generated short key via sequence ID
      const { data: reserved, error: reserveErr } = await supabase
        .from("urls")
        .insert({
          short_key: "PENDING",
          original_url: originalUrl,
          user_id: user?.id || null,
          expires_at: expiresAt ? expiresAt.toISOString() : null
        })
        .select("id")
        .single();

      if (reserveErr) throw reserveErr;

      // Encode the generated identity ID
      shortKey = encodeToBase62(reserved.id);

      // Update the record with the generated shortKey
      const { error: updateErr } = await supabase
        .from("urls")
        .update({ short_key: shortKey })
        .eq("id", reserved.id);

      if (updateErr) throw updateErr;
    }

    // 5. Pre-cache in Redis (graceful if Redis is unavailable)
    const expiresStr = expiresAt ? expiresAt.toISOString() : null;
    if (redis) {
      await cacheUrl(redis, shortKey, originalUrl, expiresStr);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const shortUrl = `${appUrl}/${shortKey}`;

    return NextResponse.json(
      {
        success: true,
        shortKey,
        shortUrl,
        originalUrl,
        expiresAt: expiresStr
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating short URL:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
