"use client";

import { useCallback, useEffect, useState } from "react";
import { Feather, Gauge, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { LITE_KEY, LITE_LABEL, liteStorageValue, nextLitePref, parseLitePref, type LitePref } from "@/lib/perf-mode";
import { applyPerfMode, readPerfStorage } from "@/lib/perf-runtime";

/** Preferencia de rendimiento de este equipo y si el modo ligero está activo ahora (por elección, por pistas o por lo que se midió). */
export function usePerfPref() {
  const [pref, setPref] = useState<LitePref>("auto");
  const [active, setActive] = useState(false);

  useEffect(() => {
    setPref(parseLitePref(readPerfStorage().stored));
    setActive(document.documentElement.getAttribute("data-perf") === "lite");
  }, []);

  const cycle = useCallback(() => {
    const next = nextLitePref(pref);
    try {
      const value = liteStorageValue(next);
      if (value === null) localStorage.removeItem(LITE_KEY);
      else localStorage.setItem(LITE_KEY, value);
    } catch {
      /* no se recuerda la preferencia */
    }
    setPref(next);
    setActive(applyPerfMode());
  }, [pref]);

  return { pref, active, cycle };
}

const ICON = { auto: Gauge, lite: Feather, full: Sparkles } as const;

/**
 * Botón de rendimiento: Automático (el sistema decide según el equipo), Ligero (menos animaciones y efectos) o Completo.
 * `row` es la versión con texto, para el menú "Más" del celular.
 */
export function PerfToggle({ variant = "icon", className, onDone }: { variant?: "icon" | "row"; className?: string; onDone?: () => void }) {
  const { pref, active, cycle } = usePerfPref();
  const Icon = ICON[pref];
  const state = pref === "auto" ? `${LITE_LABEL.auto}${active ? " (ligero)" : ""}` : LITE_LABEL[pref];
  const label = `Rendimiento: ${state}`;
  return (
    <button
      type="button"
      onClick={() => {
        cycle();
        onDone?.();
      }}
      title={`${label}. Toca para cambiar.`}
      aria-label={`${label}. Toca para cambiar.`}
      className={cn(
        variant === "icon"
          ? "flex min-h-10 min-w-10 items-center justify-center rounded-lg p-2 text-fg-2 transition hover:bg-sunken"
          : "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/70",
        className,
      )}
    >
      <Icon className={cn("shrink-0", variant === "icon" ? "h-4 w-4 text-brand-ink" : "h-[18px] w-[18px]")} aria-hidden />
      {variant === "row" && <span className="flex-1 text-left">Rendimiento</span>}
      {variant === "row" && <span className="text-xs text-white/65">{state}</span>}
    </button>
  );
}
