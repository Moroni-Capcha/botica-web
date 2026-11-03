import { describe, expect, it } from "vitest";
import { alertLook, goalProgress } from "./panel";

describe("alertLook", () => {
  it("cada gravedad tiene tono, palabra y forma de ícono propios", () => {
    expect(alertLook("critical")).toEqual({ tone: "danger", label: "Urgente", shape: "circle-alert" });
    expect(alertLook("warning")).toEqual({ tone: "warning", label: "Atención", shape: "triangle-alert" });
    expect(alertLook("info")).toEqual({ tone: "info", label: "Aviso", shape: "info" });
  });

  it("la gravedad no depende solo del color: las tres formas y palabras son distintas", () => {
    const looks = (["critical", "warning", "info"] as const).map(alertLook);
    expect(new Set(looks.map((l) => l.shape)).size).toBe(3);
    expect(new Set(looks.map((l) => l.label)).size).toBe(3);
  });
});

describe("goalProgress", () => {
  it("devuelve la fracción alcanzada", () => {
    expect(goalProgress(50, 200)).toBe(0.25);
  });
  it("no pasa de 1 aunque se supere la meta", () => {
    expect(goalProgress(300, 200)).toBe(1);
  });
  it("sin meta válida no hay barra", () => {
    expect(goalProgress(50, 0)).toBeUndefined();
    expect(goalProgress(50, null)).toBeUndefined();
    expect(goalProgress(50, undefined)).toBeUndefined();
    expect(goalProgress(50, NaN)).toBeUndefined();
  });
  it("nunca baja de 0", () => {
    expect(goalProgress(-10, 100)).toBe(0);
  });
});
