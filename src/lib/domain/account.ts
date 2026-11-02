/**
 * Estado de la cuenta del cliente (prueba, activa, vencida, suspendida) y módulos del plan.
 * Reglas puras: el backend debería aplicar los mismos casos. Fechas: días locales YYYY-MM-DD (America/Lima).
 */
import type { Account, AccountStatus } from "@/lib/api/types";

const DAY = 86_400_000;

/** Ids de módulo = ids de `src/lib/nav.ts`. */
export const ALL_MODULES = ["panel", "pos", "vencimientos", "inventario", "traslados", "compras", "clientes", "caja", "comprobantes", "asistencia", "reportes", "ajustes"] as const;

/** Día local de Lima (YYYY-MM-DD) de un instante. */
export const limaDay = (now: number): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

const utcDay = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

/** Suspendida = solo lectura: se puede mirar todo, no se escribe nada. */
export const isReadOnly = (status: AccountStatus): boolean => status === "suspended";

/** Días que faltan hasta `trialEndsAt` (0 = termina hoy, negativo = ya pasó). */
export const daysLeft = (trialEndsAt: string, today: string): number => Math.round((utcDay(trialEndsAt) - utcDay(today)) / DAY);

/** Una prueba que ya pasó su último día cuenta como vencida. El resto de estados se respeta tal cual. */
export function effectiveStatus(account: Pick<Account, "status" | "trialEndsAt">, today: string): AccountStatus {
  if (account.status === "trial" && account.trialEndsAt && daysLeft(account.trialEndsAt, today) < 0) return "overdue";
  return account.status;
}

/** Módulos que puede ver el usuario: los de su rol que además incluye el plan. */
export const allowedModules = (planModules: readonly string[], rolePermissions: readonly string[]): string[] => rolePermissions.filter((m) => planModules.includes(m));

export const STATUS_LABEL: Record<AccountStatus, string> = { trial: "En prueba", active: "Activa", overdue: "Vencida", suspended: "Suspendida" };

export interface AccountNotice {
  tone: "info" | "warn" | "error";
  message: string;
}

/** Aviso a mostrar arriba en toda la app. Una cuenta activa no muestra nada. */
export function accountNotice(account: Pick<Account, "status" | "trialEndsAt">, today: string): AccountNotice | null {
  const status = effectiveStatus(account, today);
  if (status === "suspended") return { tone: "error", message: "Tu cuenta está suspendida: puedes mirar todo, pero no registrar cambios (solo lectura)." };
  if (status === "overdue") return { tone: "warn", message: "Tu plan está vencido. Regulariza el pago para no perder el acceso." };
  if (status === "trial" && account.trialEndsAt) {
    const d = daysLeft(account.trialEndsAt, today);
    return { tone: d <= 3 ? "warn" : "info", message: d === 0 ? "Tu prueba gratis termina hoy." : d === 1 ? "Te queda 1 día de prueba gratis." : `Te quedan ${d} días de prueba gratis.` };
  }
  return null;
}
