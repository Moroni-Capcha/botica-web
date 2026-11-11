/**
 * Modo ligero para equipos de pocos recursos (regla pura, se prueba con Vitest).
 * Apaga animaciones y desenfoques decorativos: la pantalla responde igual y el procesador queda libre para lo importante.
 *
 * Cómo se decide, de más a menos fuerte:
 * 1. La persona lo elige con el botón: "Ligero" (1) o "Completo" (0). Manda siempre.
 * 2. En "Automático": si el sistema ya aprendió que este equipo va lento (midió de verdad), o si las pistas del
 *    navegador lo delatan (2 núcleos o menos, 2 GB o menos).
 */

/** Preferencia de la persona: "1" ligero, "0" completo, vacío = automático. */
export const LITE_KEY = "bh.lite";
/** El sistema midió que este equipo va lento ("1"). Solo cuenta en automático. */
export const LEARNED_KEY = "bh.lite.learned";

export type LitePref = "auto" | "lite" | "full";

export const parseLitePref = (value: unknown): LitePref => (value === "1" ? "lite" : value === "0" ? "full" : "auto");
export const liteStorageValue = (pref: LitePref): string | null => (pref === "lite" ? "1" : pref === "full" ? "0" : null);
/** Orden al tocar el botón: Automático → Ligero → Completo → Automático. */
export const nextLitePref = (pref: LitePref): LitePref => (pref === "auto" ? "lite" : pref === "lite" ? "full" : "auto");
export const LITE_LABEL: Record<LitePref, string> = { auto: "Automático", lite: "Ligero", full: "Completo" };

export interface DeviceHints {
  /** `navigator.hardwareConcurrency`: núcleos lógicos. */
  cores?: number;
  /** `navigator.deviceMemory`: GB aproximados de RAM (Chrome la redondea hacia abajo, máximo 8). */
  memory?: number;
}

export const isLiteDevice = (hints: DeviceHints, stored: string | null, learned = false): boolean => {
  if (stored === "1") return true;
  if (stored === "0") return false;
  return learned || (hints.cores !== undefined && hints.cores <= 2) || (hints.memory !== undefined && hints.memory <= 2);
};

/** Lo que se midió de este equipo mientras se usaba la app. */
export interface PerfStats {
  /** Tiempo total con el hilo principal bloqueado (tareas de más de 50 ms) durante la carga. */
  longTaskMs: number;
  /** Interacciones (clic, tecla, toque) que tardaron en responder más de 250 ms. */
  slowInteractions: number;
}

/** Bloqueo acumulado de la carga a partir del cual el equipo se considera lento (en uno bueno ronda 0,3 a 0,6 s). */
export const LOAD_BLOCK_LIMIT_MS = 1500;
/** Interacciones lentas a partir de las cuales el equipo se considera lento (una suelta puede ser un tropiezo). */
export const SLOW_INTERACTION_LIMIT = 3;
/** Una interacción es lenta si tarda más de esto (el límite "pobre" de INP es 500 ms; aquí se actúa antes). */
export const SLOW_INTERACTION_MS = 250;

export const shouldLearnLite = (stats: PerfStats): boolean => stats.longTaskMs >= LOAD_BLOCK_LIMIT_MS || stats.slowInteractions >= SLOW_INTERACTION_LIMIT;

/**
 * Se ejecuta en el <head>, antes del primer pintado. Misma regla que `isLiteDevice`, escrita sin dependencias.
 * Marca el <html> con data-perf="lite" para que el CSS y `prefersReducedMotion()` lo vean desde el principio.
 */
export const PERF_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem("${LITE_KEY}");var l=localStorage.getItem("${LEARNED_KEY}")==="1";var c=navigator.hardwareConcurrency,m=navigator.deviceMemory;var lite=s==="1"||(s!=="0"&&(l||(c!==undefined&&c<=2)||(m!==undefined&&m<=2)));if(lite)document.documentElement.setAttribute("data-perf","lite")}catch(e){}})()`;
