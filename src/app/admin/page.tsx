"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import {
  Link2, Copy, Check, Trash2, ShieldAlert, Users, Link as LinkIcon,
  Activity, RefreshCw, Loader2, Search, ExternalLink, Calendar, Mail,
  Power, CheckCircle, XCircle, Clock
} from "lucide-react";

// ─── Interfaces ──────────────────────────────────────────────────────────────
interface AdminMetrics {
  totalUrls: number;
  totalClicks: number;
  totalUsers: number;
  activeUrls: number;
  links24h: number;
  clicks24h: number;
}

interface EnrichedUrl {
  id: number;
  short_key: string;
  original_url: string;
  custom_alias: string | null;
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
  user_email: string;
  clicks_count: number;
}

interface AdminUser {
  id: string;
  email: string | undefined;
  created_at: string;
  last_sign_in_at: string | undefined;
  role: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [urls, setUrls] = useState<EnrichedUrl[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<"links" | "users">("links");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "expired">("all");
  
  // Interactive actions
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // ─── Fetch Admin Data ─────────────────────────────────────────────────────────
  const fetchAdminData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/admin/data");
      
      if (res.status === 401 || res.status === 403) {
        toast({
          type: "error",
          title: "Access Denied",
          message: "You must be an administrator to view this page.",
        });
        router.push("/dashboard");
        return;
      }
      
      if (!res.ok) {
        throw new Error("Failed to load admin workspace data");
      }

      const data = await res.json();
      setMetrics(data.metrics);
      setUrls(data.urls);
      setUsers(data.users);
    } catch (err: any) {
      toast({
        type: "error",
        title: "Database Sync Error",
        message: err.message || "Could not retrieve system stats.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAdminData(true);
    setRefreshing(false);
    toast({
      type: "success",
      title: "Data Synchronized",
      message: "Admin workspace metrics have been updated.",
    });
  };

  // ─── Toggle Active Status ─────────────────────────────────────────────────────
  const handleToggleActive = async (url: EnrichedUrl) => {
    setTogglingId(url.id);
    const newStatus = !url.is_active;
    
    try {
      const res = await fetch(`/api/admin/urls/${url.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: newStatus }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");

      // Update state locally
      setUrls(prev => prev.map(u => u.id === url.id ? { ...u, is_active: newStatus } : u));
      toast({
        type: "success",
        title: newStatus ? "Link Activated" : "Link Deactivated",
        message: `Short link /${url.short_key} status has been updated.`,
      });

      // Update metrics count
      if (metrics) {
        setMetrics({
          ...metrics,
          activeUrls: newStatus ? metrics.activeUrls + 1 : metrics.activeUrls - 1
        });
      }
    } catch (err: any) {
      toast({
        type: "error",
        title: "Action Failed",
        message: err.message,
      });
    } finally {
      setTogglingId(null);
    }
  };

  // ─── Delete Link ─────────────────────────────────────────────────────────────
  const handleDeleteLink = async (id: number, shortKey: string) => {
    if (!confirm(`Are you sure you want to permanently delete short link "/${shortKey}"?`)) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/urls/${id}`, {
        method: "DELETE",
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");

      setUrls(prev => prev.filter(u => u.id !== id));
      toast({
        type: "success",
        title: "Link Purged",
        message: `Short key /${shortKey} was permanently deleted from the database.`,
      });

      // Reload admin stats silently
      fetchAdminData(true);
    } catch (err: any) {
      toast({
        type: "error",
        title: "Failed to Delete",
        message: err.message,
      });
    } finally {
      setDeletingId(null);
    }
  };

  // ─── Copy Link ───────────────────────────────────────────────────────────────
  const copyLink = async (key: string) => {
    const shortUrl = `${window.location.origin}/${key}`;
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopiedKey(key);
      toast({ type: "success", title: "Link Copied", message: shortUrl });
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast({ type: "error", title: "Copy Failed", message: "Clipboard access blocked." });
    }
  };

  // ─── Filter & Search Logic ───────────────────────────────────────────────────
  const filteredUrls = urls.filter((u) => {
    const matchesSearch =
      u.short_key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.original_url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.custom_alias && u.custom_alias.toLowerCase().includes(searchQuery.toLowerCase())) ||
      u.user_email.toLowerCase().includes(searchQuery.toLowerCase());

    const isExpired = !!u.expires_at && new Date(u.expires_at) < new Date();

    if (statusFilter === "active") return matchesSearch && u.is_active && !isExpired;
    if (statusFilter === "inactive") return matchesSearch && !u.is_active;
    if (statusFilter === "expired") return matchesSearch && isExpired;
    return matchesSearch;
  });

  const filteredUsers = users.filter((u) => 
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-slate-100">
      
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-6 mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/30">
            <ShieldAlert className="h-6 w-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">Administration</h1>
            <p className="text-sm text-slate-400 mt-1">Platform management workspace and analytics metrics.</p>
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="flex items-center gap-1.5 self-start rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span>Refresh Console</span>
        </button>
      </div>

      {/* Metrics Summary */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-6 mb-8">
        {loading ? (
          [...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-white/5 bg-slate-900/20 p-5 space-y-2">
              <div className="h-3 w-16 bg-white/5 rounded" />
              <div className="h-7 w-12 bg-white/5 rounded" />
            </div>
          ))
        ) : (
          <>
            <StatBox label="Total Links" value={metrics?.totalUrls ?? 0} icon={<LinkIcon className="h-4 w-4 text-indigo-400" />} />
            <StatBox label="System Clicks" value={metrics?.totalClicks ?? 0} icon={<Activity className="h-4 w-4 text-purple-400" />} />
            <StatBox label="Registered Users" value={metrics?.totalUsers ?? 0} icon={<Users className="h-4 w-4 text-pink-400" />} />
            <StatBox label="Active Links" value={metrics?.activeUrls ?? 0} icon={<CheckCircle className="h-4 w-4 text-emerald-400" />} />
            <StatBox label="Links (24h)" value={metrics?.links24h ?? 0} icon={<Calendar className="h-4 w-4 text-amber-400" />} />
            <StatBox label="Clicks (24h)" value={metrics?.clicks24h ?? 0} icon={<Clock className="h-4 w-4 text-cyan-400" />} />
          </>
        )}
      </div>

      {/* Workspace Tabs */}
      <div className="flex border-b border-white/5 gap-6 mb-6">
        <button
          onClick={() => { setActiveTab("links"); setSearchQuery(""); }}
          className={`pb-4 text-sm font-semibold transition-colors relative cursor-pointer ${
            activeTab === "links" ? "text-indigo-400" : "text-slate-400 hover:text-white"
          }`}
        >
          <span>System Links ({urls.length})</span>
          {activeTab === "links" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded" />
          )}
        </button>
        <button
          onClick={() => { setActiveTab("users"); setSearchQuery(""); }}
          className={`pb-4 text-sm font-semibold transition-colors relative cursor-pointer ${
            activeTab === "users" ? "text-indigo-400" : "text-slate-400 hover:text-white"
          }`}
        >
          <span>Platform Users ({users.length})</span>
          {activeTab === "users" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded" />
          )}
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-6">
        {/* Search */}
        <div className="relative w-full md:max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-500" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === "links" ? "Search by key, long URL, user email..." : "Search by email, role..."}
            className="block w-full rounded-lg border border-white/10 bg-slate-900/40 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-all"
          />
        </div>

        {/* Filters for Links */}
        {activeTab === "links" && (
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
            <FilterButton label="All" active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
            <FilterButton label="Active" active={statusFilter === "active"} onClick={() => setStatusFilter("active")} />
            <FilterButton label="Inactive" active={statusFilter === "inactive"} onClick={() => setStatusFilter("inactive")} />
            <FilterButton label="Expired" active={statusFilter === "expired"} onClick={() => setStatusFilter("expired")} />
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="rounded-xl border border-white/5 bg-slate-900/20 backdrop-blur-xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto mb-3" />
            <p className="text-sm">Loading admin dashboard workspace...</p>
          </div>
        ) : activeTab === "links" ? (
          /* LINKS TABLE */
          filteredUrls.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <Link2 className="h-10 w-10 mx-auto stroke-1 mb-3 text-slate-600" />
              <p className="text-sm">No system links found matching your filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-slate-950/40 text-slate-400 font-medium text-xs uppercase tracking-wider">
                    <th className="p-4 pl-6">Short Key</th>
                    <th className="p-4">Destination / Owner</th>
                    <th className="p-4 text-center">Clicks</th>
                    <th className="p-4">Expiry Date</th>
                    <th className="p-4 text-center">Active</th>
                    <th className="p-4 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredUrls.map((url) => {
                    const isExpired = !!url.expires_at && new Date(url.expires_at) < new Date();
                    const isToggling = togglingId === url.id;
                    const isDeleting = deletingId === url.id;

                    return (
                      <tr key={url.id} className="hover:bg-white/5 transition-colors">
                        {/* Key */}
                        <td className="p-4 pl-6 font-bold text-white whitespace-nowrap">
                          /{url.short_key}
                          {url.custom_alias && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 font-medium">
                              alias
                            </span>
                          )}
                        </td>

                        {/* Destination & Creator */}
                        <td className="p-4 max-w-sm md:max-w-md">
                          <div className="flex flex-col gap-1">
                            <a
                              href={url.original_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-200 hover:text-indigo-400 transition-colors font-medium truncate flex items-center gap-1"
                              title={url.original_url}
                            >
                              <span className="truncate">{url.original_url}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <Mail className="h-3 w-3 text-slate-500" />
                              {url.user_email}
                            </span>
                          </div>
                        </td>

                        {/* Clicks */}
                        <td className="p-4 text-center font-bold text-slate-200">
                          {url.clicks_count}
                        </td>

                        {/* Expiry */}
                        <td className="p-4 whitespace-nowrap text-slate-400 text-xs">
                          {url.expires_at ? (
                            <span className={`flex items-center gap-1 ${isExpired ? "text-rose-400" : "text-amber-400"}`}>
                              <Clock className="h-3.5 w-3.5" />
                              {isExpired ? "Expired" : new Date(url.expires_at).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-slate-600">Never</span>
                          )}
                        </td>

                        {/* Active Toggle */}
                        <td className="p-4 text-center">
                          <button
                            onClick={() => handleToggleActive(url)}
                            disabled={isToggling}
                            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                              url.is_active
                                ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10"
                                : "border-rose-500/20 bg-rose-500/5 text-rose-400 hover:bg-rose-500/10"
                            } disabled:opacity-50`}
                            title={url.is_active ? "Click to deactivate" : "Click to activate"}
                          >
                            {isToggling ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Power className="h-4 w-4" />
                            )}
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="p-4 pr-6 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => copyLink(url.short_key)}
                              className="p-2 rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                              title="Copy URL"
                            >
                              {copiedKey === url.short_key ? (
                                <Check className="h-4 w-4 text-emerald-400" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleDeleteLink(url.id, url.short_key)}
                              disabled={isDeleting}
                              className="p-2 rounded-lg border border-rose-500/20 bg-rose-500/5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
                              title="Delete Link"
                            >
                              {isDeleting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* USERS TABLE */
          filteredUsers.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <Users className="h-10 w-10 mx-auto stroke-1 mb-3 text-slate-600" />
              <p className="text-sm">No registered accounts found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-slate-950/40 text-slate-400 font-medium text-xs uppercase tracking-wider">
                    <th className="p-4 pl-6">Account ID</th>
                    <th className="p-4">Email Address</th>
                    <th className="p-4">Role</th>
                    <th className="p-4">Joined Date</th>
                    <th className="p-4 pr-6">Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4 pl-6 font-mono text-xs text-slate-500 whitespace-nowrap">
                        {user.id}
                      </td>
                      <td className="p-4 font-bold text-white whitespace-nowrap">
                        {user.email || "No Email"}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          user.role === "admin"
                            ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                            : "bg-slate-800 text-slate-400 border border-white/5"
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="p-4 text-slate-400 whitespace-nowrap">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-4 pr-6 text-slate-400 whitespace-nowrap">
                        {user.last_sign_in_at
                          ? new Date(user.last_sign_in_at).toLocaleString()
                          : "Never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ─── Local Components ────────────────────────────────────────────────────────
function StatBox({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/5 bg-slate-900/20 p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider">
        <span className="truncate">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-extrabold text-white mt-2">{value}</p>
    </div>
  );
}

function FilterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap ${
        active
          ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
          : "bg-transparent border-white/5 text-slate-400 hover:text-white hover:border-white/10"
      }`}
    >
      {label}
    </button>
  );
}
