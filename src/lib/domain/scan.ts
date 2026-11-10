/**
 * Detección de lector de código de barras (regla pura, se prueba con Vitest).
 * Un lector "teclea" el código en ráfaga (pocos milisegundos entre teclas) y termina con Enter.
 * Una persona no escribe así de rápido, por eso se distinguen.
 */

/** Tiempo máximo entre teclas de una misma ráfaga. */
export const MAX_GAP_MS = 50;
/** Largo mínimo para considerarlo un código. */
export const MIN_LENGTH = 4;

export interface ScanState {
  buf: string;
  last: number;
}

export const EMPTY_SCAN: ScanState = { buf: "", last: 0 };

export interface ScanResult {
  state: ScanState;
  /** Código completo, cuando la ráfaga terminó con Enter. */
  scan: string | null;
}

/** Procesa una tecla (sin modificadores) con su hora en milisegundos. */
export function feedScanKey(state: ScanState, key: string, at: number): ScanResult {
  if (key === "Enter") {
    const fast = state.buf.length >= MIN_LENGTH && at - state.last <= MAX_GAP_MS;
    return { state: EMPTY_SCAN, scan: fast ? state.buf : null };
  }
  if (key === "Shift") return { state, scan: null };
  if (key.length !== 1) return { state: EMPTY_SCAN, scan: null };
  const continues = state.buf !== "" && at - state.last <= MAX_GAP_MS;
  return { state: { buf: continues ? state.buf + key : key, last: at }, scan: null };
}
