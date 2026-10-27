import { describe, expect, it } from "vitest";
import { buildXlsx, colName, crc32, excelDate, safeSheetNames, sheet, workbookParts } from "./xlsx";

describe("excel", () => {
  it("nombra columnas como Excel", () => {
    expect([0, 25, 26, 27, 701].map(colName)).toEqual(["A", "Z", "AA", "AB", "ZZ"]);
  });
  it("convierte fechas a número de serie", () => {
    expect(excelDate("2026-10-27")).toBe(46322);
    expect(excelDate("1900-03-01")).toBe(61);
    expect(excelDate("no")).toBeNull();
  });
  it("limpia y no repite nombres de hoja", () => {
    expect(safeSheetNames(["Lotes / 2026", "Lotes / 2026", "x".repeat(40)])).toEqual(["Lotes   2026", "Lotes   2026 2", "x".repeat(31)]);
  });
  it("calcula el CRC32 del ZIP", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  it("escribe valores con su formato y escapa el texto", () => {
    const s = sheet({
      name: "Prueba",
      title: "Lotes <A&B>",
      columns: [
        { header: "Producto", value: (r: { n: string; v: number; d: string }) => r.n },
        { header: "Valor", value: (r) => r.v, type: "money" },
        { header: "Vence", value: (r) => r.d, type: "date" },
      ],
      rows: [{ n: "Jarabe \"kids\"", v: 12.5, d: "2026-10-27" }],
      totals: { Valor: 12.5 },
    });
    const xml = workbookParts([s])["xl/worksheets/sheet1.xml"]!;
    expect(xml.includes("Lotes &lt;A&amp;B&gt;")).toBe(true);
    expect(xml.includes("Jarabe &quot;kids&quot;")).toBe(true);
    expect(xml.includes('<c r="B5" s="7"><v>12.5</v></c>')).toBe(true);
    expect(xml.includes('<c r="C5" s="9"><v>46322</v></c>')).toBe(true);
    expect(xml.includes('<c r="B6" s="11"><v>12.5</v></c>')).toBe(true);
    const bytes = buildXlsx([s]);
    expect(bytes[0]).toBe(0x50); // "PK"
    expect(bytes[1]).toBe(0x4b);
  });
});
