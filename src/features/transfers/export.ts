import type { Branch, Pharmacy, Product, Transfer } from "@/lib/api/types";
import { round2 } from "@/lib/domain/pharmacy";
import { downloadXlsx, fileStamp, sheet } from "@/lib/excel/xlsx";

export const STATUS_LABEL: Record<Transfer["status"], string> = { solicitado: "Pedido", en_transito: "En camino", recibido: "Recibido", anulado: "Anulado" };

const localDay = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Una fila por lote trasladado (o por producto pedido si aún no se despachó). */
export function exportTransfers({ transfers, products, branches, scopeLabel, days, pharmacy }: { transfers: Transfer[]; products: Product[]; branches: Branch[]; scopeLabel: string; days: number; pharmacy: Pharmacy | undefined }) {
  const name = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const byId = new Map(products.map((p) => [p.id, p]));
  const rows = [...transfers]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .flatMap((t) =>
      t.items.length
        ? t.items.map((it) => ({ t, productId: it.productId, units: it.units, lotCode: it.lotCode ?? "", expiresOn: it.expiresOn ?? "", cost: it.unitCost ?? byId.get(it.productId)?.cost ?? 0 }))
        : (t.requested ?? []).map((r) => ({ t, productId: r.productId, units: r.units, lotCode: "", expiresOn: "", cost: byId.get(r.productId)?.cost ?? 0 })),
    );
  downloadXlsx(
    `traslados-${fileStamp()}.xlsx`,
    [
      sheet({
        name: "Traslados",
        title: `Traslados entre locales · últimos ${days} días y en curso`,
        subtitle: `${pharmacy?.name ?? "Botica"} · ${scopeLabel} · Generado el ${new Date().toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}`,
        rows,
        columns: [
          { header: "N.º", value: (r) => r.t.code, width: 9 },
          { header: "Fecha", value: (r) => localDay(r.t.createdAt), type: "date", width: 12 },
          { header: "Estado", value: (r) => STATUS_LABEL[r.t.status], width: 11 },
          { header: "Origen", value: (r) => name(r.t.fromBranchId), width: 13 },
          { header: "Destino", value: (r) => name(r.t.toBranchId), width: 13 },
          { header: "Producto", value: (r) => { const p = byId.get(r.productId); return p ? `${p.name} ${p.conc}` : `Producto ${r.productId}`; }, width: 32 },
          { header: "Laboratorio", value: (r) => byId.get(r.productId)?.lab ?? "", width: 15 },
          { header: "Lote", value: (r) => r.lotCode, width: 12 },
          { header: "Vencimiento", value: (r) => r.expiresOn, type: "date", width: 13 },
          { header: "Unidades", value: (r) => r.units, type: "int", width: 10 },
          { header: "Valor a costo", value: (r) => round2(r.units * r.cost), type: "money", width: 13 },
          { header: "Creó", value: (r) => r.t.createdBy, width: 18 },
          { header: "Despachó", value: (r) => r.t.dispatchedBy ?? "", width: 18 },
          { header: "Recibió", value: (r) => r.t.receivedBy ?? "", width: 18 },
          { header: "Fecha de recepción", value: (r) => localDay(r.t.receivedAt), type: "date", width: 13 },
          { header: "Nota o motivo de anulación", value: (r) => [r.t.note, r.t.cancelReason ? `Anulado: ${r.t.cancelReason}` : ""].filter(Boolean).join(" · "), width: 34 },
        ],
        totals: { Unidades: rows.reduce((s, r) => s + r.units, 0), "Valor a costo": round2(rows.reduce((s, r) => s + r.units * r.cost, 0)) },
      }),
    ],
    { brand: pharmacy?.brand, author: pharmacy?.name },
  );
}
