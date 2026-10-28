/**
 * Generador de archivos .xlsx sin dependencias.
 * Arma el libro (OpenXML) y lo empaqueta en un ZIP sin compresión, que Excel, LibreOffice y Google Sheets abren sin aviso.
 * Cada hoja lleva título, subtítulo, encabezado con filtro, filas con formato (soles, fechas, %) y una fila de totales.
 */

export type ColumnType = "text" | "int" | "num" | "money" | "pct" | "date";
export type CellValue = string | number | null | undefined;

export interface Column<T> {
  header: string;
  value: (row: T) => CellValue;
  type?: ColumnType;
  /** Ancho en caracteres. */
  width?: number;
}

export interface SheetSpec<T> {
  name: string;
  title: string;
  subtitle?: string;
  columns: Column<T>[];
  rows: T[];
  /** Totales por encabezado de columna, p. ej. { "Pérdida estimada": 120.5 } */
  totals?: Record<string, number>;
}

/** Hoja ya resuelta (sin genéricos), lista para escribir. */
export interface Sheet {
  name: string;
  title: string;
  subtitle?: string;
  columns: { header: string; type: ColumnType; width: number }[];
  rows: CellValue[][];
  totals: (number | null)[] | null;
}

export function sheet<T>(spec: SheetSpec<T>): Sheet {
  const columns = spec.columns.map((c) => ({ header: c.header, type: c.type ?? "text", width: c.width ?? Math.max(10, c.header.length + 2) }));
  const totals = spec.totals ? spec.columns.map((c) => spec.totals?.[c.header] ?? null) : null;
  return { name: spec.name, title: spec.title, subtitle: spec.subtitle, columns, rows: spec.rows.map((r) => spec.columns.map((c) => c.value(r))), totals };
}

/* ------------------------------ XML ------------------------------ */

const esc = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const colName = (i: number): string => {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/** "2026-10-27" → número de serie de Excel (días desde 30/12/1899). */
export const excelDate = (iso: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return (Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - Date.UTC(1899, 11, 30)) / 86_400_000;
};

/** Nombre de hoja válido: máximo 31 caracteres, sin : \ / ? * [ ] y sin repetir. */
export function safeSheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw, i) => {
    let base = raw.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || `Hoja ${i + 1}`;
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
    used.add(name.toLowerCase());
    return name;
  });
}

/* Estilos (índices de cellXfs) */
const S = { title: 1, subtitle: 2, header: 3, text: 4, int: 5, num: 6, money: 7, pct: 8, date: 9, totalLabel: 10, totalMoney: 11, totalInt: 12, totalNum: 13 } as const;
const STYLE_BY_TYPE: Record<ColumnType, number> = { text: S.text, int: S.int, num: S.num, money: S.money, pct: S.pct, date: S.date };
const TOTAL_BY_TYPE: Record<ColumnType, number> = { text: S.totalLabel, int: S.totalInt, num: S.totalNum, money: S.totalMoney, pct: S.totalNum, date: S.totalLabel };

function stylesXml(brand: string): string {
  const color = `FF${brand.replace("#", "").toUpperCase().padStart(6, "0").slice(0, 6)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;S/ &quot;#,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="14"/><color rgb="${color}"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="10"/><color rgb="FF71717A"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="${color}"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4F4F5"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FFA1A1AA"/></top><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="14">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="3" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="4" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

const TEXT_STYLES = new Set<number>([S.title, S.subtitle, S.text, S.totalLabel]);
const isTotalStyle = (style: number) => style >= S.totalLabel;

function cellXml(ref: string, value: CellValue, type: ColumnType, style: number): string {
  if (value === null || value === undefined || value === "") return isTotalStyle(style) ? `<c r="${ref}" s="${style}"/>` : "";
  if (type === "date" && typeof value === "string") {
    const serial = excelDate(value);
    if (serial !== null) return `<c r="${ref}" s="${style}"><v>${serial}</v></c>`;
  }
  if (typeof value === "number" && type !== "text") {
    return Number.isFinite(value) ? `<c r="${ref}" s="${style}"><v>${value}</v></c>` : "";
  }
  const textStyle = TEXT_STYLES.has(style) ? style : isTotalStyle(style) ? S.totalLabel : S.text;
  return `<c r="${ref}" s="${textStyle}" t="inlineStr"><is><t xml:space="preserve">${esc(String(value))}</t></is></c>`;
}

const HEADER_ROW = 4;

function sheetXml(s: Sheet): string {
  const ncol = Math.max(1, s.columns.length);
  const last = colName(ncol - 1);
  const rows: string[] = [];
  rows.push(`<row r="1" ht="22" customHeight="1">${cellXml("A1", s.title, "text", S.title)}</row>`);
  if (s.subtitle) rows.push(`<row r="2">${cellXml("A2", s.subtitle, "text", S.subtitle)}</row>`);
  rows.push(
    `<row r="${HEADER_ROW}" ht="30" customHeight="1">${s.columns
      .map((c, i) => `<c r="${colName(i)}${HEADER_ROW}" s="${S.header}" t="inlineStr"><is><t xml:space="preserve">${esc(c.header)}</t></is></c>`)
      .join("")}</row>`,
  );
  s.rows.forEach((r, ri) => {
    const rn = HEADER_ROW + 1 + ri;
    rows.push(`<row r="${rn}">${s.columns.map((c, ci) => cellXml(`${colName(ci)}${rn}`, r[ci], c.type, STYLE_BY_TYPE[c.type])).join("")}</row>`);
  });
  const lastData = HEADER_ROW + s.rows.length;
  if (s.totals) {
    const rn = lastData + 1;
    rows.push(
      `<row r="${rn}">${s.columns
        .map((c, ci) => {
          const ref = `${colName(ci)}${rn}`;
          if (ci === 0) return cellXml(ref, "Total", "text", S.totalLabel);
          const v = s.totals?.[ci];
          return v === null || v === undefined ? `<c r="${ref}" s="${S.totalLabel}"/>` : cellXml(ref, v, c.type === "text" ? "num" : c.type, TOTAL_BY_TYPE[c.type === "text" ? "num" : c.type]);
        })
        .join("")}</row>`,
    );
  }
  const cols = s.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`).join("");
  const filter = s.rows.length ? `<autoFilter ref="A${HEADER_ROW}:${last}${lastData}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${HEADER_ROW}" topLeftCell="A${HEADER_ROW + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${cols ? `<cols>${cols}</cols>` : ""}
<sheetData>${rows.join("")}</sheetData>
${filter}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/>
</worksheet>`;
}

/** Arma las partes del libro: ruta → contenido XML. */
export function workbookParts(sheets: Sheet[], options: { brand?: string; author?: string } = {}): Record<string, string> {
  const list = sheets.length ? sheets : [sheet({ name: "Hoja 1", title: "Sin datos", columns: [], rows: [] })];
  const names = safeSheetNames(list.map((s) => s.name));
  const parts: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${list
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join("")}</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    "docProps/core.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>${esc(options.author ?? "Digi!HME")}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</dcterms:created></cp:coreProperties>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names
      .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets><definedNames>${list
      .map((s, i) => (s.rows.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(names[i]!.replace(/'/g, "''"))}'!$A$${HEADER_ROW}:$${colName(Math.max(1, s.columns.length) - 1)}$${HEADER_ROW + s.rows.length}</definedName>` : ""))
      .join("")}</definedNames></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join("")}<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": stylesXml(options.brand ?? "#0B4F45"),
  };
  list.forEach((s, i) => (parts[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s)));
  // Las definiciones vacías no son válidas
  parts["xl/workbook.xml"] = parts["xl/workbook.xml"]!.replace("<definedNames></definedNames>", "");
  return parts;
}

/* ------------------------------ ZIP (sin compresión) ------------------------------ */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipStore(files: Record<string, string | Uint8Array>): Uint8Array {
  const enc = new TextEncoder();
  const entries = Object.entries(files).map(([name, content]) => ({ name: enc.encode(name), data: typeof content === "string" ? enc.encode(content) : content }));
  const DOS_TIME = 0;
  const DOS_DATE = (2026 - 1980) << 9 | (1 << 5) | 1;
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const crc = crc32(e.data);
    const local = new Uint8Array(30 + e.name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // nombres en UTF-8
    lv.setUint16(8, 0, true); // sin compresión
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, e.data.length, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, e.name.length, true);
    lv.setUint16(28, 0, true);
    local.set(e.name, 30);
    chunks.push(local, e.data);

    const cd = new Uint8Array(46 + e.name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, e.data.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, e.name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(e.name, 46);
    central.push(cd);
    offset += local.length + e.data.length;
  }

  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Bytes del archivo .xlsx. */
export const buildXlsx = (sheets: Sheet[], options?: { brand?: string; author?: string }) => zipStore(workbookParts(sheets, options));

/** Descarga el libro en el navegador. */
export function downloadXlsx(filename: string, sheets: Sheet[], options?: { brand?: string; author?: string }) {
  const bytes = buildXlsx(sheets, options);
  const blob = new Blob([bytes as BlobPart], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "2026-10-27_1530" para nombres de archivo. */
export const fileStamp = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
