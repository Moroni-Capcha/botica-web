"use client";

import { useEffect, useRef } from "react";
import { animateIn } from "@/lib/motion";

/** Un pulso breve y discreto (120 ms) cuando cambia el valor; no se dispara al montar. Ponle el `ref` al elemento con el monto. */
export function useValuePulse<T extends HTMLElement>(value: unknown) {
  const ref = useRef<T>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    animateIn(ref.current, [{ opacity: 0.55, transform: "scale(0.97)" }, { opacity: 1, transform: "none" }], { duration: 120 });
  }, [value]);
  return ref;
}
