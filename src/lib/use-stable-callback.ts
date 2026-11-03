"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Devuelve una función con identidad fija que siempre llama a la última versión de `fn`.
 * Sirve para pasar manejadores a componentes con `memo` sin que se vuelvan a pintar en cada render del padre.
 * Solo para manejadores de eventos (no se llama durante el render).
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
