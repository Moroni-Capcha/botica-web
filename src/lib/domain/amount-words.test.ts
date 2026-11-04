import { describe, expect, it } from "vitest";
import { amountInWords } from "./amount-words";

const casos: [number, string][] = [
  [0, "SON: CERO Y 00/100 SOLES"],
  [1, "SON: UN Y 00/100 SOLES"],
  [2, "SON: DOS Y 00/100 SOLES"],
  [10, "SON: DIEZ Y 00/100 SOLES"],
  [15, "SON: QUINCE Y 00/100 SOLES"],
  [16, "SON: DIECISEIS Y 00/100 SOLES"],
  [20, "SON: VEINTE Y 00/100 SOLES"],
  [21, "SON: VEINTIUN Y 00/100 SOLES"],
  [23, "SON: VEINTITRES Y 00/100 SOLES"],
  [29, "SON: VEINTINUEVE Y 00/100 SOLES"],
  [30, "SON: TREINTA Y 00/100 SOLES"],
  [31, "SON: TREINTA Y UN Y 00/100 SOLES"],
  [45, "SON: CUARENTA Y CINCO Y 00/100 SOLES"],
  [100, "SON: CIEN Y 00/100 SOLES"],
  [101, "SON: CIENTO UN Y 00/100 SOLES"],
  [114.8, "SON: CIENTO CATORCE Y 80/100 SOLES"],
  [500, "SON: QUINIENTOS Y 00/100 SOLES"],
  [999.99, "SON: NOVECIENTOS NOVENTA Y NUEVE Y 99/100 SOLES"],
  [1000, "SON: MIL Y 00/100 SOLES"],
  [1001, "SON: MIL UN Y 00/100 SOLES"],
  [2000, "SON: DOS MIL Y 00/100 SOLES"],
  [21000, "SON: VEINTIUN MIL Y 00/100 SOLES"],
  [100000, "SON: CIEN MIL Y 00/100 SOLES"],
  [1_000_000, "SON: UN MILLON Y 00/100 SOLES"],
  [2_000_000, "SON: DOS MILLONES Y 00/100 SOLES"],
  [21_000_000, "SON: VEINTIUN MILLONES Y 00/100 SOLES"],
  [1_234_567.89, "SON: UN MILLON DOSCIENTOS TREINTA Y CUATRO MIL QUINIENTOS SESENTA Y SIETE Y 89/100 SOLES"],
  [999_999_999.99, "SON: NOVECIENTOS NOVENTA Y NUEVE MILLONES NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE Y 99/100 SOLES"],
  [0.05, "SON: CERO Y 05/100 SOLES"],
  [3.5, "SON: TRES Y 50/100 SOLES"],
  [0.1 + 0.2, "SON: CERO Y 30/100 SOLES"],
  [1.006, "SON: UN Y 01/100 SOLES"],
  [1.004, "SON: UN Y 00/100 SOLES"],
];

describe("amountInWords", () => {
  it.each(casos)("%s", (monto, esperado) => {
    expect(amountInWords(monto)).toBe(esperado);
  });

  it("devuelve vacío con monto negativo o no finito", () => {
    expect(amountInWords(-1)).toBe("");
    expect(amountInWords(NaN)).toBe("");
    expect(amountInWords(Infinity)).toBe("");
  });

  it("devuelve vacío si pasa del máximo", () => {
    expect(amountInWords(1_000_000_000)).toBe("");
  });
});
