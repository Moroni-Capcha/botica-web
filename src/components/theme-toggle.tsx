"use client";

import { useCallback, useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { nextThemePref, parseThemePref, resolveTheme, THEME_KEY, THEME_LABEL, type ThemePref } from "@/lib/theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

const apply = (pref: ThemePref) => {
  document.documentElement.setAttribute("data-theme", resolveTheme(pref, window.matchMedia(DARK_QUERY).matches));
};

/** Preferencia de tema de esta persona. Cambia el atributo del <html> y la recuerda en este navegador. */
export function useThemePref() {
  const [pref, setPref] = useState<ThemePref>("system");

  useEffect(() => {
    try {
      setPref(parseThemePref(localStorage.getItem(THEME_KEY)));
    } catch {
      /* sin almacenamiento: queda en automático */
    }
  }, []);

  /* En automático, si el sistema cambia de tema, la pantalla lo sigue. */
  useEffect(() => {
    if (pref !== "system") return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [pref]);

  const cycle = useCallback(() => {
    const next = nextThemePref(pref);
    setPref(next);
    apply(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* no se recuerda la preferencia */
    }
  }, [pref]);

  return { pref, cycle };
}

const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

/** Botón que alterna Automático, Claro y Oscuro. `row` es la versión con texto, para el menú "Más" del celular. */
export function ThemeToggle({ variant = "icon", className, onDone }: { variant?: "icon" | "row"; className?: string; onDone?: () => void }) {
  const { pref, cycle } = useThemePref();
  const Icon = ICON[pref];
  const label = `Tema: ${THEME_LABEL[pref]}`;
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
      {variant === "row" && <span className="flex-1 text-left">Tema</span>}
      {variant === "row" && <span className="text-xs text-white/65">{THEME_LABEL[pref]}</span>}
    </button>
  );
}
