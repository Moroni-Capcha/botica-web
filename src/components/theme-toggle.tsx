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

  const choose = useCallback((next: ThemePref) => {
    setPref(next);
    apply(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* no se recuerda la preferencia */
    }
  }, []);
  const cycle = useCallback(() => choose(nextThemePref(pref)), [choose, pref]);

  return { pref, cycle, choose };
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

const OPTIONS: { id: ThemePref; label: string; hint: string }[] = [
  { id: "system", label: "Automático", hint: "Sigue el tema de este equipo" },
  { id: "light", label: "Claro", hint: "Siempre claro" },
  { id: "dark", label: "Oscuro", hint: "Siempre oscuro" },
];

/**
 * Selector directo de tema con tres opciones (Automático, Claro, Oscuro), para cabeceras con espacio como la consola.
 * Se maneja con las flechas del teclado, como cualquier grupo de opciones.
 */
export function ThemeSwitch({ className }: { className?: string }) {
  const { pref, choose } = useThemePref();
  const move = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = OPTIONS[(i + step + OPTIONS.length) % OPTIONS.length]!;
    choose(next.id);
    (e.currentTarget.parentElement?.children[OPTIONS.indexOf(next)] as HTMLElement | undefined)?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Tema de la pantalla" className={cn("flex items-center gap-0.5 rounded-xl bg-sunken p-0.5", className)}>
      {OPTIONS.map((o, i) => {
        const Icon = ICON[o.id];
        const on = pref === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.label}
            title={`${o.label}: ${o.hint}`}
            tabIndex={on ? 0 : -1}
            onClick={() => choose(o.id)}
            onKeyDown={(e) => move(e, i)}
            className={cn("flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition sm:px-2.5", on ? "bg-surface text-fg shadow-subtle" : "text-muted hover:text-fg")}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="hidden lg:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
