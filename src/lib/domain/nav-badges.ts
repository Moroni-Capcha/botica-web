/**
 * Avisos del menú lateral (reglas puras, se prueban con Vitest).
 * Cada aviso resume en un número o un punto lo que una pantalla pide atender.
 */
import type { ExpiryThresholds, Lot, VoucherStatus } from "@/lib/api/types";
import { DEFAULT_THRESHOLDS, daysUntil, expiryTone } from "./pharmacy";

export type BadgeTone = "danger" | "warn" | "ok" | "idle";

export interface NavBadge {
  /** Número a mostrar; sin él, solo un punto. */
  count?: number;
  tone: BadgeTone;
  /** Texto para lectores de pantalla y tooltip. */
  label: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Lotes con stock ya vencidos o a punto de vencer (rojo de la pantalla de vencimientos). */
export function expiryBadge(lots: Pick<Lot, "qty" | "expiresOn">[], now: number, thresholds: ExpiryThresholds = DEFAULT_THRESHOLDS): NavBadge | null {
  let expired = 0;
  let critical = 0;
  for (const l of lots) {
    if (l.qty <= 0) continue;
    const tone = expiryTone(daysUntil(l.expiresOn, now), thresholds);
    if (tone === "vencido") expired++;
    else if (tone === "critico") critical++;
  }
  const count = expired + critical;
  if (count === 0) return null;
  const parts = [expired > 0 && plural(expired, "lote vencido", "lotes vencidos"), critical > 0 && plural(critical, "lote por vencer pronto", "lotes por vencer pronto")].filter(Boolean);
  return { count, tone: expired > 0 ? "danger" : "warn", label: parts.join(" y ") };
}

/** Punto de la caja: abierta (verde) o cerrada (gris). Sin dato todavía, no muestra nada. */
export function cashBadge(session: { open: boolean } | undefined): NavBadge | null {
  if (!session) return null;
  return session.open ? { tone: "ok", label: "Caja abierta" } : { tone: "idle", label: "Caja cerrada" };
}

/** Comprobantes que piden atención: rechazados (rojo) o pendientes de SUNAT (ámbar). */
export function voucherBadge(counts: Pick<Record<VoucherStatus, number>, "pendiente" | "rechazado">): NavBadge | null {
  const count = counts.pendiente + counts.rechazado;
  if (count === 0) return null;
  const parts = [counts.rechazado > 0 && plural(counts.rechazado, "rechazado", "rechazados"), counts.pendiente > 0 && plural(counts.pendiente, "pendiente", "pendientes")].filter(Boolean);
  return { count, tone: counts.rechazado > 0 ? "danger" : "warn", label: `${parts.join(" y ")} en SUNAT` };
}
