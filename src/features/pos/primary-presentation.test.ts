import { describe, expect, it } from "vitest";
import { pickPrimaryPresentation } from "./primary-presentation";

describe("pickPrimaryPresentation", () => {
  it("elige la unidad aunque no sea la primera", () => {
    expect(pickPrimaryPresentation([{ id: "caja" }, { id: "unidad" }, { id: "blister" }])?.id).toBe("unidad");
  });
  it("sin unidad, toma la primera disponible", () => {
    expect(pickPrimaryPresentation([{ id: "blister" }, { id: "caja" }])?.id).toBe("blister");
  });
  it("lista vacía no tiene principal", () => {
    expect(pickPrimaryPresentation([])).toBeUndefined();
  });
});
