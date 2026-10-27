/**
 * Guarda el token de sesión. sessionStorage: se borra al cerrar la pestaña, útil en equipos compartidos del local.
 * Si el backend prefiere cookie httpOnly, este archivo deja de usarse y http.ts envía `credentials: "include"`.
 */
const KEY = "bh.session";
const listeners = new Set<() => void>();

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const tokenStore = {
  get: (): string | null => (typeof window === "undefined" ? null : safe(() => JSON.parse(sessionStorage.getItem(KEY) ?? "null")?.token ?? null, null)),
  getRaw: (): string | null => (typeof window === "undefined" ? null : safe(() => sessionStorage.getItem(KEY), null)),
  set: (value: unknown) => safe(() => sessionStorage.setItem(KEY, JSON.stringify(value)), undefined),
  clear: () => safe(() => sessionStorage.removeItem(KEY), undefined),
  onExpired: (fn: () => void) => {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
  notifyExpired: () => listeners.forEach((fn) => fn()),
};
