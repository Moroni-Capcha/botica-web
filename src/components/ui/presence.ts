"use client";

import { useEffect, useState, type AnimationEventHandler } from "react";
import { prefersReducedMotion } from "@/lib/motion";

export type PresencePhase = "unmounted" | "entered" | "exiting";
export type PresenceEvent = "open" | "close" | "done";

/**
 * Máquina de estados de la presencia (pura, para probarla sin pantalla):
 * abrir siempre deja el elemento visible; cerrar inicia la salida (o lo quita al instante con "reducir movimiento");
 * `done` es el aviso de que la salida terminó.
 */
export function nextPresence(phase: PresencePhase, event: PresenceEvent, reduced = false): PresencePhase {
  if (event === "open") return "entered";
  if (event === "close") return phase === "entered" ? (reduced ? "unmounted" : "exiting") : phase;
  return phase === "exiting" ? "unmounted" : phase;
}

/**
 * Mantiene montado un elemento mientras corre su animación de salida.
 * Pon `onAnimationEnd` en el elemento que anima y la clase de salida cuando `closing` sea true.
 * Si el navegador no avisa que terminó, un temporizador lo quita igual (`durationMs` + margen).
 * Con "reducir movimiento" no hay salida: se desmonta al instante.
 */
export function usePresence(open: boolean, durationMs: number) {
  const [phase, setPhase] = useState<PresencePhase>(open ? "entered" : "unmounted");
  const wanted = nextPresence(phase, open ? "open" : "close", prefersReducedMotion());
  if (wanted !== phase) setPhase(wanted);
  const current = wanted;

  useEffect(() => {
    if (current !== "exiting") return;
    const id = setTimeout(() => setPhase((p) => nextPresence(p, "done")), durationMs + 40);
    return () => clearTimeout(id);
  }, [current, durationMs]);

  const onAnimationEnd: AnimationEventHandler<HTMLElement> = (e) => {
    if (e.target === e.currentTarget && current === "exiting") setPhase((p) => nextPresence(p, "done"));
  };

  return { mounted: current !== "unmounted", closing: current === "exiting", onAnimationEnd };
}

/**
 * Salida de algo que el padre ya desmontó (p. ej. un diálogo que se cierra al guardar): deja un "fantasma" del último
 * cuadro sobre la pantalla, sin eventos ni foco, que hace su animación de salida y se quita solo.
 * Los elementos con `data-enter="clases"` pierden esas clases y ganan las de `data-exit="clases"`.
 * Con "reducir movimiento" no hace nada. Devuelve true si dejó el fantasma.
 */
export function playExitGhost(node: HTMLElement, durationMs: number): boolean {
  if (prefersReducedMotion() || typeof document === "undefined") return false;
  const ghost = node.cloneNode(true) as HTMLElement;
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("inert", "");
  ghost.style.pointerEvents = "none";
  ghost.removeAttribute("id");
  for (const el of ghost.querySelectorAll("[id]")) el.removeAttribute("id");
  for (const el of ghost.querySelectorAll("[autofocus]")) el.removeAttribute("autofocus");
  for (const el of [ghost, ...ghost.querySelectorAll<HTMLElement>("[data-exit]")]) {
    const exit = el.dataset.exit;
    if (!exit) continue;
    el.classList.remove(...(el.dataset.enter ?? "").split(" ").filter(Boolean));
    el.classList.add(...exit.split(" ").filter(Boolean));
  }
  document.body.appendChild(ghost);
  setTimeout(() => ghost.remove(), durationMs + 60);
  return true;
}
