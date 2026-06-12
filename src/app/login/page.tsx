"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import {
  Link2, Mail, Lock, Eye, EyeOff, Loader2, AlertCircle,
} from "lucide-react";

// ─── Inner form (uses useSearchParams — must be inside <Suspense>) ─────────────
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { toast } = useToast();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Per-field inline errors
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const nextPath = searchParams.get("next") || "/dashboard";

  // ─── Validation ──────────────────────────────────────────────────────────────
  function validate(): boolean {
    let valid = true;
    setEmailError("");
    setPasswordError("");

    if (!email) {
      setEmailError("Email is required.");
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Please enter a valid email address.");
      valid = false;
    }

    if (!password) {
      setPasswordError("Password is required.");
      valid = false;
    } else if (isSignUp && password.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      valid = false;
    }

    return valid;
  }

  // ─── Submit ───────────────────────────────────────────────────────────────────
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
        });
        if (error) throw error;

        if (data.user && data.session === null) {
          toast({
            type: "info",
            title: "Verify your email",
            message: "We've sent a confirmation link to your inbox. Click it to activate your account.",
          });
        } else {
          toast({ type: "success", title: "Account created!", message: "Welcome aboard." });
          router.push(nextPath);
          router.refresh();
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ type: "success", title: "Signed in", message: "Welcome back!" });
        router.push(nextPath);
        router.refresh();
      }
    } catch (err: any) {
      const msg: string = err?.message ?? "An unexpected error occurred.";

      // Map known Supabase error messages to user-friendly form
      if (msg.toLowerCase().includes("invalid login")) {
        setPasswordError("Incorrect email or password.");
      } else if (msg.toLowerCase().includes("email already")) {
        setEmailError("An account with this email already exists.");
      } else {
        toast({ type: "error", title: "Authentication failed", message: msg });
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center z-10">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-lg shadow-purple-500/20 mb-4">
          <Link2 className="h-6 w-6 text-white" />
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-white">
          {isSignUp ? "Create your account" : "Welcome back"}
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          {isSignUp ? "Sign up to track and manage your links" : "Sign in to access your dashboard"}
        </p>
      </div>

      {/* Card */}
      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 backdrop-blur-xl shadow-2xl">
          <form onSubmit={handleAuth} noValidate className="space-y-5">

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
                Email address
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className={`h-4 w-4 ${emailError ? "text-rose-400" : "text-slate-500"}`} />
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                  placeholder="name@example.com"
                  aria-invalid={!!emailError}
                  aria-describedby={emailError ? "email-error" : undefined}
                  className={`block w-full rounded-xl border bg-slate-950/50 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 transition-colors ${
                    emailError
                      ? "border-rose-500/60 focus:border-rose-500 focus:ring-rose-500/30"
                      : "border-white/10 focus:border-purple-500 focus:ring-purple-500/30"
                  }`}
                />
              </div>
              {emailError && (
                <p id="email-error" className="mt-1.5 flex items-center gap-1 text-xs text-rose-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {emailError}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className={`h-4 w-4 ${passwordError ? "text-rose-400" : "text-slate-500"}`} />
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
                  placeholder="••••••••"
                  aria-invalid={!!passwordError}
                  aria-describedby={passwordError ? "password-error" : undefined}
                  className={`block w-full rounded-xl border bg-slate-950/50 py-3 pl-10 pr-11 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 transition-colors ${
                    passwordError
                      ? "border-rose-500/60 focus:border-rose-500 focus:ring-rose-500/30"
                      : "border-white/10 focus:border-purple-500 focus:ring-purple-500/30"
                  }`}
                />
                {/* Eye toggle */}
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {passwordError && (
                <p id="password-error" className="mt-1.5 flex items-center gap-1 text-xs text-rose-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {passwordError}
                </p>
              )}
              {isSignUp && !passwordError && (
                <p className="mt-1.5 text-xs text-slate-500">Minimum 6 characters.</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/20 hover:opacity-90 active:scale-[0.99] transition-all duration-150 disabled:opacity-60 cursor-pointer mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Please wait…</span>
                </>
              ) : (
                <span>{isSignUp ? "Create Account" : "Sign In"}</span>
              )}
            </button>
          </form>

          {/* Toggle sign-up / sign-in */}
          <p className="mt-6 text-center text-sm text-slate-400">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setEmailError("");
                setPasswordError("");
              }}
              className="font-semibold text-purple-400 hover:text-purple-300 hover:underline cursor-pointer"
            >
              {isSignUp ? "Sign in instead" : "Register here"}
            </button>
          </p>
        </div>
      </div>
    </>
  );
}

// ─── Skeleton shown while Suspense hydrates ────────────────────────────────────
function LoginSkeleton() {
  return (
    <div className="sm:mx-auto sm:w-full sm:max-w-md z-10 text-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-purple-500 mx-auto" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center bg-slate-950 px-6 py-12 lg:px-8">
      <div className="absolute top-1/2 left-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-[100px] pointer-events-none" />
      <Suspense fallback={<LoginSkeleton />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
