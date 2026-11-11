"use client";

import { useEffect } from "react";
import { notify } from "@/components/ui/toast";
import { isLiteDevice, LEARNED_KEY, shouldLearnLite, SLOW_INTERACTION_MS } from "@/lib/perf-mode";
import { applyPerfMode, deviceHints, readPerfStorage } from "@/lib/perf-runtime";

/** Solo se cuenta el bloqueo de la carga: lo que pasa en los primeros segundos desde que se abrió la página. */
const LOAD_WINDOW_MS = 15_000;
/** Después de este tiempo de uso ya hay suficiente información: se deja de observar. */
const WATCH_MS = 10 * 60_000;

/**
 * Mide cómo responde este equipo de verdad mientras se usa la app. Si la carga bloquea demasiado o varias
 * interacciones tardan en responder, activa solo el modo ligero, lo recuerda y avisa una vez.
 * No hace nada si la persona ya eligió con el botón, si ya se aprendió, o si las pistas del equipo ya lo activaron.
 */
export function PerfWatch() {
  useEffect(() => {
    const { stored, learned } = readPerfStorage();
    if (stored !== null || learned || isLiteDevice(deviceHints(), null) || typeof PerformanceObserver === "undefined") return;

    let longTaskMs = 0;
    const slowInteractions = new Set<number>();
    let done = false;
    const observers: PerformanceObserver[] = [];

    const stop = () => {
      observers.forEach((o) => o.disconnect());
      clearTimeout(timer);
    };
    const check = () => {
      if (done || !shouldLearnLite({ longTaskMs, slowInteractions: slowInteractions.size })) return;
      done = true;
      try {
        localStorage.setItem(LEARNED_KEY, "1");
      } catch {
        /* sin almacenamiento: vale para esta sesión */
      }
      applyPerfMode();
      notify("Este equipo va algo lento, así que activamos el modo ligero (menos animaciones). Puedes cambiarlo con el botón del medidor, arriba.");
      stop();
    };
    const observe = (init: PerformanceObserverInit, onEntries: (entries: PerformanceEntryList) => void) => {
      try {
        const o = new PerformanceObserver((list) => {
          onEntries(list.getEntries());
          check();
        });
        o.observe(init);
        observers.push(o);
      } catch {
        /* el navegador no conoce este tipo de medida: se sigue con las demás */
      }
    };

    observe({ type: "longtask", buffered: true }, (entries) => {
      for (const e of entries) if (e.startTime < LOAD_WINDOW_MS) longTaskMs += e.duration;
    });
    observe({ type: "event", durationThreshold: SLOW_INTERACTION_MS, buffered: false } as PerformanceObserverInit, (entries) => {
      for (const e of entries) {
        /* `interactionId` agrupa los eventos de una misma interacción (bajar, subir, clic); TypeScript aún no lo trae. */
        const id = (e as PerformanceEntry & { interactionId?: number }).interactionId;
        if (id && e.duration >= SLOW_INTERACTION_MS) slowInteractions.add(id);
      }
    });

    const timer = setTimeout(stop, WATCH_MS);
    return stop;
  }, []);

  return null;
}
