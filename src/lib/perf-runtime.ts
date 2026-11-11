import { isLiteDevice, LEARNED_KEY, LITE_KEY } from "./perf-mode";

type NavigatorWithMemory = Navigator & { deviceMemory?: number };

/** Preferencia guardada y si el sistema ya aprendió que este equipo va lento. Sin almacenamiento: automático y nada aprendido. */
export function readPerfStorage(): { stored: string | null; learned: boolean } {
  try {
    return { stored: localStorage.getItem(LITE_KEY), learned: localStorage.getItem(LEARNED_KEY) === "1" };
  } catch {
    return { stored: null, learned: false };
  }
}

export function deviceHints() {
  const nav = navigator as NavigatorWithMemory;
  return { cores: nav.hardwareConcurrency, memory: nav.deviceMemory };
}

/** Decide con lo guardado y las pistas del equipo, y marca (o desmarca) el <html>. Devuelve si quedó en modo ligero. */
export function applyPerfMode(): boolean {
  const { stored, learned } = readPerfStorage();
  const lite = isLiteDevice(deviceHints(), stored, learned);
  const root = document.documentElement;
  if (lite) root.setAttribute("data-perf", "lite");
  else root.removeAttribute("data-perf");
  return lite;
}
