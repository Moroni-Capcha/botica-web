/** Tema de la pantalla: reglas puras (se prueban con Vitest). La preferencia es de cada persona y se guarda en su navegador. */

export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_KEY = "bh.theme";

/** Cualquier valor guardado que no sea "light" o "dark" cuenta como "automático". */
export const parseThemePref = (value: unknown): ThemePref => (value === "light" || value === "dark" ? value : "system");

export const resolveTheme = (pref: ThemePref, systemDark: boolean): Theme => (pref === "system" ? (systemDark ? "dark" : "light") : pref);

/** Orden al tocar el botón: Automático → Claro → Oscuro → Automático. */
export const nextThemePref = (pref: ThemePref): ThemePref => (pref === "system" ? "light" : pref === "light" ? "dark" : "system");

export const THEME_LABEL: Record<ThemePref, string> = { system: "Automático", light: "Claro", dark: "Oscuro" };

/**
 * Se ejecuta en el <head>, antes del primer pintado, para que no haya un destello claro al abrir en oscuro.
 * Es la misma regla que `resolveTheme`, escrita sin dependencias.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}");var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})()`;
