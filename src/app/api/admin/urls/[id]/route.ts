import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient, checkIsAdmin } from "@/lib/supabase/server";
import { getRedisClient, invalidateCache } from "@/lib/redis";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

// UPDATE (toggle active/inactive)
export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  // 1. Verify user is logged in
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Verify user is an admin
  if (!checkIsAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { is_active } = body;

  if (typeof is_active !== "boolean") {
    return NextResponse.json({ error: "is_active must be a boolean" }, { status: 400 });
  }

  // 3. Update in Supabase (Service role bypasses RLS)
  const numericId = parseInt(id, 10);
  const adminSupabase = createAdminClient();
  const { data: updated, error } = await adminSupabase
    .from("urls")
    .update({ is_active })
    .eq("id", numericId)
    .select("short_key")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 4. Invalidate Redis cache to reflect changes immediately in redirects
  try {
    const redis = await getRedisClient();
    await invalidateCache(redis, updated.short_key);
  } catch (redisErr) {
    console.error("[Redis] Failed to invalidate cache on admin update:", redisErr);
  }

  return NextResponse.json({ success: true, updated });
}

// DELETE URL as admin
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  // 1. Verify user is logged in
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Verify user is an admin
  if (!checkIsAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Fetch url to get shortKey for cache invalidation
  const numericId = parseInt(id, 10);
  const adminSupabase = createAdminClient();
  const { data: targetUrl, error: fetchErr } = await adminSupabase
    .from("urls")
    .select("short_key")
    .eq("id", numericId)
    .single();

  if (fetchErr || !targetUrl) {
    return NextResponse.json({ error: "URL not found" }, { status: 404 });
  }

  // 4. Delete URL
  const { error: deleteErr } = await adminSupabase.from("urls").delete().eq("id", numericId);
  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  // 5. Invalidate Redis cache
  try {
    const redis = await getRedisClient();
    await invalidateCache(redis, targetUrl.short_key);
  } catch (redisErr) {
    console.error("[Redis] Failed to invalidate cache on admin delete:", redisErr);
  }

  return NextResponse.json({ success: true });
}
