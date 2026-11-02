/**
 * Guarda el token de sesión. sessionStorage: se borra al cerrar la pestaña, útil en equipos compartidos del local.
 * Si el backend prefiere cookie httpOnly, este archivo deja de usarse y http.ts envía `credentials: "include"`.
 *
 * Hay dos almacenes con claves distintas: el de la botica y el de la consola de Digi!HME. Así una sesión nunca
 * se confunde con la otra, ni siquiera en la misma pestaña.
 */
const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export function createTokenStore(key: string) {
  const listeners = new Set<() => void>();
  return {
    get: (): string | null => (typeof window === "undefined" ? null : safe(() => JSON.parse(sessionStorage.getItem(key) ?? "null")?.token ?? null, null)),
    getRaw: (): string | null => (typeof window === "undefined" ? null : safe(() => sessionStorage.getItem(key), null)),
    set: (value: unknown) => safe(() => sessionStorage.setItem(key, JSON.stringify(value)), undefined),
    clear: () => safe(() => sessionStorage.removeItem(key), undefined),
    onExpired: (fn: () => void) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    notifyExpired: () => listeners.forEach((fn) => fn()),
  };
}

export type TokenStore = ReturnType<typeof createTokenStore>;

/** Sesión de la botica (cuentas del local y dueño). */
export const tokenStore = createTokenStore("bh.session");

/** Sesión del operador de Digi!HME en la consola interna. */
export const platformTokenStore = createTokenStore("bh.platform.session");
