"use client";

import { useState } from "react";
import Link from "next/link";
import { Link2, Sparkles, Zap, Shield, BarChart3, Copy, Check, ExternalLink } from "lucide-react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [shortUrl, setShortUrl] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleShorten = async (e: React.FormEvent) => {
    e.preventDefault();
    setShortUrl("");
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/shorten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
      } else {
        setShortUrl(data.shortUrl);
      }
    } catch {
      setError("Unable to connect to the server. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden bg-slate-950 px-6 py-20 lg:px-8">
      {/* Background Decorative Gradients */}
      <div className="absolute top-0 left-1/4 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 h-[500px] w-[500px] translate-x-1/2 rounded-full bg-purple-500/10 blur-[120px] pointer-events-none" />

      {/* Hero Content */}
      <div className="mx-auto max-w-4xl text-center z-10">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-4 py-1.5 text-sm font-medium text-purple-300 mb-6 animate-pulse">
          <Sparkles className="h-4 w-4" />
          <span>Powered by Vercel Edge & Supabase</span>
        </div>
        
        <h1 className="bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-6xl">
          Slight Links.<br />
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Massive Performance.
          </span>
        </h1>
        
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-400">
          SnapLink is an edge-native URL shortener designed for global speed. Shorten, customize, and analyze links with ultra-low redirection latencies under 30ms.
        </p>

        {/* Shortener Box */}
        <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xl shadow-2xl">
          <form onSubmit={handleShorten} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Link2 className="h-5 w-5 text-slate-500" />
              </div>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste your long link here..."
                required
                className="block w-full rounded-xl border border-white/10 bg-slate-950/50 py-3.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/20 hover:opacity-90 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Shortening..." : "Shorten URL"}
            </button>
          </form>

          {/* Success Response */}
          {shortUrl && (
            <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-left animate-fadeIn">
              <span className="text-xs font-semibold text-emerald-400 tracking-wider uppercase block mb-1">
                Your shortened link is ready:
              </span>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <a
                  href={shortUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-base font-semibold text-white hover:text-purple-400 hover:underline break-all transition-colors"
                >
                  <span>{shortUrl}</span>
                  <ExternalLink className="h-4 w-4 shrink-0" />
                </a>
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-1.5 self-start sm:self-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 text-slate-300" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-400 border-t border-white/5 pt-3">
                Want to manage this link and track visual click analytics?{" "}
                <Link href="/login" className="text-purple-400 hover:underline font-semibold">
                  Create a free account
                </Link>
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <p className="mt-4 text-sm font-medium text-rose-400 text-left animate-fadeIn">
              {error}
            </p>
          )}
        </div>

        {/* Feature Grid */}
        <div className="mx-auto mt-24 max-w-5xl">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {/* Feature 1 */}
            <div className="rounded-2xl border border-white/5 bg-slate-900/20 p-8 backdrop-blur-sm text-left hover:border-white/10 transition-all duration-300 group">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 mb-6 group-hover:scale-105 transition-transform duration-300">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Edge-Native Routing</h3>
              <p className="text-sm leading-relaxed text-slate-400">
                Redirections execute globally at the edge runtime, providing sub-30ms latencies for clicks from any country.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="rounded-2xl border border-white/5 bg-slate-900/20 p-8 backdrop-blur-sm text-left hover:border-white/10 transition-all duration-300 group">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 mb-6 group-hover:scale-105 transition-transform duration-300">
                <Shield className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Abuse Protections</h3>
              <p className="text-sm leading-relaxed text-slate-400">
                Built-in sliding-window rate limiting on Redis keeps the API safe from abuse and scraping bots.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="rounded-2xl border border-white/5 bg-slate-900/20 p-8 backdrop-blur-sm text-left hover:border-white/10 transition-all duration-300 group">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pink-500/10 text-pink-400 mb-6 group-hover:scale-105 transition-transform duration-300">
                <BarChart3 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Real-Time Analytics</h3>
              <p className="text-sm leading-relaxed text-slate-400">
                Monitor geographic demographics, referrer sources, and browser metrics for all your links in real-time.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
