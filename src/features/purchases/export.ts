import type { Branch, Pharmacy, Product, Purchase } from "@/lib/api/types";
import { IMPORT_COLUMNS, type ImportKey } from "@/lib/domain/product-import";
import type { OrderSuggestion } from "@/lib/domain/purchasing";
import { round2 } from "@/lib/domain/pharmacy";
import { downloadXlsx, fileStamp, sheet, type CellValue } from "@/lib/excel/xlsx";

const stamp = (pharmacy: Pharmacy | undefined, scope: string) => `${pharmacy?.name ?? "Botica"} · ${scope} · Generado el ${new Date().toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}`;
const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Pedido sugerido ordenado por proveedor, listo para enviar o dictar. */
export function exportSuggestion({ rows, branches, scopeLabel, coverDays, pharmacy }: { rows: OrderSuggestion[]; branches: Branch[]; scopeLabel: string; coverDays: number; pharmacy: Pharmacy | undefined }) {
  const name = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const ordered = [...rows].sort((a, b) => (a.supplier ?? "~").localeCompare(b.supplier ?? "~") || a.product.name.localeCompare(b.product.name));
  downloadXlsx(
    `pedido-sugerido-${fileStamp()}.xlsx`,
    [
      sheet({
        name: "Pedido sugerido",
        title: `Pedido sugerido: ${coverDays} días de venta más el stock mínimo`,
        subtitle: stamp(pharmacy, scopeLabel),
        rows: ordered,
        columns: [
          { header: "Proveedor habitual", value: (r) => r.supplier ?? "Sin proveedor", width: 30 },
          { header: "Local", value: (r) => name(r.branchId), width: 12 },
          { header: "Producto", value: (r) => `${r.product.name} ${r.product.conc}`, width: 32 },
          { header: "Laboratorio", value: (r) => r.product.lab, width: 15 },
          { header: "Código de barras", value: (r) => r.product.barcode, width: 16 },
          { header: "Stock vigente (unid.)", value: (r) => r.stock, type: "int", width: 12 },
          { header: "Mínimo", value: (r) => r.min, type: "int", width: 9 },
          { header: "Venta diaria", value: (r) => round2(r.rate), type: "num", width: 10 },
          { header: "Días de cobertura", value: (r) => (Number.isFinite(r.cover) ? Math.round(r.cover) : null), type: "int", width: 11 },
          { header: "Pedir", value: (r) => r.packs, type: "int", width: 8 },
          { header: "Presentación", value: (r) => (r.product.unitsPerBox > 1 ? `Caja x${r.product.unitsPerBox}` : r.product.unitName), width: 12 },
          { header: "Unidades", value: (r) => r.units, type: "int", width: 10 },
          { header: "Costo estimado sin IGV", value: (r) => r.cost, type: "money", width: 14 },
        ],
        totals: { "Costo estimado sin IGV": round2(rows.reduce((s, r) => s + r.cost, 0)) },
      }),
    ],
    { brand: pharmacy?.brand, author: pharmacy?.name },
  );
}

/** Compras del periodo: una fila por lote recibido. */
export function exportPurchases({ purchases, products, branches, scopeLabel, days, pharmacy }: { purchases: Purchase[]; products: Product[]; branches: Branch[]; scopeLabel: string; days: number; pharmacy: Pharmacy | undefined }) {
  const name = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const byId = new Map(products.map((p) => [p.id, p]));
  const rows = [...purchases].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)).flatMap((p) => p.items.map((it) => ({ p, it })));
  downloadXlsx(
    `compras-${fileStamp()}.xlsx`,
    [
      sheet({
        name: "Compras",
        title: `Compras por documento · últimos ${days} días`,
        subtitle: stamp(pharmacy, scopeLabel),
        rows: [...purchases].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)),
        columns: [
          { header: "Fecha", value: (p) => localDay(p.receivedAt), type: "date", width: 12 },
          { header: "Local", value: (p) => name(p.branchId), width: 12 },
          { header: "Proveedor", value: (p) => p.supplierName, width: 30 },
          { header: "Documento", value: (p) => p.document, width: 16 },
          { header: "Lotes", value: (p) => p.items.length, type: "int", width: 7 },
          { header: "Subtotal", value: (p) => p.subtotal, type: "money", width: 12 },
          { header: "IGV", value: (p) => p.igv, type: "money", width: 11 },
          { header: "Total", value: (p) => p.total, type: "money", width: 12 },
          { header: "Recibido por", value: (p) => p.userName, width: 18 },
        ],
        totals: {
          Subtotal: round2(purchases.reduce((s, p) => s + p.subtotal, 0)),
          IGV: round2(purchases.reduce((s, p) => s + p.igv, 0)),
          Total: round2(purchases.reduce((s, p) => s + p.total, 0)),
        },
      }),
      sheet({
        name: "Lotes recibidos",
        title: "Detalle de lotes recibidos",
        subtitle: stamp(pharmacy, scopeLabel),
        rows,
        columns: [
          { header: "Fecha", value: ({ p }) => localDay(p.receivedAt), type: "date", width: 12 },
          { header: "Local", value: ({ p }) => name(p.branchId), width: 12 },
          { header: "Proveedor", value: ({ p }) => p.supplierName, width: 28 },
          { header: "Documento", value: ({ p }) => p.document, width: 16 },
          { header: "Producto", value: ({ it }) => { const pr = byId.get(it.productId); return pr ? `${pr.name} ${pr.conc}` : `Producto ${it.productId}`; }, width: 32 },
          { header: "Laboratorio", value: ({ it }) => byId.get(it.productId)?.lab ?? "", width: 15 },
          { header: "Lote", value: ({ it }) => it.lotCode, width: 12 },
          { header: "Vencimiento", value: ({ it }) => it.expiresOn, type: "date", width: 13 },
          { header: "Unidades", value: ({ it }) => it.units, type: "int", width: 10 },
          { header: "Costo unidad", value: ({ it }) => it.unitCost, type: "money", width: 11 },
          { header: "Subtotal", value: ({ it }) => it.subtotal, type: "money", width: 12 },
        ],
        totals: { Unidades: rows.reduce((s, r) => s + r.it.units, 0), Subtotal: round2(rows.reduce((s, r) => s + r.it.subtotal, 0)) },
      }),
    ],
    { brand: pharmacy?.brand, author: pharmacy?.name },
  );
}

/** Plantilla para cargar productos y lotes. Trae dos filas de ejemplo que se pueden borrar. */
export function downloadImportTemplate(pharmacy: Pharmacy | undefined) {
  const example: Record<ImportKey, CellValue>[] = [
    { barcode: "7751000007919", name: "Paracetamol", active: "Paracetamol", conc: "500 mg", form: "Tableta", lab: "Genfar", category: "Analgésicos", rx: "libre", unitsPerBox: 100, unitsPerBlister: 10, unitName: "tableta", priceUnit: 0.2, priceBlister: 1.8, priceBox: 15, cost: 0.08, minStock: 100, location: "A-1", sanitaryReg: "EN-03711", lotCode: "GX12345", expiresOn: "2028-05-31", units: 300 },
    { barcode: "", name: "Amoxicilina", active: "Amoxicilina", conc: "500 mg", form: "Cápsula", lab: "AC Farma", category: "Antibióticos", rx: "receta", unitsPerBox: 100, unitsPerBlister: 10, unitName: "cápsula", priceUnit: 0.5, priceBlister: 4.5, priceBox: 40, cost: 0.22, minStock: 60, location: "B-1", sanitaryReg: "", lotCode: "AM55120", expiresOn: "2028-09-30", units: 200 },
  ];
  downloadXlsx(
    "plantilla-productos-botica.xlsx",
    [
      sheet({
        name: "Productos",
        title: "Plantilla de productos y lotes (una fila por lote; borra los ejemplos)",
        subtitle: `${pharmacy?.name ?? "Botica"} · Obligatorio: nombre comercial y precio unidad. Si llenas el lote, también vencimiento y cantidad.`,
        rows: example,
        columns: IMPORT_COLUMNS.map((c) => ({ header: c.header, value: (r: Record<ImportKey, CellValue>) => r[c.key], type: c.type, width: c.width })),
      }),
    ],
    { brand: pharmacy?.brand, author: pharmacy?.name },
  );
}
