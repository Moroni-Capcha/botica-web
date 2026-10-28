/**
 * Lector de .xlsx y .csv sin dependencias, para importar productos.
 * Usa DecompressionStream("deflate-raw") del navegador (Chrome 103+, Edge, Firefox 113+, Safari 16.4+).
 * Devuelve los valores tal cual: texto, número (las fechas llegan como número de serie de Excel) o null.
 */
import type { CellValue } from "./xlsx";

export interface ReadSheet {
  name: string;
  rows: CellValue[][];
}

export class SpreadsheetError extends Error {}

/* ------------------------------ ZIP ------------------------------ */

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  offset: number;
}

function zipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new SpreadsheetError("El archivo no es un Excel (.xlsx) válido. Si es .xls, ábrelo en Excel y guárdalo como .xlsx.");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new SpreadsheetError("El archivo está dañado.");
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = view.getUint16(local + 26, true);
    const lExtraLen = view.getUint16(local + 28, true);
    out.push({ name, method, compressedSize, offset: local + 30 + lNameLen + lExtraLen });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new SpreadsheetError("Este navegador no puede abrir archivos de Excel. Actualízalo o usa Chrome.");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(bytes: Uint8Array, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const dec = new TextDecoder();
  for (const e of zipEntries(bytes)) {
    if (!wanted(e.name)) continue;
    const raw = bytes.subarray(e.offset, e.offset + e.compressedSize);
    if (e.method === 0) files.set(e.name, dec.decode(raw));
    else if (e.method === 8) files.set(e.name, dec.decode(await inflateRaw(raw)));
    else throw new SpreadsheetError("El archivo usa una compresión que no se puede leer. Guárdalo de nuevo desde Excel.");
  }
  return files;
}

/* ------------------------------ XML ------------------------------ */

const decodeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const code = k.startsWith("#x") ? Number.parseInt(k.slice(2), 16) : Number.parseInt(k.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : "";
  });

const attr = (attrs: string, name: string) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1];
/** Todos los <t>…</t> (con o sin prefijo de espacio de nombres) concatenados. */
const texts = (xml: string) => [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => decodeXml(m[1] ?? "")).join("");

const colIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

function parseSheet(xml: string, shared: string[]): CellValue[][] {
  const rows: CellValue[][] = [];
  for (const rm of xml.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const rAttr = attr(rm[1] ?? "", "r");
    const rowIndex = rAttr ? Number(rAttr) - 1 : rows.length;
    const row: CellValue[] = [];
    let next = 0;
    for (const cm of (rm[2] ?? "").matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const a = cm[1] ?? "";
      const body = cm[2] ?? "";
      const ref = attr(a, "r");
      const ci = ref ? colIndex(ref) : next;
      next = ci + 1;
      const type = attr(a, "t") ?? "n";
      const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1];
      let value: CellValue = null;
      if (type === "s") value = v !== undefined ? (shared[Number(v)] ?? null) : null;
      else if (type === "inlineStr") value = texts(body);
      else if (type === "str") value = v !== undefined ? decodeXml(v) : null;
      else if (type === "b") value = v === "1" ? "VERDADERO" : "FALSO";
      else if (type === "e") value = null;
      else if (v !== undefined && v !== "") {
        const n = Number(v);
        value = Number.isFinite(n) ? n : decodeXml(v);
      }
      row[ci] = value;
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null;
    rows[rowIndex] = row;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

/** Lee todas las hojas de un .xlsx. */
export async function readXlsx(data: ArrayBuffer | Uint8Array): Promise<ReadSheet[]> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const files = await unzip(bytes, (n) => n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n === "xl/sharedStrings.xml" || /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  const wb = files.get("xl/workbook.xml");
  if (!wb) throw new SpreadsheetError("El archivo no es un libro de Excel.");
  const rels = new Map([...(files.get("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => [attr(m[1] ?? "", "Id") ?? "", attr(m[1] ?? "", "Target") ?? ""]));
  const shared = [...(files.get("xl/sharedStrings.xml") ?? "").matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => texts(m[1] ?? ""));
  const sheets: ReadSheet[] = [];
  for (const m of wb.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?>/g)) {
    const a = m[1] ?? "";
    const name = decodeXml(attr(a, "name") ?? `Hoja ${sheets.length + 1}`);
    const rid = attr(a, "r:id") ?? /\s[\w]+:id="([^"]*)"/.exec(a)?.[1] ?? "";
    let target = rels.get(rid) ?? `worksheets/sheet${sheets.length + 1}.xml`;
    target = target.replace(/^\/?xl\//, "").replace(/^\//, "");
    const xml = files.get(`xl/${target}`);
    if (xml) sheets.push({ name, rows: parseSheet(xml, shared) });
  }
  if (!sheets.length) throw new SpreadsheetError("El libro no tiene hojas con datos.");
  return sheets;
}

/* ------------------------------ CSV ------------------------------ */

/** CSV con coma o punto y coma (Excel en español guarda con punto y coma). */
export function parseCsv(text: string): CellValue[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: CellValue[][] = [];
  let row: CellValue[] = [];
  let cell = "";
  let quoted = false;
  const push = () => {
    const v = cell.trim();
    row.push(v === "" ? null : v);
    cell = "";
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) push();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      push();
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    push();
    rows.push(row);
  }
  return rows;
}

/** Lee la primera hoja de un archivo .xlsx o .csv elegido por el usuario. */
export async function readSpreadsheetFile(file: File): Promise<CellValue[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsv(await file.text());
  if (name.endsWith(".xls")) throw new SpreadsheetError("Los archivos .xls antiguos no se pueden leer. Ábrelo en Excel y guárdalo como .xlsx.");
  const sheets = await readXlsx(await file.arrayBuffer());
  return sheets.find((s) => s.rows.some((r) => r.some((c) => c !== null && c !== "")))?.rows ?? [];
}
