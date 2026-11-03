import { describe, expect, it } from "vitest";
import { CHIP_TONE, daysLabel, groupByTone, primaryAction, unitsText } from "./expiry-view";

describe("daysLabel", () => {
  it("dice cuánto falta o cuánto lleva vencido", () => {
    expect(daysLabel(-12)).toBe("Vencido hace 12 d");
    expect(daysLabel(0)).toBe("Vence hoy");
    expect(daysLabel(9)).toBe("Vence en 9 d");
  });
});

describe("primaryAction", () => {
  it("lo vencido solo se da de baja", () => {
    expect(primaryAction("vencido", { hasMove: true, canSell: true })).toBe("baja");
  });
  it("prefiere el traslado, luego vender, luego la baja", () => {
    expect(primaryAction("critico", { hasMove: true, canSell: true })).toBe("traslado");
    expect(primaryAction("por_vencer", { hasMove: false, canSell: true })).toBe("vender");
    expect(primaryAction("por_vencer", { hasMove: false, canSell: false })).toBe("baja");
  });
});

describe("groupByTone", () => {
  it("junta tonos consecutivos y conserva el orden", () => {
    const rows = [{ tone: "vencido" as const, id: 1 }, { tone: "vencido" as const, id: 2 }, { tone: "critico" as const, id: 3 }, { tone: "vigente" as const, id: 4 }];
    const g = groupByTone(rows);
    expect(g.map((x) => [x.tone, x.rows.map((r) => r.id)])).toEqual([["vencido", [1, 2]], ["critico", [3]], ["vigente", [4]]]);
    expect(groupByTone([])).toEqual([]);
  });
});

describe("CHIP_TONE / unitsText", () => {
  it("cada tono tiene chip y el vencido es sólido", () => {
    expect(CHIP_TONE.vencido.solid).toBe(true);
    expect(CHIP_TONE.critico.tone).toBe("danger");
  });
  it("singular y plural", () => {
    expect(unitsText(1)).toBe("1 unidad");
    expect(unitsText(12)).toBe("12 unidades");
  });
});
