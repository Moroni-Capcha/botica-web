"use client";

import { useCallback, useRef, useState } from "react";

/** Cuántos elementos se pintan de golpe. Sube de a una tanda mientras la persona sigue bajando. */
export const LIST_STEP = 48;

/** Siguiente límite al pedir más: una tanda más, sin pasarse del total. Pura, para poder probarla. */
export const growLimit = (limit: number, total: number, step = LIST_STEP) => Math.min(Math.max(total, 0), limit + step);

/**
 * Contenedor con scroll vertical más cercano (el que recorta el elemento). Un observador respecto a la ventana
 * no sirve: el recorte de ese contenedor no lo ensancha `rootMargin`, y la tanda siguiente llegaría tarde.
 */
function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let e = node.parentElement; e; e = e.parentElement) {
    const overflowY = getComputedStyle(e).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && e.scrollHeight > e.clientHeight + 1) return e;
  }
  return null;
}

/**
 * Pinta una lista larga por tandas en vez de todo junto: con miles de productos, un solo pintado de todo
 * congela equipos modestos por segundos. `resetKey` identifica el conjunto mostrado (búsqueda y filtros):
 * al cambiar, se vuelve a la primera tanda. El elemento que se entrega en `sentinel` va justo después de
 * la lista; al acercarse a la pantalla, se pinta la siguiente tanda.
 */
export function useIncrementalList(total: number, resetKey: string, step = LIST_STEP) {
  const [state, setState] = useState({ key: resetKey, limit: step });
  const limit = state.key === resetKey ? state.limit : step;
  const observer = useRef<IntersectionObserver | null>(null);

  /* La función cambia con `limit`: React la vuelve a llamar y se observa de nuevo, así que si tras pintar
     la tanda el elemento sigue a la vista, se pide la siguiente hasta que quede fuera. */
  const sentinel = useCallback(
    (node: HTMLElement | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!node || typeof IntersectionObserver === "undefined") return;
      observer.current = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) setState((s) => ({ key: resetKey, limit: growLimit(s.key === resetKey ? s.limit : step, total, step) }));
        },
        { root: scrollParent(node), rootMargin: "600px 0px" },
      );
      observer.current.observe(node);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `limit` fuerza a observar de nuevo después de cada tanda
    [resetKey, total, step, limit],
  );

  return { limit, more: limit < total, sentinel };
}
