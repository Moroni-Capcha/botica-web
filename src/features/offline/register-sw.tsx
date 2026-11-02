"use client";

import { useEffect } from "react";

/**
 * Registra el service worker (public/sw.js) para que la app abra sin internet.
 * Solo en producción: en desarrollo se desregistra cualquiera que haya quedado de una prueba anterior,
 * para que `npm run dev` nunca muestre archivos viejos.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .then(() => ("caches" in window ? caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("digihme-")).map((k) => caches.delete(k)))) : undefined))
        .catch(() => undefined);
      return;
    }
    const register = () => void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
