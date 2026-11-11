import { describe, expect, it } from "vitest";
import { niceTicks } from "./chart-scale";

describe("niceTicks (escala normal)", () => {
  it("sin datos deja solo el cero", () => {
    expect(niceTicks(0)).toEqual([0]);
    expect(niceTicks(-3)).toEqual([0]);
  });
  it("redondea a marcas limpias", () => {
    expect(niceTicks(100)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(255.81)).toEqual([0, 100, 200, 300]);
  });
  it("con valores menores que 1 usa decimales (importes)", () => {
    expect(niceTicks(1)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
});

describe("niceTicks (enteros, para conteos)", () => {
  it("un solo conteo de 1 da 0 y 1, no 0,25 de botica", () => {
    expect(niceTicks(1, true)).toEqual([0, 1]);
  });
  it("conteos chicos suben de uno en uno", () => {
    expect(niceTicks(3, true)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(4, true)).toEqual([0, 1, 2, 3, 4]);
  });
  it("conteos grandes se agrupan en marcas redondas y todas son enteras", () => {
    expect(niceTicks(7, true)).toEqual([0, 2, 4, 6, 8]);
    for (const max of [1, 2, 5, 9, 13, 40, 130, 999]) {
      const ticks = niceTicks(max, true);
      expect(ticks.every(Number.isInteger)).toBe(true);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
      expect(ticks[0]).toBe(0);
    }
  });
  it("no cambia la escala normal de valores grandes", () => {
    expect(niceTicks(100, true)).toEqual(niceTicks(100));
  });
});
