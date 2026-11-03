import { describe, expect, it } from "vitest";
import { branchStockTone, shouldFocusSearch, STOCK_TONE } from "./stock-tone";

const key = (k: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; isComposing: boolean }> = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...extra });
const free = { dialogOpen: false, inEditable: false, inSearch: false };

describe("STOCK_TONE", () => {
  it("agotado es peligro con relleno fuerte, bajo es aviso suave", () => {
    expect(STOCK_TONE.agotado).toEqual({ tone: "danger", solid: true });
    expect(STOCK_TONE.bajo).toEqual({ tone: "warning", solid: false });
  });
});

describe("branchStockTone", () => {
  it("sin unidades manda sobre el mínimo", () => {
    expect(branchStockTone(0, true)).toBe("empty");
    expect(branchStockTone(0, false)).toBe("empty");
  });
  it("distingue bajo mínimo de normal", () => {
    expect(branchStockTone(5, true)).toBe("low");
    expect(branchStockTone(50, false)).toBe("normal");
  });
});

describe("shouldFocusSearch", () => {
  it("F2 y / enfocan el buscador cuando no se escribe en otro campo", () => {
    expect(shouldFocusSearch(key("F2"), free)).toBe(true);
    expect(shouldFocusSearch(key("/"), free)).toBe(true);
  });
  it("se ignoran con un diálogo abierto o con teclas modificadoras", () => {
    expect(shouldFocusSearch(key("F2"), { ...free, dialogOpen: true })).toBe(false);
    expect(shouldFocusSearch(key("/", { ctrlKey: true }), free)).toBe(false);
    expect(shouldFocusSearch(key("/", { isComposing: true }), free)).toBe(false);
  });
  it("mientras se escribe en otro campo no actúan; en el buscador solo F2", () => {
    expect(shouldFocusSearch(key("/"), { ...free, inEditable: true })).toBe(false);
    expect(shouldFocusSearch(key("F2"), { ...free, inEditable: true })).toBe(false);
    expect(shouldFocusSearch(key("/"), { dialogOpen: false, inEditable: true, inSearch: true })).toBe(false);
    expect(shouldFocusSearch(key("F2"), { dialogOpen: false, inEditable: true, inSearch: true })).toBe(true);
  });
  it("otras teclas pasan", () => {
    expect(shouldFocusSearch(key("a"), free)).toBe(false);
  });
});
