/**
 * Carga de productos y lotes desde Excel (una fila por lote). Reglas puras, se prueban con Vitest.
 * La lectura del archivo está en lib/excel/read-xlsx.ts; aquí se interpretan las filas.
 */
import type { Product, ProductInput, RxCondition } from "@/lib/api/types";
import type { CellValue } from "@/lib/excel/xlsx";
import { normalizeProduct, validateProduct } from "./inventory";
import { normalizeLotCode, isValidLotCode } from "./purchasing";
import { daysUntil } from "./pharmacy";

export type ImportKey =
  | "barcode" | "name" | "active" | "conc" | "form" | "lab" | "category" | "rx" | "unitsPerBox" | "unitsPerBlister" | "unitName"
  | "priceUnit" | "priceBlister" | "priceBox" | "cost" | "minStock" | "location" | "sanitaryReg" | "lotCode" | "expiresOn" | "units";

/** Columnas de la plantilla, en orden. El encabezado es lo que el usuario ve en Excel. */
export const IMPORT_COLUMNS: { key: ImportKey; header: string; width: number; type?: "int" | "num" | "money" | "date" }[] = [
  { key: "barcode", header: "Código de barras", width: 16 },
  { key: "name", header: "Nombre comercial", width: 22 },
  { key: "active", header: "Principio activo", width: 20 },
  { key: "conc", header: "Concentración", width: 14 },
  { key: "form", header: "Forma", width: 12 },
  { key: "lab", header: "Laboratorio", width: 14 },
  { key: "category", header: "Tipo", width: 14 },
  { key: "rx", header: "Condición (libre, receta o controlado)", width: 16 },
  { key: "unitsPerBox", header: "Unidades por caja", width: 11, type: "int" },
  { key: "unitsPerBlister", header: "Unidades por blíster", width: 11, type: "int" },
  { key: "unitName", header: "Nombre de la unidad", width: 12 },
  { key: "priceUnit", header: "Precio unidad", width: 10, type: "money" },
  { key: "priceBlister", header: "Precio blíster", width: 10, type: "money" },
  { key: "priceBox", header: "Precio caja", width: 10, type: "money" },
  { key: "cost", header: "Costo unidad sin IGV", width: 11, type: "money" },
  { key: "minStock", header: "Stock mínimo", width: 9, type: "int" },
  { key: "location", header: "Ubicación", width: 9 },
  { key: "sanitaryReg", header: "Registro sanitario", width: 13 },
  { key: "lotCode", header: "Lote", width: 12 },
  { key: "expiresOn", header: "Vencimiento (dd/mm/aaaa)", width: 13, type: "date" },
  { key: "units", header: "Cantidad (unidades)", width: 11, type: "int" },
];

/** "Condición (libre, receta…)" → "condicion" para comparar encabezados sin tildes ni paréntesis. */
export const normHeader = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const HEADER_INDEX = new Map(IMPORT_COLUMNS.map((c) => [normHeader(c.header), c.key]));
/* Nombres alternativos frecuentes en hojas hechas a mano */
const ALIASES: Record<string, ImportKey> = {
  producto: "name", nombre: "name", "principio activo dci": "active", dci: "active", concentracion: "conc", laboratorio: "lab", marca: "lab", categoria: "category",
  condicion: "rx", "condicion de venta": "rx", "unid por caja": "unitsPerBox", "unid por blister": "unitsPerBlister", precio: "priceUnit", "precio venta": "priceUnit",
  costo: "cost", "costo unidad": "cost", minimo: "minStock", "codigo de barras": "barcode", codigo: "barcode", "n de lote": "lotCode", "numero de lote": "lotCode",
  vencimiento: "expiresOn", "fecha de vencimiento": "expiresOn", cantidad: "units", unidades: "units", "registro sanitario": "sanitaryReg", rs: "sanitaryReg",
};
const keyFor = (header: unknown): ImportKey | undefined => {
  const h = normHeader(header);
  return HEADER_INDEX.get(h) ?? ALIASES[h];
};

/** Fecha de una celda: número de serie de Excel, "dd/mm/aaaa", "dd-mm-aa" o "aaaa-mm-dd". Devuelve YYYY-MM-DD o "". */
export function cellToIsoDate(v: CellValue): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") {
    if (v < 1 || v > 2958465) return "";
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validIso(y, Number(m[2]), Number(m[1]));
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return validIso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{4})$/.exec(s); // "08/2027": último día del mes, como figura en muchas cajas
  if (m) {
    const y = Number(m[2]);
    const mo = Number(m[1]);
    return validIso(y, mo, new Date(Date.UTC(y, mo, 0)).getUTCDate());
  }
  return "";
}

function validIso(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const num = (v: CellValue) => {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim().replace(/^S\/\s*/i, "").replace(/\s/g, "");
  if (!s) return 0;
  // "1.234,50" → 1234.50 · "0,80" → 0.80 · "1,234.50" → 1234.50
  const normalized = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : Number.NaN;
};
const text = (v: CellValue) => (v === null || v === undefined ? "" : typeof v === "number" ? String(v) : v.trim());

const toRx = (v: CellValue): RxCondition => {
  const s = normHeader(v);
  if (s.startsWith("contr")) return "controlado";
  if (s.startsWith("rec") || s === "con receta") return "receta";
  return "libre";
};

export interface ImportRow {
  /** Fila en Excel (1 = primera fila de la hoja). */
  line: number;
  product: ProductInput;
  /** Producto del catálogo que coincide (por código de barras, o por nombre + concentración + laboratorio). */
  matchId: number | null;
  lot: { lotCode: string; expiresOn: string; units: number; unitCost: number } | null;
  /** Impiden importar la fila. */
  errors: string[];
  warnings: string[];
}

export interface ImportResult {
  rows: ImportRow[];
  /** Columnas de la plantilla que no se encontraron en el archivo. */
  missingColumns: string[];
  /** Mensaje si el archivo no se pudo interpretar. */
  fatal: string | null;
}

/** Identifica un producto por nombre, concentración y laboratorio (sin tildes ni mayúsculas). */
export const productKey = (p: { name: string; conc: string; lab: string }) => `${normHeader(p.name)}|${normHeader(p.conc)}|${normHeader(p.lab)}`;

/**
 * Interpreta la hoja: busca la fila de encabezados (la plantilla trae título arriba), lee cada fila
 * y la compara con el catálogo. Una fila sin lote solo crea o actualiza el producto.
 */
export function parseImportSheet(sheet: CellValue[][], catalog: Product[], now: number): ImportResult {
  const headerAt = sheet.findIndex((r) => r.some((c) => keyFor(c) === "name"));
  if (headerAt < 0) return { rows: [], missingColumns: [], fatal: "No se encontró la columna «Nombre comercial». Usa la plantilla." };
  const header = sheet[headerAt]!;
  const colOf = new Map<ImportKey, number>();
  header.forEach((h, i) => {
    const k = keyFor(h);
    if (k && !colOf.has(k)) colOf.set(k, i);
  });
  const required: ImportKey[] = ["name", "priceUnit"];
  const missingColumns = IMPORT_COLUMNS.filter((c) => !colOf.has(c.key)).map((c) => c.header);
  const missingRequired = required.filter((k) => !colOf.has(k));
  if (missingRequired.length) return { rows: [], missingColumns, fatal: `Faltan columnas obligatorias: ${missingRequired.map((k) => IMPORT_COLUMNS.find((c) => c.key === k)!.header).join(", ")}.` };

  const byBarcode = new Map(catalog.filter((p) => p.barcode).map((p) => [p.barcode, p]));
  const byKey = new Map(catalog.map((p) => [productKey(p), p]));
  const get = (r: CellValue[], k: ImportKey): CellValue => {
    const i = colOf.get(k);
    return i === undefined ? null : (r[i] ?? null);
  };

  const rows: ImportRow[] = [];
  const seenLots = new Set<string>();
  sheet.slice(headerAt + 1).forEach((r, i) => {
    const name = text(get(r, "name"));
    if (!name || /^total$/i.test(name)) return;
    const errors: string[] = [];
    const warnings: string[] = [];
    const barcode = text(get(r, "barcode")).replace(/\D/g, "");
    const draft = { name, conc: text(get(r, "conc")), lab: text(get(r, "lab")) };
    const match = (barcode && byBarcode.get(barcode)) || byKey.get(productKey(draft)) || null;

    const n = (k: ImportKey, fallback: number) => {
      const raw = get(r, k);
      if (raw === null || raw === "") return fallback;
      const v = num(raw);
      if (Number.isNaN(v)) {
        errors.push(`${IMPORT_COLUMNS.find((c) => c.key === k)!.header}: no es un número`);
        return fallback;
      }
      return v;
    };
    const t = (k: ImportKey, fallback: string) => text(get(r, k)) || fallback;
    const base = match ?? null;
    const product = normalizeProduct({
      name,
      active: t("active", base?.active ?? ""),
      conc: draft.conc || base?.conc || "",
      form: t("form", base?.form ?? "Tableta"),
      lab: draft.lab || base?.lab || "",
      category: t("category", base?.category ?? ""),
      rx: colOf.has("rx") && text(get(r, "rx")) ? toRx(get(r, "rx")) : (base?.rx ?? "libre"),
      unitsPerBox: Math.round(n("unitsPerBox", base?.unitsPerBox ?? 1)),
      unitsPerBlister: Math.round(n("unitsPerBlister", base?.unitsPerBlister ?? 0)),
      unitName: t("unitName", base?.unitName ?? "unidad"),
      priceUnit: n("priceUnit", base?.priceUnit ?? 0),
      priceBlister: n("priceBlister", base?.priceBlister ?? 0),
      priceBox: n("priceBox", base?.priceBox ?? 0),
      cost: n("cost", base?.cost ?? 0),
      minStock: Math.round(n("minStock", base?.minStock ?? 0)),
      minStockByBranch: base?.minStockByBranch,
      location: t("location", base?.location ?? ""),
      barcode: barcode || base?.barcode || "",
      sanitaryReg: t("sanitaryReg", base?.sanitaryReg ?? ""),
      coldChain: base?.coldChain ?? false,
    });
    errors.push(...Object.values(validateProduct(product, catalog, match?.id)).filter((x): x is string => !!x));

    let lot: ImportRow["lot"] = null;
    const lotCode = normalizeLotCode(text(get(r, "lotCode")));
    const unitsRaw = get(r, "units");
    const expRaw = get(r, "expiresOn");
    if (lotCode || (unitsRaw !== null && unitsRaw !== "") || (expRaw !== null && expRaw !== "")) {
      const expiresOn = cellToIsoDate(expRaw);
      const units = Math.round(n("units", 0));
      if (!lotCode) errors.push("Falta el lote");
      else if (!isValidLotCode(lotCode)) errors.push("Lote no válido");
      if (!expiresOn) errors.push("Vencimiento no válido (usa dd/mm/aaaa)");
      else if (daysUntil(expiresOn, now) <= 0) errors.push("El lote ya está vencido");
      if (units <= 0) errors.push("Falta la cantidad del lote");
      const key = `${productKey(product)}|${lotCode}`;
      if (lotCode && seenLots.has(key)) errors.push("Lote repetido en el archivo");
      seenLots.add(key);
      lot = { lotCode, expiresOn, units, unitCost: product.cost };
    }
    if (!match) warnings.push("Producto nuevo: se agregará al catálogo");
    else if (product.priceUnit !== match.priceUnit) warnings.push(`Precio unidad cambia de ${match.priceUnit.toFixed(2)} a ${product.priceUnit.toFixed(2)}`);

    rows.push({ line: headerAt + 2 + i, product, matchId: match?.id ?? null, lot, errors: [...new Set(errors)], warnings });
  });
  return { rows, missingColumns, fatal: rows.length ? null : "El archivo no tiene filas con productos." };
}

/** Indica si un producto del archivo cambia algo del que ya está en el catálogo. */
export function productChanged(row: ImportRow, catalog: Product[]): boolean {
  const current = catalog.find((p) => p.id === row.matchId);
  if (!current) return true;
  const { id: _id, ...cur } = current;
  return (Object.keys(row.product) as (keyof ProductInput)[]).some((k) => JSON.stringify(row.product[k]) !== JSON.stringify(cur[k]));
}
