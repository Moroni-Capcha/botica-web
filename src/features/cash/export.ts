import type { Branch, CashClosing, Pharmacy } from "@/lib/api/types";
import { MOVEMENT_LABEL } from "@/lib/domain/cash";
import { round2 } from "@/lib/domain/pharmacy";
import { downloadXlsx, fileStamp, sheet } from "@/lib/excel/xlsx";

const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const time = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

/** Cierres del periodo y, en otra hoja, los egresos, retiros e ingresos de cada turno. */
export function exportClosings({ closings, branches, scopeLabel, days, pharmacy }: { closings: CashClosing[]; branches: Branch[]; scopeLabel: string; days: number; pharmacy: Pharmacy | undefined }) {
  const name = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const rows = [...closings].sort((a, b) => a.closedAt.localeCompare(b.closedAt));
  const sum = (f: (c: CashClosing) => number) => round2(rows.reduce((s, c) => s + f(c), 0));
  const subtitle = `${pharmacy?.name ?? "Botica"} · ${scopeLabel} · Últimos ${days} días · Generado el ${new Date().toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}`;
  const movements = rows.flatMap((c) => c.movements.map((m) => ({ c, m })));
  downloadXlsx(
    `cierres-de-caja-${fileStamp()}.xlsx`,
    [
      sheet({
        name: "Cierres",
        title: "Cierres de caja",
        subtitle,
        rows,
        columns: [
          { header: "Fecha", value: (c) => localDay(c.closedAt), type: "date", width: 12 },
          { header: "Local", value: (c) => name(c.branchId), width: 12 },
          { header: "Apertura", value: (c) => time(c.openedAt), width: 9 },
          { header: "Cierre", value: (c) => time(c.closedAt), width: 9 },
          { header: "Cerró", value: (c) => c.closedBy, width: 18 },
          { header: "Comprobantes", value: (c) => c.tickets, type: "int", width: 11 },
          { header: "Fondo inicial", value: (c) => c.openingAmount, type: "money", width: 12 },
          { header: "Efectivo", value: (c) => c.sales.efectivo, type: "money", width: 12 },
          { header: "Yape / Plin", value: (c) => c.sales.yape, type: "money", width: 12 },
          { header: "Tarjeta", value: (c) => c.sales.tarjeta, type: "money", width: 12 },
          { header: "Venta total", value: (c) => round2(c.sales.efectivo + c.sales.yape + c.sales.tarjeta), type: "money", width: 13 },
          { header: "Egresos", value: (c) => c.egresos, type: "money", width: 11 },
          { header: "Retiros", value: (c) => c.retiros, type: "money", width: 11 },
          { header: "Ingresos", value: (c) => c.ingresos, type: "money", width: 11 },
          { header: "Debe haber", value: (c) => c.expected, type: "money", width: 12 },
          { header: "Contado", value: (c) => c.counted, type: "money", width: 12 },
          { header: "Diferencia", value: (c) => c.difference, type: "money", width: 11 },
          { header: "Observación", value: (c) => c.note, width: 32 },
        ],
        totals: {
          Comprobantes: rows.reduce((s, c) => s + c.tickets, 0),
          Efectivo: sum((c) => c.sales.efectivo),
          "Yape / Plin": sum((c) => c.sales.yape),
          Tarjeta: sum((c) => c.sales.tarjeta),
          "Venta total": sum((c) => c.sales.efectivo + c.sales.yape + c.sales.tarjeta),
          Egresos: sum((c) => c.egresos),
          Retiros: sum((c) => c.retiros),
          Ingresos: sum((c) => c.ingresos),
          Diferencia: sum((c) => c.difference),
        },
      }),
      sheet({
        name: "Movimientos",
        title: "Egresos, retiros e ingresos de caja",
        subtitle,
        rows: movements,
        columns: [
          { header: "Fecha", value: ({ m }) => localDay(m.at), type: "date", width: 12 },
          { header: "Hora", value: ({ m }) => time(m.at), width: 9 },
          { header: "Local", value: ({ c }) => name(c.branchId), width: 12 },
          { header: "Tipo", value: ({ m }) => MOVEMENT_LABEL[m.type], width: 10 },
          { header: "Motivo", value: ({ m }) => m.note, width: 34 },
          { header: "Monto", value: ({ m }) => (m.type === "ingreso" ? m.amount : -m.amount), type: "money", width: 12 },
          { header: "Registró", value: ({ m }) => m.userName, width: 18 },
        ],
        totals: { Monto: round2(movements.reduce((s, { m }) => s + (m.type === "ingreso" ? m.amount : -m.amount), 0)) },
      }),
    ],
    { brand: pharmacy?.brand, author: pharmacy?.name },
  );
}
