import { api, isApiError } from "@/lib/api";
import { connection } from "@/lib/api/connection";
import { dueItems, type SyncOutcome } from "@/lib/domain/offline-sales";
import { useQueueStore } from "./queue-store";

export interface SyncReport {
  /** Ventas que el servidor registró (nuevas o ya conocidas por su clave). */
  sent: number;
  /** Ventas rechazadas por una regla: quedan en la lista para revisarlas. */
  failed: number;
  /** Ventas que siguen pendientes por falta de red u otro fallo pasajero. */
  waiting: number;
  /** Locales cuyas ventas se enviaron (para refrescar su stock y su caja). */
  branches: string[];
}

let running: Promise<SyncReport> | null = null;

const asError = (e: unknown): { code?: string; status?: number; message: string } =>
  isApiError(e) ? { code: e.code, status: e.status, message: e.message } : { code: "SIN_CONEXION", status: 0, message: e instanceof Error ? e.message : "No se pudo enviar." };

/**
 * Envía la cola al servidor: en orden de cobro, en lotes, esperando cada respuesta antes del siguiente lote.
 * Solo corre una vez a la vez. `force` ignora la espera de los reintentos (botón "Sincronizar ahora").
 * Una venta solo sale de la cola cuando el servidor confirmó haberla registrado.
 */
export function syncQueue({ force = false }: { force?: boolean } = {}): Promise<SyncReport> {
  if (running) return running;
  running = (async (): Promise<SyncReport> => {
    const report: SyncReport = { sent: 0, failed: 0, waiting: 0, branches: [] };
    const store = useQueueStore.getState();
    await store.hydrate();
    if (force) useQueueStore.getState().forceDue();
    for (;;) {
      if (!connection.isOnline() && !force) break;
      const batch = dueItems(useQueueStore.getState().state, Date.now());
      if (batch.length === 0) break;
      const ids = batch.map((i) => i.clientSaleId);
      useQueueStore.getState().markSyncing(ids);
      let failedBatch = false;
      try {
        const { results } = await api.syncSales({ sales: batch.map((i) => i.request) });
        const answered = new Set<string>();
        for (const r of results) {
          answered.add(r.clientSaleId);
          const outcome: SyncOutcome = r.status === "failed" ? { ok: false, error: r.error } : { ok: true, saleNumber: r.sale.number, saleId: r.sale.id };
          useQueueStore.getState().outcome(r.clientSaleId, outcome);
          if (outcome.ok) {
            report.sent++;
            const branch = batch.find((i) => i.clientSaleId === r.clientSaleId)?.branchId;
            if (branch && !report.branches.includes(branch)) report.branches.push(branch);
          } else if (useQueueStore.getState().state.items.find((i) => i.clientSaleId === r.clientSaleId)?.status === "failed") report.failed++;
          else report.waiting++;
        }
        /* Una venta que el servidor no mencionó no se da por enviada: vuelve a pendiente. */
        const missing = ids.filter((id) => !answered.has(id));
        if (missing.length) {
          useQueueStore.getState().batchError(missing, { code: "RESPUESTA_INCOMPLETA", message: "El servidor no confirmó esta venta. Se volverá a intentar." });
          report.waiting += missing.length;
          failedBatch = true;
        }
      } catch (e) {
        useQueueStore.getState().batchError(ids, asError(e));
        report.waiting += ids.length;
        failedBatch = true;
      }
      if (failedBatch) break; // sin red o servidor caído: se vuelve a intentar más tarde, no en bucle
    }
    return report;
  })().finally(() => {
    running = null;
  });
  return running;
}
