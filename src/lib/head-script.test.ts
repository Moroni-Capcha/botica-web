import { describe, expect, it } from "vitest";
import { HEAD_INIT_SCRIPT } from "./head-script";
import { LITE_KEY } from "./perf-mode";
import { THEME_KEY } from "./theme";

/** Corre el script combinado con un navegador de mentira y devuelve los atributos que puso en el <html>. */
function run(stored: Record<string, string>, nav: { hardwareConcurrency?: number; deviceMemory?: number }, systemDark: boolean) {
  const attrs: Record<string, string> = {};
  const doc = { documentElement: { setAttribute: (n: string, v: string) => (attrs[n] = v) } };
  const store = { getItem: (k: string) => stored[k] ?? null };
  const win = { matchMedia: () => ({ matches: systemDark }) };
  new Function("localStorage", "navigator", "document", "window", HEAD_INIT_SCRIPT)(store, nav, doc, win);
  return attrs;
}

describe("script del <head> (tema + modo ligero)", () => {
  it("se ejecuta entero: aplica el tema y también el modo ligero", () => {
    const attrs = run({ [THEME_KEY]: "dark", [LITE_KEY]: "1" }, { hardwareConcurrency: 8, deviceMemory: 8 }, false);
    expect(attrs).toEqual({ "data-theme": "dark", "data-perf": "lite" });
  });
  it("en un equipo normal solo pone el tema", () => {
    expect(run({}, { hardwareConcurrency: 8, deviceMemory: 8 }, true)).toEqual({ "data-theme": "dark" });
  });
  it("un equipo modesto activa el modo ligero solo", () => {
    expect(run({}, { hardwareConcurrency: 2 }, false)).toEqual({ "data-theme": "light", "data-perf": "lite" });
  });
});
