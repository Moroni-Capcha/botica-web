import { describe, expect, it } from "vitest";
import type { AccountInput, Branch, Pharmacy, StaffAccount } from "@/lib/api/types";
import { accountErrors, accountGuard, branchErrors, branchSlug, contrast, deactivateBlockers, docNumber, nextSeries, planUsage, isWeakPin, pharmacyErrors, rulesErrors, toneShift } from "./settings";

const pharmacy: Pharmacy = { name: "Botica Huánuco", tagline: "Botica", ruc: "20609876543", phone: "987 654 321", brand: "#0B4F45", accent: "#3DDC97" };
const branches: Branch[] = [
  { id: "principal", name: "Principal", address: "Av. Los Próceres 1240", series: "001", active: true },
  { id: "sucursal", name: "Sucursal", address: "Av. Canto Grande 3150", series: "002", active: true },
];
const accounts: StaffAccount[] = [
  { id: "u1", name: "Carmen Salazar", role: "admin", branchId: null, active: true },
  { id: "u2", name: "Q.F. Daniel Rojas", role: "encargado", branchId: "principal", active: true },
];
const acc = (over: Partial<AccountInput> = {}): AccountInput => ({ name: "Q.F. Ana Paz", role: "encargado", branchId: "sucursal", pin: "4826", active: true, ...over });

describe("botica", () => {
  it("valida RUC, colores y que el texto blanco se lea sobre el color principal", () => {
    expect(pharmacyErrors(pharmacy)).toEqual({});
    expect(contrast("#000000", "#ffffff")).toBe(21);
    expect(Object.keys(pharmacyErrors({ ...pharmacy, ruc: "30609876543", brand: "#3DDC97", accent: "verde" }))).toEqual(["ruc", "brand", "accent"]);
  });
});

describe("locales", () => {
  it("no repite series ni nombres y arma el número del comprobante", () => {
    expect(branchErrors({ name: "Sucursal Canto", address: "Av. Canto Grande 3150", series: "003" }, branches, "sucursal")).toEqual({});
    expect(branchErrors({ name: "principal", address: "Av.", series: "001" }, branches, "sucursal")).toEqual({ name: "Ya hay un local con ese nombre", address: "Escribe la dirección", series: "Otro local ya usa esa serie" });
    expect(branchErrors({ name: "Sucursal", address: "Av. Canto Grande", series: "000" }, branches, "sucursal").series).toBe("3 dígitos, de 001 a 999");
    expect(docNumber("boleta", "002", 1289)).toBe("B002-001289");
  });

  it("crea el código y la serie del local nuevo y respeta el plan", () => {
    expect(branchSlug("Sucursal Pillco Marca", ["principal"])).toBe("sucursal-pillco-marca");
    expect(branchSlug("Sucursal", ["principal", "sucursal", "sucursal-2"])).toBe("sucursal-3");
    expect(branchSlug("¡¡!!", [])).toBe("local");
    const closed = { id: "amarilis", name: "Amarilis", address: "Jr. Huallayco 120", series: "003", active: false };
    expect(nextSeries([...branches, closed])).toBe("004");
    expect(planUsage([...branches, closed], 3)).toEqual({ active: 2, max: 3, canAdd: true, left: 1 });
    expect(planUsage(branches, 2).canAdd).toBe(false);
  });

  it("solo deja desactivar un local vacío, sin caja abierta ni traslados", () => {
    expect(deactivateBlockers({ stockUnits: 0, cashOpen: false, pendingTransfers: 0, activeBranches: 3 })).toEqual([]);
    expect(deactivateBlockers({ stockUnits: 1250, cashOpen: true, pendingTransfers: 2, activeBranches: 1 })).toHaveLength(4);
    expect(deactivateBlockers({ stockUnits: 0, cashOpen: false, pendingTransfers: 1, activeBranches: 2 })).toEqual(["Tiene 1 traslado pendiente: recíbelo o anúlalo."]);
  });
});

describe("cuentas", () => {
  it("pide local a la cuenta de local y un PIN que no sea obvio", () => {
    expect(accountErrors(acc(), accounts, branches, null)).toEqual({});
    expect(accountErrors(acc({ branchId: null, pin: "1234" }), accounts, branches, null)).toEqual({ branchId: "Elige el local de la cuenta", pin: "Muy fácil de adivinar (repetido o seguido)" });
    expect(accountErrors(acc({ name: "q.f. daniel rojas", pin: "" }), accounts, branches, "u3").name).toBe("Ya hay una cuenta con ese nombre");
    expect(accountErrors(acc({ pin: "" }), accounts, branches, "u2")).toEqual({});
    expect([isWeakPin("7777"), isWeakPin("6543"), isWeakPin("2580")]).toEqual([true, true, false]);
  });

  it("siempre deja un administrador activo y no deja que te bloquees", () => {
    expect(accountGuard(accounts, "u1", acc({ name: "Carmen Salazar", role: "admin", branchId: null, active: false }), "u1")).toBe("No puedes desactivar tu propia cuenta.");
    expect(accountGuard(accounts, "u1", acc({ name: "Carmen Salazar" }), "u1")).toBe("No puedes quitarte el rol de administrador.");
    const two = [...accounts, { id: "u4", name: "Jorge", role: "admin" as const, branchId: null, active: true }];
    expect(accountGuard(two, "u1", acc({ name: "Carmen Salazar", role: "admin", active: false }), "u4")).toBeNull();
    expect(accountGuard(accounts, "u1", acc({ name: "Carmen Salazar", role: "admin", active: false }), "u4")).toBe("Debe quedar al menos un administrador activo.");
    expect(accountGuard(accounts, null, acc(), "u1")).toBeNull();
  });
});

describe("reglas", () => {
  const rules = { expiry: { red: 30, yellow: 90 }, purchasing: { coverDays: 15, minShelfDays: 180 }, attendance: { toleranceMinutes: 10, breakMinutes: 60, overtimeAfterMinutes: 15 } };

  it("valida rangos y que el plazo por vencer sea mayor que el crítico", () => {
    expect(rulesErrors(rules)).toEqual({});
    expect(rulesErrors({ ...rules, expiry: { red: 60, yellow: 45 }, attendance: { ...rules.attendance, toleranceMinutes: 45, breakMinutes: 30.5 } })).toEqual({
      "attendance.toleranceMinutes": "Entre 0 y 30", "attendance.breakMinutes": "Entre 0 y 120", "expiry.yellow": "Debe ser mayor que el plazo crítico",
    });
  });

  it("cuenta cuántos lotes cambian de color con los nuevos plazos", () => {
    expect(toneShift([-2, 10, 40, 75, 120], { red: 30, yellow: 90 }, { red: 45, yellow: 60 })).toEqual({ before: { critico: 1, por_vencer: 2 }, after: { critico: 2, por_vencer: 0 }, changed: 2 });
  });
});
