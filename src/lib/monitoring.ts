/**
 * Monitoreo de errores (Sentry) SIN agregar el SDK al proyecto.
 *
 * Es una capa delgada: no hace nada mientras no haya `NEXT_PUBLIC_SENTRY_DSN` y un reporter. El reporter es cualquier objeto con la
 * forma de `@sentry/browser` / `@sentry/nextjs` (`captureException`, `captureMessage`, y opcionalmente `setUser` y `setTag`). Se
 * entrega de dos maneras: `setMonitoringReporter(Sentry)` desde un módulo de arranque que agrega DevOps, o un `window.Sentry`
 * global (por ejemplo el script "loader" de Sentry). Los pasos están en el README, sección "Monitoreo de errores".
 *
 * Antes de salir, todo texto y contexto pasa por `redactValue` (DNI, RUC, celulares, correos, nombres de clientes, PIN y tokens
 * nunca llegan a Sentry). Del usuario solo se envía su id interno, y como etiquetas la botica (código), el rol y el local.
 */
import { redactContext, redactText } from "@/lib/domain/privacy";

export type MonitoringLevel = "info" | "warning" | "error";

/** Lo mínimo que se necesita del SDK. `@sentry/browser` ya lo cumple. */
export interface MonitoringReporter {
  captureException(error: unknown, hint?: { tags?: Record<string, string>; extra?: Record<string, unknown> }): unknown;
  captureMessage(message: string, hint?: { level?: MonitoringLevel; tags?: Record<string, string>; extra?: Record<string, unknown> }): unknown;
  setUser?(user: { id: string } | null): void;
  setTag?(key: string, value: string): void;
}

export interface MonitoringUser {
  /** Código de la botica ("botica-huanuco"). */
  tenant?: string | null;
  role?: string | null;
  branchId?: string | null;
  /** Id interno de la cuenta (nunca el nombre). */
  userId?: string | null;
}

let injected: MonitoringReporter | null = null;
let user: MonitoringUser | null = null;

const dsn = (): string => process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ?? "";

/** El reporter activo: solo existe si hay DSN. Sin DSN o sin SDK, todo lo de este módulo es un no-op. */
function reporter(): MonitoringReporter | null {
  if (!dsn()) return null;
  return injected ?? (globalThis as { Sentry?: MonitoringReporter }).Sentry ?? null;
}

export const isMonitoringEnabled = (): boolean => reporter() !== null;

/** Etiquetas fijas de cada reporte: de qué botica, rol y local viene el error. */
function tags(extra?: Record<string, string>): Record<string, string> {
  const t: Record<string, string> = {};
  if (user?.tenant) t.tenant = user.tenant;
  if (user?.role) t.role = user.role;
  if (user?.branchId) t.branch = user.branchId;
  return { ...t, ...extra };
}

function applyUser(r: MonitoringReporter) {
  try {
    r.setUser?.(user?.userId ? { id: user.userId } : null);
    for (const [k, v] of Object.entries(tags())) r.setTag?.(k, v);
  } catch {
    /* el monitoreo nunca rompe la app */
  }
}

/** Entrega el SDK ya inicializado (`setMonitoringReporter(Sentry)`). Si ya había una sesión abierta, la aplica de una vez. */
export function setMonitoringReporter(next: MonitoringReporter | null) {
  injected = next;
  const r = reporter();
  if (r && user) applyUser(r);
}

/** Quién está usando la app, sin datos personales. `null` al cerrar la sesión. */
export function setMonitoringUser(next: MonitoringUser | null) {
  user = next;
  const r = reporter();
  if (r) applyUser(r);
}

/** Una copia del error con el mensaje y la traza limpios; conserva el nombre. */
function sanitizeError(error: unknown): Error {
  if (error instanceof Error) {
    const copy = new Error(redactText(error.message));
    copy.name = error.name;
    if (error.stack) copy.stack = redactText(error.stack);
    return copy;
  }
  return new Error(redactText(typeof error === "string" ? error : "Error no identificado"));
}

/** Datos útiles de un error de la API (código y estado HTTP), sin su mensaje ni sus detalles. */
function apiInfo(error: unknown): Record<string, unknown> {
  const e = error as { code?: unknown; status?: unknown } | null;
  return e && typeof e === "object" ? { ...(typeof e.code === "string" ? { code: e.code } : {}), ...(typeof e.status === "number" ? { status: e.status } : {}) } : {};
}

/** Avisa de un error inesperado. `context` es información extra (ámbito, pantalla…): se limpia antes de salir. */
export function captureException(error: unknown, context?: Record<string, unknown>) {
  const r = reporter();
  if (!r) return;
  try {
    r.captureException(sanitizeError(error), { tags: tags(), extra: { ...apiInfo(error), ...redactContext(context) } });
  } catch {
    /* el monitoreo nunca rompe la app */
  }
}

/** Avisa de algo que no es una excepción pero conviene saber (p. ej. una venta que no se pudo sincronizar). */
export function captureMessage(message: string, level: MonitoringLevel = "info", context?: Record<string, unknown>) {
  const r = reporter();
  if (!r) return;
  try {
    r.captureMessage(redactText(message), { level, tags: tags(), extra: redactContext(context) });
  } catch {
    /* el monitoreo nunca rompe la app */
  }
}

/**
 * ¿Vale la pena reportar este error? Los 4xx son reglas del negocio que ya se muestran al usuario (stock insuficiente, PIN
 * incorrecto…) y el estado 0 es "sin conexión", normal en un local con internet débil: ninguno se reporta. Sí los 5xx y
 * cualquier error que no venga de la API.
 */
export function isReportableError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status >= 500 : true;
}

/** Errores que nadie atrapó (`error` y `unhandledrejection` de la ventana). Devuelve cómo quitarlos. */
export function installGlobalErrorHandlers(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onError = (e: ErrorEvent) => captureException(e.error ?? e.message, { scope: "window" });
  const onRejection = (e: PromiseRejectionEvent) => {
    if (isReportableError(e.reason)) captureException(e.reason, { scope: "promise" });
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
