import type { Branch, Pharmacy, Product, SalesReportLine } from "@/lib/api/types";
import { PAYMENT_LABEL } from "@/lib/domain/cash";
import { byDay, groupLines, prescriptionBook, totalsOf, type DeadStockRow, type GroupRow, type Period } from "@/lib/domain/reports";
import { downloadXlsx, fileStamp, sheet, type Sheet } from "@/lib/excel/xlsx";

const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const time = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

interface ExportInput {
  lines: SalesReportLine[];
  products: Product[];
  deadRows: DeadStockRow[];
  period: Period;
  branches: Branch[];
  branchIds: string[];
  scopeLabel: string;
  pharmacy: Pharmacy | undefined;
}

/** Libro completo del periodo: resumen, por día, producto, laboratorio, tipo, local, vendedor, pago, sin movimiento, recetas y detalle. */
export function exportReport({ lines, products, deadRows, period, branches, branchIds, scopeLabel, pharmacy }: ExportInput) {
  const pm = new Map(products.map((p) => [p.id, p]));
  const product = (id: number) => pm.get(id);
  const name = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const subtitle = `${pharmacy?.name ?? "Botica"} · ${scopeLabel} · ${period.label} (${period.from} a ${period.to}) · Generado el ${new Date().toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}`;
  const t = totalsOf(lines);
  const days = byDay(lines, period, branchIds);
  const book = prescriptionBook(lines, pm);
  type Day = (typeof days)[number];

  const groupSheet = (sheetName: string, title: string, rows: GroupRow[], header: string): Sheet =>
    sheet({
      name: sheetName,
      title,
      subtitle,
      rows,
      columns: [
        { header, value: (r) => r.label, width: 30 },
        { header: "Unidades", value: (r) => r.units, type: "int", width: 10 },
        { header: "Comprobantes", value: (r) => r.tickets, type: "int", width: 12 },
        { header: "Venta con IGV", value: (r) => r.total, type: "money", width: 14 },
        { header: "Venta sin IGV", value: (r) => r.taxBase, type: "money", width: 14 },
        { header: "Costo", value: (r) => r.cost, type: "money", width: 13 },
        { header: "Utilidad", value: (r) => r.profit, type: "money", width: 13 },
        { header: "Margen", value: (r) => r.margin / 100, type: "pct", width: 9 },
        { header: "Participación", value: (r) => r.share, type: "pct", width: 11 },
      ],
      totals: { Unidades: t.units, "Venta con IGV": t.total, "Venta sin IGV": t.taxBase, Costo: t.cost, Utilidad: t.profit },
    });

  const summary: { label: string; value: number; type: "money" | "pct" | "int" }[] = [
    { label: "Venta con IGV", value: t.total, type: "money" },
    { label: "IGV (18 %)", value: t.igv, type: "money" },
    { label: "Venta sin IGV", value: t.taxBase, type: "money" },
    { label: "Costo de lo vendido", value: t.cost, type: "money" },
    { label: "Utilidad bruta", value: t.profit, type: "money" },
    { label: "Margen sobre venta sin IGV (%)", value: t.margin, type: "pct" },
    { label: "Comprobantes", value: t.tickets, type: "int" },
    { label: "Ticket promedio", value: t.avgTicket, type: "money" },
    { label: "Unidades vendidas", value: t.units, type: "int" },
  ];

  downloadXlsx(
    `reporte-ventas-${period.from}-a-${period.to}-${fileStamp()}.xlsx`,
    [
      sheet({
        name: "Resumen",
        title: `Resumen de ventas · ${period.label}`,
        subtitle,
        rows: summary,
        columns: [
          { header: "Indicador", value: (r) => r.label, width: 30 },
          { header: "Soles", value: (r) => (r.type === "money" ? r.value : null), type: "money", width: 15 },
          { header: "Cantidad o %", value: (r) => (r.type === "money" ? null : r.value), type: "num", width: 13 },
        ],
      }),
      sheet({
        name: "Por día",
        title: "Venta por día",
        subtitle,
        rows: days,
        columns: [
          { header: "Fecha", value: (d) => d.date, type: "date", width: 12 },
          ...branchIds.map((b) => ({ header: name(b), value: (d: Day) => d.byBranch[b] ?? 0, type: "money" as const, width: 13 })),
          ...(branchIds.length > 1 ? [{ header: "Total", value: (d: Day) => d.total, type: "money" as const, width: 13 }] : []),
          { header: "Comprobantes", value: (d) => d.tickets, type: "int", width: 12 },
        ],
        totals: { Comprobantes: t.tickets, ...(branchIds.length > 1 ? { Total: t.total } : { [name(branchIds[0] ?? "")]: t.total }) },
      }),
      groupSheet("Por producto", "Venta por producto", groupLines(lines, (l) => String(l.productId), (k) => { const p = product(Number(k)); return p ? `${p.name} ${p.conc}` : k; }), "Producto"),
      groupSheet("Por laboratorio", "Venta por laboratorio o marca", groupLines(lines, (l) => product(l.productId)?.lab ?? "—"), "Laboratorio"),
      groupSheet("Por tipo", "Venta por tipo de producto", groupLines(lines, (l) => product(l.productId)?.category ?? "—"), "Tipo"),
      groupSheet("Por local", "Venta por local", groupLines(lines, (l) => l.branchId, name), "Local"),
      groupSheet("Por vendedor", "Venta por quien atendió", groupLines(lines, (l) => l.sellerName || "—"), "Atendió"),
      groupSheet("Por pago", "Venta por método de pago", groupLines(lines, (l) => l.method, (k) => PAYMENT_LABEL[k as keyof typeof PAYMENT_LABEL] ?? k), "Método"),
      sheet({
        name: "Sin movimiento",
        title: "Productos con stock que no se vendieron en el periodo",
        subtitle,
        rows: deadRows,
        columns: [
          { header: "Local", value: (r) => name(r.branchId), width: 12 },
          { header: "Producto", value: (r) => `${r.product.name} ${r.product.conc}`, width: 32 },
          { header: "Laboratorio", value: (r) => r.product.lab, width: 15 },
          { header: "Tipo", value: (r) => r.product.category, width: 15 },
          { header: "Stock (unid.)", value: (r) => r.units, type: "int", width: 11 },
          { header: "Valor a costo", value: (r) => r.value, type: "money", width: 13 },
          { header: "Días en stock", value: (r) => r.daysInStock, type: "int", width: 11 },
        ],
        totals: { "Valor a costo": Math.round(deadRows.reduce((s, r) => s + r.value, 0) * 100) / 100 },
      }),
      sheet({
        name: "Libro de recetas",
        title: "Libro de recetas (ventas con receta médica)",
        subtitle,
        rows: book,
        columns: [
          { header: "Fecha", value: (e) => localDay(e.at), type: "date", width: 12 },
          { header: "Hora", value: (e) => time(e.at), width: 10 },
          { header: "Local", value: (e) => name(e.branchId), width: 12 },
          { header: "Comprobante", value: (e) => e.number, width: 14 },
          { header: "N.º de receta", value: (e) => e.prescription.number, width: 13 },
          { header: "Médico", value: (e) => e.prescription.doctor, width: 24 },
          { header: "CMP", value: (e) => e.prescription.cmp, width: 8 },
          { header: "Productos", value: (e) => e.items.map((i) => `${i.qty} ${i.presentationLabel.toLowerCase()} ${product(i.productId)?.name ?? ""} ${product(i.productId)?.conc ?? ""}`.trim()).join("; "), width: 44 },
          { header: "Controlado", value: (e) => (e.controlled ? "Sí" : ""), width: 10 },
          { header: "Dispensó", value: (e) => e.sellerName, width: 18 },
        ],
      }),
      sheet({
        name: "Detalle",
        title: "Detalle de líneas de venta",
        subtitle,
        rows: lines,
        columns: [
          { header: "Fecha", value: (l) => localDay(l.at), type: "date", width: 12 },
          { header: "Hora", value: (l) => time(l.at), width: 10 },
          { header: "Local", value: (l) => name(l.branchId), width: 12 },
          { header: "Comprobante", value: (l) => l.number, width: 15 },
          { header: "Pago", value: (l) => PAYMENT_LABEL[l.method], width: 11 },
          { header: "Producto", value: (l) => { const p = product(l.productId); return p ? `${p.name} ${p.conc}` : String(l.productId); }, width: 30 },
          { header: "Presentación", value: (l) => l.presentationLabel, width: 12 },
          { header: "Cantidad", value: (l) => l.qty, type: "int", width: 9 },
          { header: "Unidades", value: (l) => l.units, type: "int", width: 9 },
          { header: "Total", value: (l) => l.total, type: "money", width: 11 },
          { header: "Costo", value: (l) => l.cost, type: "money", width: 11 },
          { header: "Descuento", value: (l) => l.discount || null, type: "pct", width: 9 },
          { header: "Atendió", value: (l) => l.sellerName, width: 18 },
        ],
        totals: { Unidades: t.units, Total: t.total, Costo: t.cost },
      }),
    ],
    { brand: pharmacy?.brand, author: pharmacy?.name },
  );
}
