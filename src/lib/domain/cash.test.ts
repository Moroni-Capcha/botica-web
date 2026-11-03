import { describe, expect, it } from "vitest";
import { closeDifference, describeDifference, countDenominations, expectedCash, movementError, paymentTotals } from "./cash";

describe("caja", () => {
  it("suma billetes y monedas sin errores de redondeo", () => {
    expect(countDenominations({ "100": 2, "20": 3, "0.1": 3, "0.2": 1, "0.5": 1 })).toBe(261);
    expect(countDenominations({ "0.1": 1, "0.2": 1 })).toBe(0.3);
    expect(countDenominations({ "10": -2, "5": 1.5, x: 3 })).toBe(0);
  });

  it("totaliza por método de pago", () => {
    expect(paymentTotals([{ method: "efectivo", total: 12.1 }, { method: "efectivo", total: 0.2 }, { method: "yape", total: 30 }])).toEqual({ efectivo: 12.3, yape: 30, tarjeta: 0 });
  });

  it("calcula el efectivo esperado con egresos, retiros e ingresos", () => {
    const movements = [
      { type: "egreso" as const, amount: 8.5 },
      { type: "retiro" as const, amount: 200 },
      { type: "ingreso" as const, amount: 20 },
    ];
    expect(expectedCash(150, 412.3, movements)).toBe(373.8);
  });

  it("clasifica la diferencia del arqueo", () => {
    expect(closeDifference(100.03, 100)).toEqual({ difference: 0.03, tone: "cuadra", needsNote: false });
    expect(closeDifference(95, 100)).toEqual({ difference: -5, tone: "faltante", needsNote: true });
    expect(closeDifference(100.6, 100)).toEqual({ difference: 0.6, tone: "sobrante", needsNote: false });
  });

  it("no deja sacar más efectivo del que hay", () => {
    expect(movementError("egreso", 50, "Movilidad", 40)).toBe("Solo hay 40.00 en efectivo");
    expect(movementError("ingreso", 50, "Sencillo", 0)).toBeNull();
    expect(movementError("egreso", 0, "x", 10)).toBe("Escribe el monto");
    expect(movementError("egreso", 5, "", 10)).toBe("Escribe el motivo");
    expect(movementError("egreso", 1.234, "Útiles", 10)).toBe("Máximo dos decimales");
  });
});

describe("describeDifference", () => {
  it("cuadra: cero y menos de 5 céntimos, tono éxito y sin signo", () => {
    expect(describeDifference(100, 100)).toMatchObject({ kind: "cuadra", tone: "success", sign: "", text: "Cuadra" });
    expect(describeDifference(100.03, 100)).toMatchObject({ tone: "success", text: "Cuadra" });
  });
  it("sobra poco: advertencia con signo +", () => {
    expect(describeDifference(100.6, 100)).toMatchObject({ kind: "sobrante", tone: "warning", sign: "+", label: "Sobra", text: "Sobra S/ 0.60" });
  });
  it("falta poco: advertencia con signo −", () => {
    expect(describeDifference(99.5, 100)).toMatchObject({ kind: "faltante", tone: "warning", sign: "−", text: "Falta S/ 0.50" });
  });
  it("diferencia grande (S/ 1 o más): peligro, en ambos sentidos", () => {
    expect(describeDifference(95, 100)).toMatchObject({ tone: "danger", sign: "−", text: "Falta S/ 5.00", difference: -5 });
    expect(describeDifference(112.5, 100)).toMatchObject({ tone: "danger", sign: "+", text: "Sobra S/ 12.50" });
    expect(describeDifference(99, 100)).toMatchObject({ tone: "danger", text: "Falta S/ 1.00" });
  });
});
