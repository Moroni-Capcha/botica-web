import type { Tone } from "@/components/ui/tone";
import type { StockStatus } from "@/lib/domain/inventory";

/** Tono del chip de estado de stock. Lo agotado va con relleno fuerte; lo normal no lleva chip. */
export const STOCK_TONE: Record<StockStatus, { tone: Tone; solid: boolean }> = {
  agotado: { tone: "danger", solid: true },
  bajo: { tone: "warning", solid: false },
  ok: { tone: "success", solid: false },
};

export type BranchStockTone = "empty" | "low" | "normal";

/** Cómo se lee el stock de un local en la tabla: sin unidades, en el mínimo o por debajo, o normal. */
export function branchStockTone(units: number, isLow: boolean): BranchStockTone {
  if (units === 0) return "empty";
  return isLow ? "low" : "normal";
}

export const BRANCH_STOCK_CLASS: Record<BranchStockTone, string> = {
  empty: "font-semibold text-muted",
  low: "font-semibold text-warning-fg",
  normal: "",
};

interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
}

/**
 * `F2` o `/` llevan al buscador. No actúan con un diálogo abierto ni mientras se escribe en otro campo
 * (en el propio buscador solo vale `F2`, para poder escribir una barra).
 */
export function shouldFocusSearch(e: KeyEventLike, s: { dialogOpen: boolean; inEditable: boolean; inSearch: boolean }): boolean {
  if (e.isComposing || s.dialogOpen || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.key === "F2") return !s.inEditable || s.inSearch;
  if (e.key === "/") return !s.inEditable;
  return false;
}
