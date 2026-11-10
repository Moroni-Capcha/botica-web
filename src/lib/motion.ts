/** Curva de salida de los tokens de movimiento (`--ease-out` en globals.css), para animaciones hechas desde JavaScript. */
export const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

/**
 * ¿Hay que evitar las animaciones? Sí si la persona pidió menos movimiento o si el equipo es modesto
 * (modo ligero: `data-perf="lite"` en el <html>, ver `lib/perf-mode.ts`). Seguro en el servidor (ahí no hay animaciones: false).
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  if (typeof document !== "undefined" && document.documentElement.getAttribute("data-perf") === "lite") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Anima un elemento con la API nativa (Web Animations) respetando "reducir movimiento":
 * con esa preferencia no anima nada. Devuelve la animación, o null si no corrió.
 * Solo se anima `transform` y `opacity` (la GPU se encarga). `will-change` se pone mientras corre y se quita al terminar.
 */
export function animateIn(el: Element | null | undefined, keyframes: Keyframe[] | PropertyIndexedKeyframes, options: KeyframeAnimationOptions): Animation | null {
  if (!el || typeof el.animate !== "function" || prefersReducedMotion()) return null;
  const anim = el.animate(keyframes, { easing: EASE_OUT, ...options });
  const style = (el as HTMLElement).style;
  if (style && anim && typeof anim.addEventListener === "function") {
    style.willChange = "transform, opacity";
    const release = () => {
      style.willChange = "";
    };
    anim.addEventListener("finish", release, { once: true });
    anim.addEventListener("cancel", release, { once: true });
  }
  return anim;
}

/**
 * Retraso de entrada escalonado para listas que aparecen de golpe tras cargar datos (pocas filas).
 * Úsalo con la clase `animate-stagger-in`. Cada elemento espera `stepMs` más que el anterior, hasta `maxMs`.
 * Con "reducir movimiento" no devuelve nada (y la clase no anima).
 */
export function stagger(index: number, stepMs = 30, maxMs = 180): { animationDelay?: string } {
  if (prefersReducedMotion()) return {};
  return { animationDelay: `${Math.min(Math.max(0, index) * stepMs, maxMs)}ms` };
}

/** Un "pop" corto (escala 0,96 → 1,01 → 1) para confirmar una acción, p. ej. agregar al carrito. Usa los mismos 200 ms y la misma curva. */
export const POP_KEYFRAMES: Keyframe[] = [
  { transform: "scale3d(0.96, 0.96, 1)", offset: 0 },
  { transform: "scale3d(1.01, 1.01, 1)", offset: 0.6 },
  { transform: "scale3d(1, 1, 1)", offset: 1 },
];

/**
 * Salida de una pantalla al cambiar de módulo: se atenúa hasta 0,4 y sube 6 px. No llega a 0 a propósito:
 * si la pantalla nueva tarda en llegar, la anterior sigue visible (atenuada) en vez de dejar la página en blanco.
 */
export const PAGE_EXIT_KEYFRAMES: Keyframe[] = [
  { opacity: 1, transform: "translate3d(0, 0, 0)" },
  { opacity: 0.4, transform: "translate3d(0, -6px, 0)" },
];

/* ---------- FLIP: mover lo que queda cuando algo sale de una lista, solo con transform ---------- */

/** Posición de un elemento respecto al contenedor (no depende del scroll). */
export interface FlipPoint {
  x: number;
  y: number;
}

/** Cuánto hay que desplazar un elemento (de donde estaba a donde está) para que parezca no haberse movido. Null si casi no se movió. */
export function flipDelta(first: FlipPoint, last: FlipPoint, threshold = 0.5): FlipPoint | null {
  const x = first.x - last.x;
  const y = first.y - last.y;
  if (Math.abs(x) < threshold && Math.abs(y) < threshold) return null;
  return { x, y };
}

/** Keyframes de un FLIP: parte del desplazamiento invertido y llega a su lugar. */
export function flipKeyframes(delta: FlipPoint): Keyframe[] {
  return [{ transform: `translate3d(${delta.x}px, ${delta.y}px, 0)` }, { transform: "translate3d(0, 0, 0)" }];
}

const FLIP_ATTR = "data-flip-key";

function flipChildren(container: HTMLElement): HTMLElement[] {
  return Array.from(container.children).filter((c): c is HTMLElement => c instanceof HTMLElement && c.hasAttribute(FLIP_ATTR));
}

/** "Primero": guarda dónde está cada hijo con `data-flip-key` (respecto al contenedor). */
export function measureFlip(container: HTMLElement | null | undefined): Map<string, FlipPoint> {
  const points = new Map<string, FlipPoint>();
  if (!container) return points;
  const origin = container.getBoundingClientRect();
  for (const el of flipChildren(container)) {
    const r = el.getBoundingClientRect();
    points.set(el.getAttribute(FLIP_ATTR) ?? "", { x: r.left - origin.left, y: r.top - origin.top });
  }
  return points;
}

/**
 * "Último + invertir + reproducir": los hijos que se movieron desde `first` se deslizan a su lugar con translate3d.
 * Con "reducir movimiento" no anima. Devuelve cuántos animó.
 */
export function playFlip(container: HTMLElement | null | undefined, first: Map<string, FlipPoint>, durationMs = 200): number {
  if (!container || first.size === 0 || prefersReducedMotion()) return 0;
  const now = measureFlip(container);
  let count = 0;
  for (const el of flipChildren(container)) {
    const key = el.getAttribute(FLIP_ATTR) ?? "";
    const from = first.get(key);
    const to = now.get(key);
    if (!from || !to) continue;
    const delta = flipDelta(from, to);
    if (delta && animateIn(el, flipKeyframes(delta), { duration: durationMs })) count++;
  }
  return count;
}
