import type { Branch, ExpiryThresholds, Pharmacy } from "@/lib/api/types";
import { priorityList, type LotRisk } from "@/lib/domain/expiry";
import { round2 } from "@/lib/domain/pharmacy";
import { downloadXlsx, fileStamp, sheet } from "@/lib/excel/xlsx";
import { TONE } from "@/components/ui/badges";

interface ExportInput {
  rows: LotRisk[];
  branches: Branch[];
  scopeLabel: string;
  pharmacy: Pharmacy | undefined;
  thresholds: ExpiryThresholds;
  velocityDays: number;
}

/** Libro de Excel con la prioridad de venta y todos los lotes, con los filtros aplicados en pantalla. */
export function exportExpiry({ rows, branches, scopeLabel, pharmacy, thresholds, velocityDays }: ExportInput) {
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const generated = new Date().toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });
  const header = `${pharmacy?.name ?? "Botica"} · ${scopeLabel} · Generado el ${generated}`;
  const priority = priorityList(rows);
  const all = [...rows].sort((a, b) => a.days - b.days || a.product.name.localeCompare(b.product.name));

  const sheets = [
    sheet({
      name: "Prioridad de venta",
      title: "Prioridad de venta: lotes que no se venderán a tiempo",
      subtitle: `${header} · Ritmo de venta de los últimos ${velocityDays} días`,
      rows: priority,
      columns: [
        { header: "Local", value: (r) => branchName(r.branchId), width: 14 },
        { header: "Producto", value: (r) => `${r.product.name} ${r.product.conc}`, width: 34 },
        { header: "Laboratorio", value: (r) => r.product.lab, width: 16 },
        { header: "Tipo", value: (r) => r.product.category, width: 16 },
        { header: "Lote", value: (r) => r.lot.code, width: 12 },
        { header: "Vencimiento", value: (r) => r.lot.expiresOn, type: "date", width: 13 },
        { header: "Días para vencer", value: (r) => r.days, type: "int", width: 11 },
        { header: "Stock del lote (unid.)", value: (r) => r.lot.qty, type: "int", width: 13 },
        { header: "Venta diaria actual", value: (r) => round2(r.rate), type: "num", width: 12 },
        { header: "Venta diaria necesaria", value: (r) => (Number.isFinite(r.needRate) ? round2(r.needRate) : null), type: "num", width: 12 },
        { header: "Unid. en riesgo", value: (r) => r.atRisk, type: "int", width: 11 },
        { header: "Pérdida estimada", value: (r) => r.loss, type: "money", width: 15 },
        { header: "Descuento aplicado", value: (r) => r.lot.discount, type: "pct", width: 12 },
        { header: "Ubicación", value: (r) => r.product.location, width: 10 },
      ],
      totals: { "Unid. en riesgo": priority.reduce((s, r) => s + r.atRisk, 0), "Pérdida estimada": round2(priority.reduce((s, r) => s + r.loss, 0)) },
    }),
    sheet({
      name: "Todos los lotes",
      title: "Lotes y fechas de vencimiento",
      subtitle: `${header} · Crítico: hasta ${thresholds.red} días · Por vencer: hasta ${thresholds.yellow} días`,
      rows: all,
      columns: [
        { header: "Estado", value: (r) => TONE[r.tone].label, width: 11 },
        { header: "Local", value: (r) => branchName(r.branchId), width: 14 },
        { header: "Tipo", value: (r) => r.product.category, width: 16 },
        { header: "Producto", value: (r) => `${r.product.name} ${r.product.conc}`, width: 34 },
        { header: "Principio activo", value: (r) => r.product.active, width: 24 },
        { header: "Laboratorio", value: (r) => r.product.lab, width: 16 },
        { header: "Registro sanitario", value: (r) => r.product.sanitaryReg, width: 14 },
        { header: "Lote", value: (r) => r.lot.code, width: 12 },
        { header: "Vencimiento", value: (r) => r.lot.expiresOn, type: "date", width: 13 },
        { header: "Días", value: (r) => r.days, type: "int", width: 8 },
        { header: "Cantidad (unid.)", value: (r) => r.lot.qty, type: "int", width: 12 },
        { header: "Costo unidad", value: (r) => r.lot.cost, type: "money", width: 12 },
        { header: "Valor a costo", value: (r) => r.value, type: "money", width: 14 },
        { header: "Descuento", value: (r) => r.lot.discount, type: "pct", width: 10 },
        { header: "Proveedor", value: (r) => r.lot.supplier ?? "", width: 30 },
        { header: "Ingreso", value: (r) => r.lot.receivedOn ?? "", type: "date", width: 12 },
        { header: "Ubicación", value: (r) => r.product.location, width: 10 },
      ],
      totals: { "Cantidad (unid.)": all.reduce((s, r) => s + r.lot.qty, 0), "Valor a costo": round2(all.reduce((s, r) => s + r.value, 0)) },
    }),
  ];

  downloadXlsx(`vencimientos-${fileStamp()}.xlsx`, sheets, { brand: pharmacy?.brand, author: pharmacy?.name });
  return priority.length;
}
