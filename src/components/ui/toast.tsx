"use client";

import { CircleCheck, TriangleAlert, X } from "lucide-react";
import { useEffect } from "react";
import { create } from "zustand";

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
    <div key={toast.id} role="status" className="fixed bottom-24 left-1/2 z-[60] flex max-w-[92vw] -translate-x-1/2 animate-[pop_.3s_cubic-bezier(.32,.72,0,1)] items-center gap-3 rounded-2xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-2xl md:bottom-6">
      {toast.tone === "warn" ? <TriangleAlert className="h-4 w-4 shrink-0 text-amber-300" /> : <CircleCheck className="h-4 w-4 shrink-0 text-emerald-300" />}
      <span>{toast.message}</span>
      <button type="button" onClick={hide} className="rounded p-0.5 text-white/60 hover:text-white" aria-label="Cerrar aviso">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
