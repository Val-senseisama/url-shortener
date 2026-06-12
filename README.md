# SnapLink ⚡🔗

SnapLink is a high-performance, production-ready, edge-native URL shortener built with Next.js 16 (App Router & Turbopack), Supabase, and Redis.

## 🚀 Live Site
Check out the production application: **[https://snaplinks.zevbii.com](https://snaplinks.zevbii.com)**

---

## ✨ Features

- **⚡ Sub-30ms Redirects**: Node-based redirection engine matching keys directly from L2 cache.
- **💾 Dual-Layer Caching (L2)**: High-speed caching using Redis Cloud (`snaplink:` prefix namespace separation) with custom TTL matching database configurations.
- **🛡️ Rate-Limiting**: Sliding-window rate limiting (10 requests/min per IP) via Redis script evaluation to protect database writes.
- **📊 Real-Time Analytics**: Deep metrics collection including clicked timestamp, country location, user agents, and referral paths.
- **🔑 Dynamic Expiry Presets**: Set custom expiration dates (e.g., 1hr, 24hr, 7d, 30d, or Custom) or create permanent (never expire) links.
- **👑 Admin Control Panel**: Gated `/admin` view with custom server-side auth checking, platform-wide KPIs, link deactivation, and user management.
- **🔔 Toast & Feedback UX**: Interactive visual cues with loading skeleton cards, toast notifications, inline error messages, and eye-toggles for password security.
- **🔍 SEO Optimized**: Upgraded with layout metadata, OpenGraph tags, Twitter cards, custom brand icons, and descriptive titles.

---

## 🛠️ Technology Stack

- **Framework**: Next.js 16 (App Router, Turbopack, TailwindCSS)
- **Database & Auth**: Supabase (PostgreSQL with Row-Level Security, RLS)
- **Caching & Rate Limiting**: Redis Cloud (TCP connectivity, `redis` package)
- **Styling**: TailwindCSS, Lucide Icons
- **Deployment**: Vercel & GitHub Actions

---

## ⚙️ Environment Configuration

To run SnapLink locally, populate your `.env.local` file with the following variables:

```bash
# Supabase Connectivity
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Redis Connectivity (TCP string)
REDIS_URL="redis://default:password@host:port"

# Base Domain
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Admin Access Controls
ADMIN_EMAILS="admin@example.com"
NEXT_PUBLIC_ADMIN_EMAILS="admin@example.com"
```

---

## 📦 Getting Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Val-senseisama/url-shortener.git
   cd url-shortener
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the local development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to view your local SnapLink instance.

4. **Build for production:**
   ```bash
   npm run build
   npm run start
   ```
