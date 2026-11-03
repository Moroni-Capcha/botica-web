"use client";

import { useSyncExternalStore } from "react";

/** `true` si la pantalla cumple la consulta (por ejemplo `(min-width: 768px)`). En el servidor es `false`; se actualiza al cambiar el tamaño. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
