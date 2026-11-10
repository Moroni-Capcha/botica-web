import { describe, expect, it } from "vitest";
import { isLiteDevice, LITE_KEY, PERF_INIT_SCRIPT } from "./perf-mode";

describe("modo ligero", () => {
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
  it('"1" lo fuerza y "0" lo desactiva, mande lo que mande el equipo', () => {
    expect(isLiteDevice({ cores: 16, memory: 8 }, "1")).toBe(true);
    expect(isLiteDevice({ cores: 1, memory: 1 }, "0")).toBe(false);
    expect(isLiteDevice({ cores: 1 }, "otra cosa")).toBe(true);
  });

  it("el script del <head> aplica la misma regla", () => {
    const run = (stored: string | null, hints: { cores?: number; memory?: number }) => {
      let attr: string | null = null;
      const nav = { hardwareConcurrency: hints.cores, deviceMemory: hints.memory };
      const doc = { documentElement: { setAttribute: (_: string, v: string) => (attr = v) } };
      const store = { getItem: (k: string) => (k === LITE_KEY ? stored : null) };
      new Function("localStorage", "navigator", "document", PERF_INIT_SCRIPT)(store, nav, doc);
      return attr === "lite";
    };
    for (const stored of [null, "1", "0", "x"]) {
      for (const hints of [{}, { cores: 1 }, { cores: 8, memory: 8 }, { memory: 2 }, { cores: 4, memory: 4 }]) {
        expect(run(stored, hints)).toBe(isLiteDevice(hints, stored));
      }
    }
  });
});
