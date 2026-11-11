import { describe, expect, it } from "vitest";
import {
  isLiteDevice,
  LEARNED_KEY,
  liteStorageValue,
  LITE_KEY,
  LOAD_BLOCK_LIMIT_MS,
  nextLitePref,
  parseLitePref,
  PERF_INIT_SCRIPT,
  shouldLearnLite,
  SLOW_INTERACTION_LIMIT,
} from "./perf-mode";

describe("modo ligero: pistas del equipo", () => {
  it("un equipo normal no lo activa", () => {
    expect(isLiteDevice({ cores: 8, memory: 8 }, null)).toBe(false);
    expect(isLiteDevice({ cores: 4, memory: 4 }, null)).toBe(false);
  });
  it("pocos núcleos o poca memoria lo activan", () => {
    expect(isLiteDevice({ cores: 2, memory: 8 }, null)).toBe(true);
    expect(isLiteDevice({ cores: 8, memory: 2 }, null)).toBe(true);
    expect(isLiteDevice({ cores: 1 }, null)).toBe(true);
  });
  it("sin datos del navegador se asume un equipo normal", () => {
    expect(isLiteDevice({}, null)).toBe(false);
  });
});

describe("modo ligero: lo que midió el sistema", () => {
  it("si ya aprendió que el equipo va lento, lo activa aunque las pistas digan que es bueno", () => {
    expect(isLiteDevice({ cores: 16, memory: 8 }, null, true)).toBe(true);
  });
  it("la elección de la persona manda sobre lo aprendido y sobre las pistas", () => {
    expect(isLiteDevice({ cores: 1, memory: 1 }, "0", true)).toBe(false);
    expect(isLiteDevice({ cores: 16, memory: 8 }, "1", false)).toBe(true);
  });
});

describe("preferencia del botón", () => {
  it("lee y guarda los tres estados", () => {
    expect(parseLitePref("1")).toBe("lite");
    expect(parseLitePref("0")).toBe("full");
    for (const v of [null, undefined, "", "auto", 2]) expect(parseLitePref(v)).toBe("auto");
    expect(liteStorageValue("lite")).toBe("1");
    expect(liteStorageValue("full")).toBe("0");
    expect(liteStorageValue("auto")).toBeNull();
  });
  it("recorre automático, ligero, completo y vuelve", () => {
    expect(nextLitePref("auto")).toBe("lite");
    expect(nextLitePref("lite")).toBe("full");
    expect(nextLitePref("full")).toBe("auto");
  });
});

describe("shouldLearnLite", () => {
  it("un equipo bueno no se marca como lento", () => {
    expect(shouldLearnLite({ longTaskMs: 600, slowInteractions: 1 })).toBe(false);
    expect(shouldLearnLite({ longTaskMs: 0, slowInteractions: 0 })).toBe(false);
  });
  it("una carga muy bloqueada lo marca", () => {
    expect(shouldLearnLite({ longTaskMs: LOAD_BLOCK_LIMIT_MS, slowInteractions: 0 })).toBe(true);
    expect(shouldLearnLite({ longTaskMs: LOAD_BLOCK_LIMIT_MS - 1, slowInteractions: 0 })).toBe(false);
  });
  it("varias interacciones lentas lo marcan; una sola no", () => {
    expect(shouldLearnLite({ longTaskMs: 0, slowInteractions: SLOW_INTERACTION_LIMIT })).toBe(true);
    expect(shouldLearnLite({ longTaskMs: 0, slowInteractions: SLOW_INTERACTION_LIMIT - 1 })).toBe(false);
  });
});

describe("script del <head> (solo la parte del modo ligero)", () => {
  it("aplica la misma regla que isLiteDevice", () => {
    const run = (stored: string | null, learned: boolean, hints: { cores?: number; memory?: number }) => {
      let attr: string | null = null;
      const nav = { hardwareConcurrency: hints.cores, deviceMemory: hints.memory };
      const doc = { documentElement: { setAttribute: (_: string, v: string) => (attr = v) } };
      const store = { getItem: (k: string) => (k === LITE_KEY ? stored : k === LEARNED_KEY ? (learned ? "1" : null) : null) };
      new Function("localStorage", "navigator", "document", PERF_INIT_SCRIPT)(store, nav, doc);
      return attr === "lite";
    };
    for (const stored of [null, "1", "0", "x"]) {
      for (const learned of [false, true]) {
        for (const hints of [{}, { cores: 1 }, { cores: 8, memory: 8 }, { memory: 2 }, { cores: 4, memory: 4 }]) {
          expect(run(stored, learned, hints)).toBe(isLiteDevice(hints, stored, learned));
        }
      }
    }
  });
});
