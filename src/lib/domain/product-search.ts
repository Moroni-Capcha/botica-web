/**
 * Búsqueda de productos (regla pura, se prueba con Vitest).
 * Con miles de productos, pasar a minúsculas cinco campos de cada uno en cada tecla pesa en equipos modestos:
 * el texto buscable se arma una sola vez por producto y cada tecla solo hace `includes`.
 */
import type { Product } from "@/lib/api/types";

type Searchable = Pick<Product, "id" | "name" | "active" | "lab" | "barcode" | "conc">;

/** Separador que una búsqueda no puede contener: así una palabra nunca cruza de un campo a otro. */
const SEP = "\u0000";

/** Texto buscable de cada producto, en minúsculas. Se rehace solo cuando cambia el catálogo. */
export function buildSearchIndex(products: readonly Searchable[]): Map<number, string> {
  return new Map(products.map((p) => [p.id, [p.name, p.active, p.lab, p.barcode, p.conc].join(SEP).toLowerCase()]));
}

/** `query` ya viene en minúsculas y sin espacios en los extremos. Vacío = todos. */
export const matchesSearch = (index: Map<number, string>, id: number, query: string): boolean => !query || (index.get(id)?.includes(query) ?? false);

/** Comparador de nombres con la configuración regional creada una sola vez (`localeCompare` la rehace en cada llamada). */
const collator = new Intl.Collator("es");
export const compareText = (a: string, b: string): number => collator.compare(a, b);
