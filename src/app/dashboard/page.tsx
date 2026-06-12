"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import {
  StatCardSkeleton, UrlRowSkeleton, AnalyticsSidebarSkeleton,
} from "@/components/ui/Skeleton";
import {
  Link2, Plus, Copy, Check, Trash2, BarChart3, Globe,
  Compass, Clock, ExternalLink, RefreshCw, AlertCircle, Loader2, Eye, EyeOff,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface UrlRecord {
  id: number;
  short_key: string;
  original_url: string;
  custom_alias: string | null;
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
  clicks_count?: number;
}

interface ClickRecord {
  short_key: string;
  clicked_at: string;
  country_code: string | null;
  user_agent: string | null;
  referrer: string | null;
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [urls, setUrls] = useState<UrlRecord[]>([]);
  const [clicks, setClicks] = useState<ClickRecord[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Form states
  const [inputUrl, setInputUrl] = useState("");
  const [customAlias, setCustomAlias] = useState("");
  const [expiryPreset, setExpiryPreset] = useState("never");
  const [ttlHours, setTtlHours] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [urlError, setUrlError] = useState("");

  // ─── Auth & Initial Load ─────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUser(user);
      await loadDashboardData(user.id);
      setLoading(false);
    })();
  }, []);

  // ─── Data Loading ─────────────────────────────────────────────────────────────
  const loadDashboardData = async (userId: string) => {
    const { data: urlData, error: urlErr } = await supabase
      .from("urls")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (urlErr) {
      toast({ type: "error", title: "Failed to load links", message: urlErr.message });
      return;
    }

    const rows = (urlData ?? []) as UrlRecord[];
    const keys = rows.map((u) => u.short_key);

    let clickData: ClickRecord[] = [];
    if (keys.length > 0) {
      const { data, error: clickErr } = await supabase
        .from("analytics")
        .select("*")
        .in("short_key", keys)
        .order("clicked_at", { ascending: false });

      if (clickErr) {
        toast({ type: "warning", title: "Analytics unavailable", message: clickErr.message });
      } else {
        clickData = (data ?? []) as ClickRecord[];
      }
    }

    setClicks(clickData);

    const countsMap = clickData.reduce<Record<string, number>>((acc, c) => {
      acc[c.short_key] = (acc[c.short_key] ?? 0) + 1;
      return acc;
    }, {});

    const enriched = rows.map((u) => ({ ...u, clicks_count: countsMap[u.short_key] ?? 0 }));
    setUrls(enriched);

    setSelectedKey((prev) => prev ?? (enriched[0]?.short_key ?? null));
  };

  // ─── Refresh ─────────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    if (!user || refreshing) return;
    setRefreshing(true);
    await loadDashboardData(user.id);
    setRefreshing(false);
    toast({ type: "success", title: "Refreshed", message: "Your link data is up to date." });
  };

  // ─── Create Short URL ─────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError("");

    if (!inputUrl) { setUrlError("Please enter a destination URL."); return; }
    try { new URL(inputUrl); } catch {
      setUrlError("URL must start with http:// or https://");
      return;
    }

    setFormLoading(true);
    try {
      let finalTtlSeconds: number | null = null;
      if (expiryPreset === "custom") {
        if (ttlHours.trim()) {
          finalTtlSeconds = parseInt(ttlHours) * 3600;
        }
      } else if (expiryPreset !== "never") {
        finalTtlSeconds = parseInt(expiryPreset) * 3600;
      }

      const payload: Record<string, unknown> = { url: inputUrl };
      if (customAlias.trim()) payload.customAlias = customAlias.trim();
      if (finalTtlSeconds !== null) payload.ttlSeconds = finalTtlSeconds;

      const res = await fetch("/api/shorten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        toast({ type: "error", title: "Failed to create link", message: data.error });
      } else {
        toast({
          type: "success",
          title: "Short URL created!",
          message: `${window.location.origin}/${data.shortKey}`,
        });
        setInputUrl("");
        setCustomAlias("");
        setExpiryPreset("never");
        setTtlHours("");
        await loadDashboardData(user.id);
        setSelectedKey(data.shortKey);
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Could not reach the API server." });
    } finally {
      setFormLoading(false);
    }
  };

  // ─── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async (shortKey: string) => {
    setDeletingKey(shortKey);
    try {
      const { error } = await supabase.from("urls").delete().eq("short_key", shortKey);
      if (error) throw error;
      toast({ type: "success", title: "Link deleted", message: `/${shortKey} has been removed.` });
      setUrls((prev) => prev.filter((u) => u.short_key !== shortKey));
      if (selectedKey === shortKey) {
        const remaining = urls.filter((u) => u.short_key !== shortKey);
        setSelectedKey(remaining[0]?.short_key ?? null);
      }
    } catch (err: any) {
      toast({ type: "error", title: "Delete failed", message: err?.message });
    } finally {
      setDeletingKey(null);
    }
  };

  // ─── Copy ─────────────────────────────────────────────────────────────────────
  const copyLink = async (key: string) => {
    const shortUrl = `${window.location.origin}/${key}`;
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopiedKey(key);
      toast({ type: "success", title: "Copied!", message: shortUrl });
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast({ type: "error", title: "Copy failed", message: "Could not access clipboard." });
    }
  };

  // ─── Analytics helpers ────────────────────────────────────────────────────────
  const totalUrls = urls.length;
  const totalClicks = clicks.length;
  const activeUrls = urls.filter((u) => !u.expires_at || new Date(u.expires_at) > new Date()).length;
  const expiredUrls = totalUrls - activeUrls;

  const selectedUrl = urls.find((u) => u.short_key === selectedKey);
  const selectedClicks = clicks.filter((c) => c.short_key === selectedKey);

  const countryBreakdown = selectedClicks.reduce<Record<string, number>>((acc, c) => {
    const k = c.country_code ?? "Unknown";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const referrerBreakdown = selectedClicks.reduce<Record<string, number>>((acc, c) => {
    let ref = "Direct";
    if (c.referrer) {
      try { ref = new URL(c.referrer).hostname || "Direct"; } catch { ref = c.referrer; }
    }
    acc[ref] = (acc[ref] ?? 0) + 1;
    return acc;
  }, {});

  const topCountries = Object.entries(countryBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topReferrers = Object.entries(referrerBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-slate-100">

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-6 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Your Workspace</h1>
          <p className="text-sm text-slate-400 mt-1">Manage, shorten and monitor your edge links.</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="flex items-center gap-1.5 self-start rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
        >
          {refreshing
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <RefreshCw className="h-4 w-4" />}
          <span>Sync Data</span>
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-8">
        {loading ? (
          [...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Total Links" value={totalUrls} color="text-white" />
            <StatCard label="Total Redirections" value={totalClicks} color="text-indigo-400" />
            <StatCard label="Active Links" value={activeUrls} color="text-emerald-400" />
            <StatCard label="Expired Links" value={expiredUrls} color="text-rose-400" />
          </>
        )}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left: Creator + List */}
        <div className="lg:col-span-2 space-y-8">

          {/* Creator form */}
          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xl shadow-lg">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-5">
              <Plus className="h-5 w-5 text-purple-400" />
              <span>Shorten a new URL</span>
            </h2>
            <form onSubmit={handleCreate} noValidate className="space-y-4">
              {/* Destination URL */}
              <div>
                <input
                  type="url"
                  value={inputUrl}
                  onChange={(e) => { setInputUrl(e.target.value); setUrlError(""); }}
                  placeholder="https://example.com/your-long-url"
                  aria-invalid={!!urlError}
                  className={`block w-full rounded-lg border bg-slate-950/40 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 transition-colors ${
                    urlError
                      ? "border-rose-500/60 focus:border-rose-500 focus:ring-rose-500/20"
                      : "border-white/10 focus:border-purple-500 focus:ring-purple-500/20"
                  }`}
                />
                {urlError && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-rose-400">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {urlError}
                  </p>
                )}
              </div>

              {/* Optional params row */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Custom Alias
                  </label>
                  <input
                    type="text"
                    value={customAlias}
                    onChange={(e) => setCustomAlias(e.target.value)}
                    placeholder="my-promo-link"
                    className="block w-full rounded-lg border border-white/10 bg-slate-950/40 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-purple-500 focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Link Expiration
                  </label>
                  <select
                    value={expiryPreset}
                    onChange={(e) => {
                      setExpiryPreset(e.target.value);
                      if (e.target.value !== "custom") setTtlHours("");
                    }}
                    className="block w-full rounded-lg border border-white/10 bg-slate-950/40 px-4 py-2.5 text-sm text-white focus:border-purple-500 focus:outline-none transition-colors cursor-pointer"
                  >
                    <option value="never" className="bg-slate-900 text-white">Never Expire</option>
                    <option value="1" className="bg-slate-900 text-white">1 Hour</option>
                    <option value="24" className="bg-slate-900 text-white">24 Hours (1 Day)</option>
                    <option value="168" className="bg-slate-900 text-white">7 Days</option>
                    <option value="720" className="bg-slate-900 text-white">30 Days</option>
                    <option value="custom" className="bg-slate-900 text-white">Custom duration...</option>
                  </select>
                  {expiryPreset === "custom" && (
                    <input
                      type="number"
                      value={ttlHours}
                      onChange={(e) => setTtlHours(e.target.value)}
                      placeholder="Enter hours (e.g. 48)"
                      min="1"
                      className="block w-full rounded-lg border border-white/10 bg-slate-950/40 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-purple-500 focus:outline-none transition-colors mt-2 animate-fadeIn"
                    />
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={formLoading}
                className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
              >
                {formLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /><span>Generating…</span></>
                ) : (
                  <span>Generate Edge URL</span>
                )}
              </button>
            </form>
          </div>

          {/* Links list */}
          <div className="rounded-xl border border-white/5 bg-slate-900/10 backdrop-blur-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5">
              <h2 className="text-lg font-bold text-white">Your Links</h2>
            </div>

            {loading ? (
              <div className="divide-y divide-white/5">
                {[...Array(3)].map((_, i) => <UrlRowSkeleton key={i} />)}
              </div>
            ) : urls.length === 0 ? (
              <div className="py-14 text-center text-slate-500">
                <Link2 className="h-10 w-10 mx-auto stroke-1 mb-3" />
                <p className="text-sm">No links yet. Create your first short link above.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {urls.map((u) => {
                  const isExpired = !!u.expires_at && new Date(u.expires_at) < new Date();
                  const shortUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/${u.short_key}`;
                  const isDeleting = deletingKey === u.short_key;

                  return (
                    <div
                      key={u.id}
                      onClick={() => setSelectedKey(u.short_key)}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 hover:bg-white/5 transition-colors cursor-pointer ${
                        selectedKey === u.short_key
                          ? "bg-white/5 border-l-2 border-purple-500 pl-4"
                          : ""
                      }`}
                    >
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-bold text-white">/{u.short_key}</span>
                          <span className="text-xs text-slate-500">•</span>
                          <a
                            href={u.original_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-slate-400 hover:text-purple-400 truncate max-w-xs flex items-center gap-1"
                          >
                            <span className="truncate">{u.original_url}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                          <span>Clicks: <strong className="text-slate-300">{u.clicks_count ?? 0}</strong></span>
                          <span>•</span>
                          <span>{new Date(u.created_at).toLocaleDateString()}</span>
                          {u.expires_at && (
                            <>
                              <span>•</span>
                              <span className={`flex items-center gap-1 ${isExpired ? "text-rose-400" : "text-amber-400"}`}>
                                <Clock className="h-3 w-3" />
                                {isExpired ? "Expired" : `Expires ${new Date(u.expires_at).toLocaleDateString()}`}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 self-end sm:self-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => copyLink(u.short_key)}
                          className="p-2 rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          title={`Copy ${shortUrl}`}
                        >
                          {copiedKey === u.short_key
                            ? <Check className="h-4 w-4 text-emerald-400" />
                            : <Copy className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => handleDelete(u.short_key)}
                          disabled={isDeleting}
                          className="p-2 rounded-lg border border-rose-500/20 bg-rose-500/5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
                          title="Delete this link"
                        >
                          {isDeleting
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Analytics Sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 rounded-xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xl shadow-lg space-y-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-white/5 pb-3">
              <BarChart3 className="h-5 w-5 text-indigo-400" />
              <span>Link Analytics</span>
            </h2>

            {loading ? (
              <AnalyticsSidebarSkeleton />
            ) : selectedUrl ? (
              <div className="space-y-6">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                    Selected Link
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-lg font-bold text-white">/{selectedUrl.short_key}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium">
                      {selectedClicks.length} clicks
                    </span>
                  </div>
                </div>

                <BreakdownSection
                  title="Top Countries"
                  icon={<Globe className="h-4 w-4 text-slate-500" />}
                  entries={topCountries}
                  total={selectedClicks.length}
                  barClass="from-indigo-500 to-purple-500"
                  emptyMsg="No visitor geographic data yet."
                />

                <BreakdownSection
                  title="Top Referrers"
                  icon={<Compass className="h-4 w-4 text-slate-500" />}
                  entries={topReferrers}
                  total={selectedClicks.length}
                  barClass="from-purple-500 to-pink-500"
                  emptyMsg="No referral analytics recorded."
                />
              </div>
            ) : (
              <div className="py-10 text-center text-slate-500">
                <Eye className="h-8 w-8 mx-auto stroke-1 mb-2 text-slate-600" />
                <p className="text-sm">Select a link from the list to view analytics.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-slate-900/20 p-6">
      <span className="text-sm text-slate-400 font-medium">{label}</span>
      <p className={`text-3xl font-extrabold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function BreakdownSection({
  title, icon, entries, total, barClass, emptyMsg,
}: {
  title: string;
  icon: React.ReactNode;
  entries: [string, number][];
  total: number;
  barClass: string;
  emptyMsg: string;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
        {icon}
        <span>{title}</span>
      </h3>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyMsg}</p>
      ) : (
        <div className="space-y-2.5">
          {entries.map(([label, count]) => {
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={label} className="space-y-1">
                <div className="flex justify-between text-xs font-medium text-slate-300">
                  <span className="truncate max-w-[160px]" title={label}>{label}</span>
                  <span>{count} ({pct}%)</span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${barClass} rounded-full transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
