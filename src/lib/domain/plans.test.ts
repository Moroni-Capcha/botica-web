import { describe, expect, it } from "vitest";
import { ALL_MODULES } from "./account";
import { findPlan, listPlanOffers, priceWithIgv } from "./plans";

describe("planes", () => {
  it("el precio sale con IGV y 2 decimales", () => {
    expect(priceWithIgv(50)).toBe(59);
    expect(priceWithIgv(110)).toBe(129.8);
    expect(priceWithIgv(210)).toBe(247.8);
  });

  it("cada plan crece en locales y todos los módulos existen", () => {
    const offers = listPlanOffers();
    expect(offers.map((o) => o.id)).toEqual(["inicio", "crece", "cadena"]);
    expect(offers.map((o) => o.maxBranches)).toEqual([1, 3, 10]);
    for (const o of offers) for (const m of o.modules) expect(ALL_MODULES).toContain(m);
    expect(offers[0]!.modules).not.toContain("reportes");
    expect(offers[0]!.modules).not.toContain("auditoria");
    expect(offers[1]!.modules).toContain("auditoria");
  });

  it("busca un plan por id", () => {
    expect(findPlan("crece")?.name).toBe("Plan Crece");
    expect(findPlan("nada")).toBeUndefined();
  });
});
