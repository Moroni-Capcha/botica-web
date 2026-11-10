"use client";

import { useEffect, useRef } from "react";
import { EMPTY_SCAN, feedScanKey } from "@/lib/domain/scan";
import { isEditable } from "./use-pos-shortcuts";

interface Options {
  /** Hay un diálogo o la hoja del carrito abiertos: el teclado es de ellos. */
  disabled: boolean;
  onScan: (code: string) => void;
}

/**
 * Escucha al lector de código de barras en toda la pantalla, aunque el foco no esté en el buscador
 * (por ejemplo, después de tocar una tarjeta). No actúa con un diálogo abierto ni mientras se
 * escribe en un campo (el buscador ya agrega con Enter). Un código reconocido no activa además
 * el botón que tenga el foco.
 */
export function usePosScanner({ disabled, onScan }: Options) {
  const latest = useRef({ disabled, onScan });
  useEffect(() => {
    latest.current = { disabled, onScan };
  });

  useEffect(() => {
    let state = EMPTY_SCAN;
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      const blocked = latest.current.disabled || isEditable(document.activeElement) || !!document.querySelector('[aria-modal="true"]');
      if (blocked) {
        state = EMPTY_SCAN;
        return;
      }
      const r = feedScanKey(state, e.key, e.timeStamp);
      state = r.state;
      if (r.scan) {
        e.preventDefault();
        latest.current.onScan(r.scan);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}
