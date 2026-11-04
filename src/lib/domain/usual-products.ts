/** Productos que un cliente suele llevar, para sugerirlos en el mostrador. Regla pura: no toca lo que recibe. */

export interface UsualHistoryEntry {
  /** Instante ISO de la compra. */
  at: string;
  items: ReadonlyArray<{ productId: number }>;
}

export interface UsualProduct {
  productId: number;
  /** En cuántas compras distintas lo llevó (no cuenta unidades). */
  times: number;
  /** Instante ISO de la compra más reciente que lo incluye. */
  lastAt: string;
}

export interface UsualOptions {
  /** Máximo de productos a devolver. */
  limit?: number;
  /** Veces mínimas comprado para considerarlo habitual. */
  minTimes?: number;
}

/**
 * Los productos que el cliente compró al menos `minTimes` veces, contando compras distintas.
 * Orden: más veces primero, luego la compra más reciente, luego el id (para que el resultado sea estable).
 */
export function usualProducts(history: ReadonlyArray<UsualHistoryEntry>, { limit = 4, minTimes = 2 }: UsualOptions = {}): UsualProduct[] {
  const acc = new Map<number, UsualProduct>();
  for (const purchase of history) {
    for (const productId of new Set(purchase.items.map((i) => i.productId))) {
      const cur = acc.get(productId);
      if (!cur) acc.set(productId, { productId, times: 1, lastAt: purchase.at });
      else acc.set(productId, { productId, times: cur.times + 1, lastAt: purchase.at > cur.lastAt ? purchase.at : cur.lastAt });
    }
  }
  return [...acc.values()]
    .filter((u) => u.times >= minTimes)
    .sort((a, b) => b.times - a.times || b.lastAt.localeCompare(a.lastAt) || a.productId - b.productId)
    .slice(0, Math.max(0, limit));
}
