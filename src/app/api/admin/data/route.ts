import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient, checkIsAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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

  // 3. Create Admin client to bypass RLS and access auth.users + all URLs
  const adminSupabase = createAdminClient();

  try {
    // A. Fetch all users from Supabase Auth
    const { data: userData, error: usersError } = await adminSupabase.auth.admin.listUsers();
    if (usersError) throw usersError;

    // B. Fetch all URLs
    const { data: urlsData, error: urlsError } = await adminSupabase
      .from("urls")
      .select("*")
      .order("created_at", { ascending: false });
    if (urlsError) throw urlsError;

    // C. Fetch all Analytics clicks
    const { data: analyticsData, error: analyticsError } = await adminSupabase
      .from("analytics")
      .select("short_key, country_code, clicked_at")
      .order("clicked_at", { ascending: false });
    if (analyticsError) throw analyticsError;

    // Map user list to quick lookup map
    const userMap = new Map<string, string>();
    userData.users.forEach((u) => {
      if (u.email) userMap.set(u.id, u.email);
    });

    // Count clicks per short key
    const clickCounts: Record<string, number> = {};
    analyticsData?.forEach((c) => {
      clickCounts[c.short_key] = (clickCounts[c.short_key] ?? 0) + 1;
    });

    // Enrich URLs with user email and click count
    const enrichedUrls = (urlsData ?? []).map((url) => ({
      ...url,
      user_email: url.user_id ? userMap.get(url.user_id) ?? "Unknown User" : "Anonymous",
      clicks_count: clickCounts[url.short_key] ?? 0,
    }));

    // Calculate aggregated metrics
    const totalUrls = enrichedUrls.length;
    const totalClicks = analyticsData?.length ?? 0;
    const totalUsers = userData.users.length;
    const activeUrls = enrichedUrls.filter(
      (u) => u.is_active && (!u.expires_at || new Date(u.expires_at) > new Date())
    ).length;

    // Last 24 hours stats
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const links24h = enrichedUrls.filter((u) => new Date(u.created_at) > oneDayAgo).length;
    const clicks24h = (analyticsData ?? []).filter((c) => new Date(c.clicked_at) > oneDayAgo).length;

    return NextResponse.json({
      metrics: {
        totalUrls,
        totalClicks,
        totalUsers,
        activeUrls,
        links24h,
        clicks24h,
      },
      urls: enrichedUrls,
      users: userData.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        role: u.app_metadata?.role ?? u.user_metadata?.role ?? "user",
      })),
    });
  } catch (err: any) {
    console.error("[Admin API] Failed to load data:", err.message);
    return NextResponse.json({ error: err.message ?? "Internal Server Error" }, { status: 500 });
  }
}
