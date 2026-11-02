"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateAfterSale } from "@/lib/queries";
import { syncQueue, type SyncReport } from "@/lib/offline/sync";
import { notify } from "@/components/ui/toast";

/** Envía la cola, refresca el stock de los locales con ventas enviadas y avisa el resultado. */
export function useSyncNow() {
  const qc = useQueryClient();
  return useCallback(
    async ({ force = false }: { force?: boolean } = {}): Promise<SyncReport> => {
      const report = await syncQueue({ force });
      for (const branchId of report.branches) invalidateAfterSale(qc, branchId);
      if (report.sent > 0) notify(report.sent === 1 ? "1 venta enviada" : `${report.sent} ventas enviadas`);
      if (report.failed > 0) notify(report.failed === 1 ? "1 venta no se pudo registrar. Revísala en “Ventas por enviar”." : `${report.failed} ventas no se pudieron registrar. Revísalas en “Ventas por enviar”.`, "warn");
      else if (force && report.sent === 0 && report.waiting > 0) notify("Aún no hay conexión con el servidor. Las ventas siguen guardadas.", "warn");
      return report;
    },
    [qc],
  );
}
