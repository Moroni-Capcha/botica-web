/** Curva de salida de los tokens de movimiento (`--ease-out` en globals.css), para animaciones hechas desde JavaScript. */
export const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

/** ¿La persona pidió menos movimiento? Seguro en el servidor (ahí no hay animaciones, así que devuelve false). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Anima un elemento con la API nativa (Web Animations) respetando "reducir movimiento":
 * con esa preferencia no anima nada. Devuelve la animación, o null si no corrió.
 */
export function animateIn(el: Element | null | undefined, keyframes: Keyframe[] | PropertyIndexedKeyframes, options: KeyframeAnimationOptions): Animation | null {
  if (!el || typeof el.animate !== "function" || prefersReducedMotion()) return null;
  return el.animate(keyframes, { easing: EASE_OUT, ...options });
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
