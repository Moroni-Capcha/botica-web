/**
 * Modo ligero para equipos de pocos recursos (regla pura, se prueba con Vitest).
 * Apaga animaciones y desenfoques decorativos: la pantalla responde igual y el procesador queda libre para lo importante.
 * Se detecta solo; `localStorage["bh.lite"]` lo fuerza ("1") o lo desactiva ("0") en un equipo concreto.
 */

export const LITE_KEY = "bh.lite";

export interface DeviceHints {
  /** `navigator.hardwareConcurrency`: núcleos lógicos. */
  cores?: number;
  /** `navigator.deviceMemory`: GB aproximados de RAM (Chrome la redondea hacia abajo, máximo 8). */
  memory?: number;
}

/** Con pocos núcleos o poca memoria, el equipo es modesto. Sin datos del navegador, se asume normal. */
export const isLiteDevice = (hints: DeviceHints, stored: string | null): boolean => {
  if (stored === "1") return true;
  if (stored === "0") return false;
  return (hints.cores !== undefined && hints.cores <= 2) || (hints.memory !== undefined && hints.memory <= 2);
};

/**
 * Se ejecuta en el <head>, antes del primer pintado. Misma regla que `isLiteDevice`, escrita sin dependencias.
 * Marca el <html> con data-perf="lite" para que el CSS y `prefersReducedMotion()` lo vean desde el principio.
 */
export const PERF_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem("${LITE_KEY}");var c=navigator.hardwareConcurrency,m=navigator.deviceMemory;var lite=s==="1"||(s!=="0"&&((c!==undefined&&c<=2)||(m!==undefined&&m<=2)));if(lite)document.documentElement.setAttribute("data-perf","lite")}catch(e){}})()`;
