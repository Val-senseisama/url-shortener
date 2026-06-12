"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
export type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (opts: Omit<Toast, "id">) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

// ─── Config ───────────────────────────────────────────────────────────────────
const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />,
  error:   <XCircle    className="h-5 w-5 text-rose-400 shrink-0" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />,
  info:    <Info       className="h-5 w-5 text-indigo-400 shrink-0" />,
};

const BORDER: Record<ToastType, string> = {
  success: "border-emerald-500/30",
  error:   "border-rose-500/30",
  warning: "border-amber-500/30",
  info:    "border-indigo-500/30",
};

const BG: Record<ToastType, string> = {
  success: "bg-emerald-500/5",
  error:   "bg-rose-500/5",
  warning: "bg-amber-500/5",
  info:    "bg-indigo-500/5",
};

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    ({ type, title, message, duration }: Omit<Toast, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const ttl = duration ?? (type === "error" ? 6000 : 4000);

      setToasts((prev) => [...prev.slice(-4), { id, type, title, message, duration: ttl }]);

      const timer = setTimeout(() => dismiss(id), ttl);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast stack */}
      <div
        className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2.5 pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`
              pointer-events-auto flex items-start gap-3 w-80 max-w-[calc(100vw-2rem)]
              rounded-xl border ${BORDER[t.type]} ${BG[t.type]}
              bg-slate-900/90 backdrop-blur-sm shadow-xl shadow-black/30 p-4
              animate-slideIn
            `}
          >
            {ICONS[t.type]}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white leading-snug">{t.title}</p>
              {t.message && (
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{t.message}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer -mt-0.5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
