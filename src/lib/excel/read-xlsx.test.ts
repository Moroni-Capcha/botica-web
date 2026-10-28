import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { buildXlsx, crc32, sheet } from "./xlsx";
import { parseCsv, readXlsx } from "./read-xlsx";

/** ZIP con compresión deflate, como lo guarda Excel. */
function zipDeflate(files: Record<string, string>): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [n, content] of Object.entries(files)) {
    const name = enc.encode(n);
    const raw = enc.encode(content);
    const data = new Uint8Array(deflateRawSync(raw));
    const crc = crc32(raw);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    parts.push(local, data);
    central.push(cd);
    offset += local.length + data.length;
  }
  const size = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, size, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

describe("lector de Excel", () => {
  it("lee lo que escribe el generador (texto, números y fechas)", async () => {
    const bytes = buildXlsx([
      sheet({
        name: "Productos",
        title: "Plantilla",
        columns: [
          { header: "Nombre comercial", value: (r: { n: string; p: number; e: string }) => r.n },
          { header: "Precio unidad", value: (r) => r.p, type: "money" },
          { header: "Vencimiento", value: (r) => r.e, type: "date" },
        ],
        rows: [{ n: "Jarabe <niños> & más", p: 12.5, e: "2027-03-31" }],
      }),
    ]);
    const [s] = await readXlsx(bytes);
    expect(s!.name).toBe("Productos");
    expect(s!.rows[0]).toEqual(["Plantilla"]);
    expect(s!.rows[3]).toEqual(["Nombre comercial", "Precio unidad", "Vencimiento"]);
    expect(s!.rows[4]).toEqual(["Jarabe <niños> & más", 12.5, 46477]);
  });

  it("lee un archivo guardado por Excel: comprimido, con textos compartidos y celdas vacías", async () => {
    const bytes = zipDeflate({
      "xl/workbook.xml": '<workbook xmlns:r="r"><sheets><sheet name="Stock" sheetId="1" r:id="rId1"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/sharedStrings.xml": '<sst><si><t>Nombre</t></si><si><r><t>Para</t></r><r><t>cetamol</t></r></si></sst>',
      "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="str"><v>x &amp; y</v></c></row><row r="3"><c r="B3" t="s"><v>1</v></c><c r="C3"><v>0.8</v></c></row></sheetData></worksheet>',
    });
    const [s] = await readXlsx(bytes);
    expect(s!.rows).toEqual([["Nombre", null, "x & y"], [], [null, "Paracetamol", 0.8]]);
  });

  it("lee CSV con punto y coma y comillas", () => {
    expect(parseCsv('Nombre;Precio\r\n"Jarabe ""kids""";1,50\n')).toEqual([["Nombre", "Precio"], ['Jarabe "kids"', "1,50"]]);
  });
});
