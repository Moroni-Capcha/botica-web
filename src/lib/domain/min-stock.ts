/**
 * Copia de stock mínimos entre locales (regla pura, se prueba con Vitest).
 */
import type { BranchId, Product } from "@/lib/api/types";

/**
 * Copia el mínimo de cada producto del local `fromBranchId` al local `toBranchId`.
 * Si el producto no tiene mínimo propio en el origen, el nuevo local recibe el general (`minStock`).
 * No modifica los productos recibidos ni toca el stock; solo los mínimos.
 */
export function copyMinStock(products: Product[], fromBranchId: BranchId, toBranchId: BranchId): Product[] {
  if (!fromBranchId || fromBranchId === toBranchId) return products;
  return products.map((p) => ({
    ...p,
    minStockByBranch: { ...p.minStockByBranch, [toBranchId]: p.minStockByBranch?.[fromBranchId] ?? p.minStock },
  }));
}
