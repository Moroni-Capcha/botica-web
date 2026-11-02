"use client";

import { CircleCheck, TriangleAlert, X } from "lucide-react";
import { useEffect } from "react";
import { create } from "zustand";
import { IconButton } from "./icon-button";

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
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(hide, 3500);
    return () => clearTimeout(id);
  }, [toast, hide]);
  if (!toast) return null;
  return (
    <div key={toast.id} role="status" className="fixed bottom-24 left-1/2 z-[60] flex max-w-[92vw] -translate-x-1/2 animate-pop items-center gap-3 rounded-2xl bg-fg px-4 py-3 text-sm text-white shadow-overlay md:bottom-6">
      {toast.tone === "warn" ? <TriangleAlert className="h-4 w-4 shrink-0 text-warning-border" aria-hidden /> : <CircleCheck className="h-4 w-4 shrink-0 text-success-border" aria-hidden />}
      <span>{toast.message}</span>
      <IconButton size="xs" onClick={hide} className="text-white/70 hover:bg-white/10 hover:text-white" aria-label="Cerrar aviso">
        <X className="h-3.5 w-3.5" aria-hidden />
      </IconButton>
    </div>
  );
}
