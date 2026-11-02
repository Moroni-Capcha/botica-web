import type { QueryClient } from "@tanstack/react-query";
import { tenantStore } from "@/lib/api/tenant";
import { kvGet, kvSet } from "./storage";

/**
 * Copia en el equipo de lo que el punto de venta necesita para abrir sin internet: productos, lotes, stock,
 * estado de caja, ajustes y cuenta. TanStack Query ya guarda estos datos en memoria; esto los conserva al recargar la página.
 */
const ROOTS = new Set(["config", "account", "products", "lots", "branch-stock", "cash"]);
const SAVE_DELAY_MS = 1_500;
/** Más viejo que esto no se usa para abrir sin conexión: el stock sería engañoso. */
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;

interface Entry {
  queryKey: unknown[];
  data: unknown;
  updatedAt: number;
}

const keyFor = () => `query-cache.${tenantStore.get() ?? "default"}`;

export async function restoreQueryCache(qc: QueryClient): Promise<void> {
  const saved = await kvGet<{ entries?: Entry[] }>(keyFor());
  const now = Date.now();
  for (const e of saved?.entries ?? []) {
    if (!Array.isArray(e.queryKey) || now - e.updatedAt > MAX_AGE_MS) continue;
    // Lo que ya llegó de la red es más nuevo que la copia guardada.
    if (qc.getQueryData(e.queryKey) !== undefined) continue;
    qc.setQueryData(e.queryKey, e.data, { updatedAt: e.updatedAt });
  }
}

/** Guarda la copia cada vez que cambian esos datos (con una pequeña espera para no escribir a cada momento). Devuelve cómo detenerla. */
export function startQueryCachePersistence(qc: QueryClient): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    const entries: Entry[] = [];
    for (const q of qc.getQueryCache().getAll()) {
      const root = q.queryKey[0];
      if (typeof root !== "string" || !ROOTS.has(root) || q.state.status !== "success" || q.state.data === undefined) continue;
      entries.push({ queryKey: [...q.queryKey], data: q.state.data, updatedAt: q.state.dataUpdatedAt });
    }
    if (entries.length) void kvSet(keyFor(), { savedAt: Date.now(), entries });
  };
  const unsubscribe = qc.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" && event.type !== "added") return;
    const root = event.query.queryKey[0];
    if (typeof root !== "string" || !ROOTS.has(root)) return;
    if (!timer) timer = setTimeout(save, SAVE_DELAY_MS);
  });
  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
  };
}
