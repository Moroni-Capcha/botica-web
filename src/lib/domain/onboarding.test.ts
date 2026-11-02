import { describe, expect, it } from "vitest";
import { isSetupComplete, nextStep, normalizeDone, progress, rucError, SETUP_STEPS, suggestBoticaCode } from "./onboarding";

describe("primera configuración", () => {
  it("el siguiente paso es el primero que falta, aunque se haya hecho uno posterior", () => {
    expect(nextStep([])).toBe("botica");
    expect(nextStep(["botica", "local"])).toBe("series");
    expect(nextStep(["botica", "series"])).toBe("local");
    expect(nextStep([...SETUP_STEPS])).toBeNull();
  });

  it("calcula el avance e ignora pasos que no existen", () => {
    expect(progress([])).toEqual({ done: 0, total: 5, percent: 0 });
    expect(progress(["botica", "local"])).toEqual({ done: 2, total: 5, percent: 40 });
    expect(progress(["botica", "botica", "otro"])).toMatchObject({ done: 1 });
    expect(isSetupComplete([...SETUP_STEPS])).toBe(true);
    expect(isSetupComplete(["botica"])).toBe(false);
  });

  it("deja los pasos hechos en orden y sin repetir", () => {
    expect(normalizeDone(["productos", "botica", "botica", "x"])).toEqual(["botica", "productos"]);
  });

  it("el RUC tiene 11 dígitos y empieza en 10 o 20", () => {
    expect(rucError("20609876543")).toBeNull();
    expect(rucError(" 10123456789 ")).toBeNull();
    expect(rucError("30609876543")).not.toBeNull();
    expect(rucError("2060987654")).not.toBeNull();
    expect(rucError("")).not.toBeNull();
  });
});

describe("código sugerido", () => {
  it("quita tildes, signos y espacios sobrantes", () => {
    expect(suggestBoticaCode("Botica Huánuco")).toBe("botica-huanuco");
    expect(suggestBoticaCode("  Farmacia  San José & Hijos! ")).toBe("farmacia-san-jose-hijos");
    expect(suggestBoticaCode("")).toBe("");
  });
  it("no pasa de 40 caracteres ni termina en guion", () => {
    const code = suggestBoticaCode("a".repeat(39) + " bbb");
    expect(code.length).toBeLessThanOrEqual(40);
    expect(code.endsWith("-")).toBe(false);
  });
});
