import { describe, expect, it } from "vitest";
import { applyPinKey, isPinComplete, PIN_KEYS } from "./pin";

describe("applyPinKey", () => {
  it("agrega dígitos hasta 4 y no pasa de ahí", () => {
    let pin = "";
    for (const k of ["1", "2", "3", "4", "5"]) pin = applyPinKey(pin, k);
    expect(pin).toBe("1234");
  });

  it("borra el último dígito y no falla con el PIN vacío", () => {
    expect(applyPinKey("123", "←")).toBe("12");
    expect(applyPinKey("", "←")).toBe("");
  });

  it("ignora el hueco y las teclas que no son dígitos", () => {
    expect(applyPinKey("12", "")).toBe("12");
    expect(applyPinKey("12", "a")).toBe("12");
    expect(applyPinKey("12", "10")).toBe("12");
  });
});

describe("isPinComplete", () => {
  it("solo con 4 dígitos", () => {
    expect(isPinComplete("123")).toBe(false);
    expect(isPinComplete("1234")).toBe(true);
  });
});

describe("PIN_KEYS", () => {
  it("tiene los diez dígitos, el borrar y un hueco", () => {
    expect(PIN_KEYS).toHaveLength(12);
    expect(PIN_KEYS.filter((k) => /^\d$/.test(k))).toHaveLength(10);
  });
});
