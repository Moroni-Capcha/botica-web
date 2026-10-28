import type { Branch, Lot, Pharmacy, Product } from "@/lib/api/types";
import { groupInventory, minFor, MOVE_LABEL, type InventoryRow, type KardexLine } from "@/lib/domain/inventory";
import { parseDay, round2 } from "@/lib/domain/pharmacy";
import { downloadXlsx, fileStamp, sheet, type Sheet } from "@/lib/excel/xlsx";

export const RX_LABEL: Record<Product["rx"], string> = { libre: "Venta libre", receta: "Con receta", controlado: "Controlado (receta especial)" };
export const STATUS_LABEL: Record<InventoryRow["status"], string> = { agotado: "Agotado", bajo: "Bajo mínimo", ok: "Normal" };

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

interface InventoryExport {
  rows: InventoryRow[];
  lots: Lot[];
  branches: Branch[];
  branchIds: string[];
  scopeLabel: string;
  pharmacy: Pharmacy | undefined;
}

/** Inventario valorizado: por producto, por laboratorio, por tipo y detalle de lotes. */
export function exportInventory({ rows, lots, branches, branchIds, scopeLabel, pharmacy }: InventoryExport) {
  const name = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const multi = branchIds.length > 1;
  const subtitle = `${pharmacy?.name ?? "Botica"} · ${scopeLabel} · Generado el ${new Date().toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}`;
  const totalCost = round2(rows.reduce((s, r) => s + r.valueCost, 0));
  const totalRetail = round2(rows.reduce((s, r) => s + r.valueRetail, 0));
  const productIds = new Set(rows.map((r) => r.product.id));
  const productById = new Map(rows.map((r) => [r.product.id, r.product]));

  const groupSheet = (by: "lab" | "category", title: string): Sheet =>
    sheet({
      name: title,
      title: `Inventario ${title.toLowerCase()}`,
      subtitle,
      rows: groupInventory(rows, by, branchIds),
      columns: [
        { header: by === "lab" ? "Laboratorio / marca" : "Tipo", value: (g) => g.key, width: 24 },
        { header: "Productos", value: (g) => g.products, type: "int", width: 10 },
        { header: "Con stock", value: (g) => g.withStock, type: "int", width: 10 },
        ...(multi ? branchIds.map((b) => ({ header: `Costo ${name(b)}`, value: (g: { costPerBranch: Record<string, number> }) => g.costPerBranch[b] ?? 0, type: "money" as const, width: 15 })) : []),
        { header: "Valor a costo", value: (g) => g.valueCost, type: "money", width: 15 },
        { header: "Valor a precio de venta", value: (g) => g.valueRetail, type: "money", width: 16 },
        { header: "Agotados o bajo mínimo", value: (g) => g.alerts, type: "int", width: 13 },
      ],
      totals: { "Valor a costo": totalCost, "Valor a precio de venta": totalRetail },
    });

  const lotRows = lots.filter((l) => l.qty > 0 && productIds.has(l.productId)).sort((a, b) => parseDay(a.expiresOn) - parseDay(b.expiresOn));

  downloadXlsx(
    `inventario-${slug(scopeLabel)}-${fileStamp()}.xlsx`,
    [
      sheet({
        name: "Inventario",
        title: "Inventario valorizado",
        subtitle,
        rows,
        columns: [
          { header: "Código de barras", value: (r) => r.product.barcode, width: 16 },
          { header: "Producto", value: (r) => r.product.name, width: 26 },
          { header: "Concentración", value: (r) => r.product.conc, width: 16 },
          { header: "Forma", value: (r) => r.product.form, width: 12 },
          { header: "Principio activo", value: (r) => r.product.active, width: 26 },
          { header: "Laboratorio", value: (r) => r.product.lab, width: 15 },
          { header: "Tipo", value: (r) => r.product.category, width: 15 },
          { header: "Condición de venta", value: (r) => RX_LABEL[r.product.rx], width: 18 },
          { header: "Registro sanitario", value: (r) => r.product.sanitaryReg, width: 14 },
          ...branchIds.map((b) => ({ header: `Stock ${name(b)} (unid.)`, value: (r: InventoryRow) => r.perBranch[b] ?? 0, type: "int" as const, width: 13 })),
          ...(multi ? [{ header: "Stock total (unid.)", value: (r: InventoryRow) => r.stock, type: "int" as const, width: 12 }] : []),
          ...branchIds.map((b) => ({ header: `Mínimo ${name(b)}`, value: (r: InventoryRow) => minFor(r.product, b), type: "int" as const, width: 11 })),
          { header: "Vencido sin dar de baja (unid.)", value: (r) => r.expired || null, type: "int", width: 14 },
          { header: "Lotes", value: (r) => r.lots, type: "int", width: 7 },
          { header: "Próximo vencimiento", value: (r) => r.next?.expiresOn ?? "", type: "date", width: 13 },
          { header: "Costo unidad", value: (r) => r.product.cost, type: "money", width: 11 },
          { header: "Precio unidad", value: (r) => r.product.priceUnit, type: "money", width: 11 },
          { header: "Precio blíster", value: (r) => r.product.priceBlister || null, type: "money", width: 11 },
          { header: "Precio caja", value: (r) => r.product.priceBox || null, type: "money", width: 11 },
          { header: "Valor a costo", value: (r) => r.valueCost, type: "money", width: 13 },
          { header: "Valor a precio de venta", value: (r) => r.valueRetail, type: "money", width: 14 },
          { header: "Estado", value: (r) => STATUS_LABEL[r.status], width: 12 },
          { header: "Ubicación", value: (r) => r.product.location, width: 9 },
        ],
        totals: { "Valor a costo": totalCost, "Valor a precio de venta": totalRetail },
      }),
      groupSheet("lab", "Por laboratorio"),
      groupSheet("category", "Por tipo"),
      sheet({
        name: "Lotes",
        title: "Detalle de lotes",
        subtitle,
        rows: lotRows,
        columns: [
          { header: "Local", value: (l) => name(l.branchId), width: 14 },
          { header: "Producto", value: (l) => { const p = productById.get(l.productId); return p ? `${p.name} ${p.conc}` : `Producto ${l.productId}`; }, width: 34 },
          { header: "Laboratorio", value: (l) => productById.get(l.productId)?.lab ?? "", width: 15 },
          { header: "Lote", value: (l) => l.code, width: 12 },
          { header: "Vencimiento", value: (l) => l.expiresOn, type: "date", width: 13 },
          { header: "Cantidad (unid.)", value: (l) => l.qty, type: "int", width: 12 },
          { header: "Costo unidad", value: (l) => l.cost, type: "money", width: 11 },
          { header: "Valor a costo", value: (l) => round2(l.qty * l.cost), type: "money", width: 13 },
          { header: "Proveedor", value: (l) => l.supplier ?? "", width: 30 },
          { header: "Ingreso", value: (l) => l.receivedOn ?? "", type: "date", width: 12 },
        ],
        totals: { "Cantidad (unid.)": lotRows.reduce((s, l) => s + l.qty, 0), "Valor a costo": round2(lotRows.reduce((s, l) => s + l.qty * l.cost, 0)) },
      }),
    ],
    { brand: pharmacy?.brand, author: pharmacy?.name },
  );
}

/** Kardex de un producto: del más antiguo al más reciente, con entradas, salidas y saldo. */
export function exportKardex({ product, lines, opening, days, scopeLabel, branches, pharmacy }: { product: Product; lines: KardexLine[]; opening: number; days: number; scopeLabel: string; branches: Branch[]; pharmacy: Pharmacy | undefined }) {
  const name = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const ordered = [...lines].reverse();
  const localDay = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  downloadXlsx(
    `kardex-${slug(`${product.name} ${product.conc}`)}-${fileStamp()}.xlsx`,
    [
      sheet({
        name: "Kardex",
        title: `Kardex · ${product.name} ${product.conc} (unidades)`,
        subtitle: `${pharmacy?.name ?? "Botica"} · ${scopeLabel} · Últimos ${days} días · Saldo inicial ${opening.toLocaleString("es-PE")} unid.`,
        rows: ordered,
        columns: [
          { header: "Fecha", value: (r) => localDay(r.at), type: "date", width: 12 },
          { header: "Hora", value: (r) => new Date(r.at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }), width: 12 },
          { header: "Local", value: (r) => name(r.branchId), width: 13 },
          { header: "Movimiento", value: (r) => MOVE_LABEL[r.type], width: 14 },
          { header: "Documento / motivo", value: (r) => r.reference, width: 36 },
          { header: "Lote", value: (r) => r.lotCode ?? "", width: 14 },
          { header: "Entrada", value: (r) => (r.delta > 0 ? r.delta : null), type: "int", width: 9 },
          { header: "Salida", value: (r) => (r.delta < 0 ? -r.delta : null), type: "int", width: 9 },
          { header: "Saldo", value: (r) => r.balance, type: "int", width: 9 },
          { header: "Usuario", value: (r) => r.userName, width: 18 },
        ],
        totals: { Entrada: ordered.reduce((s, r) => s + Math.max(0, r.delta), 0), Salida: ordered.reduce((s, r) => s + Math.max(0, -r.delta), 0) },
      }),
    ],
    { brand: pharmacy?.brand, author: pharmacy?.name },
  );
}
