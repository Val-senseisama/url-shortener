import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { Providers } from "@/components/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "SnapLink | Edge-Native URL Shortener",
    template: "%s | SnapLink"
  },
  description: "Create short, fast, trackable links with sub-30ms global redirection, L2 Redis caching, and real-time click analytics.",
  keywords: ["url shortener", "link shortener", "edge redirection", "snaplink", "analytics", "marketing links", "vercel edge", "supabase link shortener"],
  authors: [{ name: "SnapLink Team" }],
  openGraph: {
    title: "SnapLink | Edge-Native URL Shortener",
    description: "Create short, fast, trackable links with sub-30ms global redirection, L2 Redis caching, and real-time click analytics.",
    url: "https://snaplinks.zevbii.com",
    siteName: "SnapLink",
    images: [
      {
        url: "https://snaplinks.zevbii.com/icon.png",
        width: 512,
        height: 512,
        alt: "SnapLink Logo",
      }
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "SnapLink | Edge-Native URL Shortener",
    description: "Create short, fast, trackable links with sub-30ms global redirection, L2 Redis caching, and real-time click analytics.",
    images: ["https://snaplinks.zevbii.com/icon.png"],
  },
  icons: {
    icon: "/icon.png",
  },
  robots: {
    index: true,
    follow: true,
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100 selection:bg-purple-500/30 selection:text-purple-200">
        <Providers>
          <Navbar />
          <main className="flex-1 flex flex-col pt-16">{children}</main>
        </Providers>
      </body>
    </html>
  );
}

