/**
 * Código de la botica elegida (p. ej. "botica-huanuco"). Se guarda en localStorage (`bh.botica`) para
 * recordarla entre visitas y http.ts la envía en el header `X-Botica` en cada petición.
 */
const KEY = "bh.botica";

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const tenantStore = {
  get: (): string | null => (typeof window === "undefined" ? null : safe(() => localStorage.getItem(KEY), null)),
  set: (code: string) => safe(() => localStorage.setItem(KEY, code), undefined),
  clear: () => safe(() => localStorage.removeItem(KEY), undefined),
};
