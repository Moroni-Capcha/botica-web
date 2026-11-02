/**
 * Paginación en el servidor: reglas puras compartidas por el front y el mock. El backend debería aplicar los mismos casos
 * (ver "Paginación en el servidor" en docs/API.md).
 */
import type { Page, PageQuery } from "@/lib/api/types";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

const wholeNumber = (n: unknown): number | null => (typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : null);

/** Página (desde 1) y tamaño válidos: lo que falta o no sirve toma el valor por defecto y el tamaño nunca pasa de 100. */
export function normalizePage(q: PageQuery = {}): { page: number; pageSize: number } {
  const page = wholeNumber(q.page);
  const size = wholeNumber(q.pageSize);
  return { page: page !== null && page >= 1 ? page : 1, pageSize: size !== null && size >= 1 ? Math.min(size, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE };
}

/** Cantidad de páginas; con 0 filas queda 1 (una página vacía). */
export const pageCount = (total: number, pageSize: number): number => Math.max(1, Math.ceil(total / Math.max(1, pageSize)));

/** Recorta una lista ya filtrada y ordenada. Una página fuera de rango se corrige a la última con datos. */
export function paginate<T>(all: readonly T[], q: PageQuery = {}): Page<T> {
  const { page: asked, pageSize } = normalizePage(q);
  const page = Math.min(asked, pageCount(all.length, pageSize));
  return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize };
}

/** "Mostrando 26 a 50 de 187": posiciones (desde 1) de la primera y la última fila de la página. Sin filas, 0 y 0. */
export function pageBounds(page: number, pageSize: number, total: number): { first: number; last: number } {
  if (total <= 0) return { first: 0, last: 0 };
  return { first: (page - 1) * pageSize + 1, last: Math.min(total, page * pageSize) };
}

/** Números de página a mostrar: siempre la primera, la última y las vecinas a la actual; los huecos largos se resumen con "…". */
export function pageWindow(page: number, pages: number, around = 1): (number | "…")[] {
  const keep = new Set<number>([1, pages]);
  for (let p = page - around; p <= page + around; p++) if (p >= 1 && p <= pages) keep.add(p);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((n, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && n - prev === 2) out.push(prev + 1);
    else if (prev !== undefined && n - prev > 2) out.push("…");
    out.push(n);
  });
  return out;
}
