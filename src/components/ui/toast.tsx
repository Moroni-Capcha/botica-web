"use client";

import { CircleCheck, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { cn } from "@/lib/cn";
import { IconButton } from "./icon-button";
import { usePresence } from "./presence";

type Tone = "ok" | "warn";
interface ToastState {
  toast: { id: number; message: string; tone: Tone } | null;
  show: (message: string, tone?: Tone) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  toast: null,
  show: (message, tone = "ok") => set({ toast: { id: Date.now(), message, tone } }),
  hide: () => set({ toast: null }),
}));

export const notify = (message: string, tone: Tone = "ok") => useToast.getState().show(message, tone);

export function Toaster() {
  const { toast, hide } = useToast();
  /* El último aviso se recuerda para poder mostrarlo mientras hace su salida (el estado ya lo dejó en null). */
  const [shown, setShown] = useState(toast);
  if (toast && toast !== shown) setShown(toast);
  const { mounted, closing, onAnimationEnd } = usePresence(!!toast, 140);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(hide, 3500);
    return () => clearTimeout(id);
  }, [toast, hide]);
  const t = toast ?? shown;
  return (
    /* La región se queda siempre en pantalla para que los lectores anuncien cada aviso nuevo. */
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-24 left-1/2 z-[60] w-max -translate-x-1/2 md:bottom-6">
      {mounted && t && (
        <div
          key={t.id}
          onAnimationEnd={onAnimationEnd}
          className={cn("pointer-events-auto flex max-w-[92vw] items-center gap-3 rounded-2xl bg-fg px-4 py-3 text-sm text-white shadow-overlay", closing ? "animate-toast-out" : "animate-pop")}
        >
          {t.tone === "warn" ? <TriangleAlert className="h-4 w-4 shrink-0 text-warning-border" aria-hidden /> : <CircleCheck className="h-4 w-4 shrink-0 text-success-border" aria-hidden />}
          <span>{t.message}</span>
          <IconButton size="xs" onClick={hide} className="text-white/70 hover:bg-white/10 hover:text-white" aria-label="Cerrar aviso">
            <X className="h-3.5 w-3.5" aria-hidden />
          </IconButton>
        </div>
      )}
    </div>
  );
}
