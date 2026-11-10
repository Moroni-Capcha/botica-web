import { describe, expect, it } from "vitest";
import { nextThemePref, parseThemePref, resolveTheme, THEME_INIT_SCRIPT, THEME_KEY } from "./theme";

describe("tema", () => {
  it("un valor guardado raro cuenta como automático", () => {
    expect(parseThemePref("dark")).toBe("dark");
    expect(parseThemePref("light")).toBe("light");
    for (const v of [null, undefined, "", "system", "DARK", 3, {}]) expect(parseThemePref(v)).toBe("system");
  });

  it("automático sigue al sistema; claro y oscuro lo ignoran", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("el botón recorre automático, claro, oscuro y vuelve", () => {
    expect(nextThemePref("system")).toBe("light");
    expect(nextThemePref("light")).toBe("dark");
    expect(nextThemePref("dark")).toBe("system");
  });

  it("el script del <head> aplica la misma regla que resolveTheme", () => {
    const run = (stored: string | null, systemDark: boolean) => {
      let attr = "";
      const win = { matchMedia: () => ({ matches: systemDark }) };
      const doc = { documentElement: { setAttribute: (_: string, v: string) => (attr = v) } };
      const store = { getItem: (k: string) => (k === THEME_KEY ? stored : null) };
      new Function("localStorage", "window", "document", THEME_INIT_SCRIPT)(store, win, doc);
      return attr;
    };
    for (const stored of ["light", "dark", "system", null, "basura"]) {
      for (const systemDark of [true, false]) expect(run(stored, systemDark)).toBe(resolveTheme(parseThemePref(stored), systemDark));
    }
  });
});
