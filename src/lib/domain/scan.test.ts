import { describe, expect, it } from "vitest";
import { EMPTY_SCAN, feedScanKey, type ScanState } from "./scan";

/** Teclea una secuencia con un intervalo fijo entre teclas; devuelve el último resultado. */
function type(keys: string[], gap: number, start = 1000, from: ScanState = EMPTY_SCAN) {
  let state = from;
  let scan: string | null = null;
  keys.forEach((k, i) => {
    const r = feedScanKey(state, k, start + i * gap);
    state = r.state;
    scan = r.scan;
  });
  return { state, scan };
}

describe("feedScanKey", () => {
  it("reconoce una ráfaga rápida terminada en Enter", () => {
    expect(type([..."7750123456789", "Enter"], 10).scan).toBe("7750123456789");
  });
  it("no toma como lector a una persona escribiendo a mano", () => {
    expect(type([..."7750123456789", "Enter"], 200).scan).toBeNull();
  });
  it("ignora ráfagas demasiado cortas", () => {
    expect(type([..."123", "Enter"], 10).scan).toBeNull();
  });
  it("Enter solo no es un código", () => {
    expect(type(["Enter"], 10).scan).toBeNull();
  });
  it("después de un código reconocido empieza de cero", () => {
    const first = type([..."1234567", "Enter"], 10);
    expect(first.state).toEqual(EMPTY_SCAN);
    expect(type([..."7654321", "Enter"], 10, 5000, first.state).scan).toBe("7654321");
  });
  it("una pausa larga a mitad de camino descarta lo anterior", () => {
    const a = type([..."99"], 10);
    const b = type([..."123456", "Enter"], 10, 9000, a.state);
    expect(b.scan).toBe("123456");
  });
  it("Shift no corta la ráfaga, otras teclas de control sí", () => {
    const a = type(["A", "Shift", "B", "C", "D", "Enter"], 10);
    expect(a.scan).toBe("ABCD");
    expect(type(["1", "2", "Tab", "3", "4", "Enter"], 10).scan).toBeNull();
  });
});
