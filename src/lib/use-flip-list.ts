"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { measureFlip, playFlip, type FlipPoint } from "@/lib/motion";
import type { AnimatedRow } from "@/lib/use-animated-list";

/**
 * Cuando una fila termina de salir, las de abajo suben deslizándose (FLIP con translate3d, sin animar altura ni márgenes).
 * Ponle `data-flip-key={key}` a cada hijo directo del contenedor. No guarda estado: usa refs y la API de animaciones,
 * así que no vuelve a pintar la lista.
 */
export function useFlipList<T>(listRef: RefObject<HTMLElement | null>, rows: AnimatedRow<T>[]) {
  const first = useRef<Map<string, FlipPoint> | null>(null);
  const exiting = rows.some((r) => r.exiting);
  useLayoutEffect(() => {
    if (exiting) {
      /* La fila que sale sigue ocupando su lugar: las posiciones de ahora son el "antes". */
      first.current ??= measureFlip(listRef.current);
    } else if (first.current) {
      playFlip(listRef.current, first.current);
      first.current = null;
    }
  }, [exiting, rows, listRef]);
}
