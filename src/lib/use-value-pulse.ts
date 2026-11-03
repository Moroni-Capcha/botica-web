"use client";

import { useEffect, useRef } from "react";
import { animateIn } from "@/lib/motion";

/**
 * Un pulso breve y discreto (120 ms) cuando cambia el valor; no se dispara al montar. Ponle el `ref` al elemento con el monto.
 * No usa estado: corre con la API de animaciones sobre el ref, así que no repinta a quien lo usa.
 */
export function useValuePulse<T extends HTMLElement>(value: unknown) {
  const ref = useRef<T>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    animateIn(ref.current, [{ opacity: 0.55, transform: "scale3d(0.97, 0.97, 1)" }, { opacity: 1, transform: "scale3d(1, 1, 1)" }], { duration: 120 });
  }, [value]);
  return ref;
}
