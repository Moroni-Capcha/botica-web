import { describe, expect, it } from "vitest";
import type { CashSummary, DailySales, Transfer } from "@/lib/api/types";
import { averageDay, buildAlerts, dailyTotals, greeting, sameDayLastWeek } from "./dashboard";

const NOW = new Date(2026, 9, 27, 15, 0).getTime(); // martes 27/10/2026, 3 p. m.
const s = (date: string, branchId: string, total: number): DailySales => ({ date, branchId, total, tickets: 10 });

describe("venta", () => {
  const series = [s("2026-10-20", "principal", 300), s("2026-10-20", "sucursal", 120), s("2026-10-21", "principal", 0), s("2026-10-21", "sucursal", 0), s("2026-10-26", "principal", 250)];

  it("suma por día los locales elegidos", () => {
    expect(dailyTotals(series, ["principal", "sucursal"])[0]).toEqual({ date: "2026-10-20", total: 420, byBranch: { principal: 300, sucursal: 120 } });
    expect(dailyTotals(series, ["sucursal"]).map((d) => d.total)).toEqual([120, 0]);
  });

  it("compara con el mismo día de la semana pasada", () => {
    expect(sameDayLastWeek(series, ["principal", "sucursal"], NOW)).toEqual({ date: "2026-10-20", total: 420 });
    expect(sameDayLastWeek([], ["principal"], NOW)).toBeNull();
  });

  it("promedia solo los días con venta", () => {
    expect(averageDay(series, ["principal", "sucursal"])).toBe(335);
  });

  it("saluda según la hora", () => {
    expect(greeting(new Date(2026, 9, 27, 9).getTime())).toBe("Buenos días");
    expect(greeting(NOW)).toBe("Buenas tardes");
  });
});

describe("pendientes", () => {
  const cash = (branchId: string, open: boolean, openedAt: string | null): CashSummary => ({
    session: { branchId, open, openedAt, openedBy: null, openingAmount: 150 }, sales: [], totals: { efectivo: 0, yape: 0, tarjeta: 0, tickets: 0 }, movements: [], expected: 150,
  });
  const transfer = (status: Transfer["status"], from: string, to: string): Transfer => ({
    id: 4, code: "T-0004", fromBranchId: from, toBranchId: to, status, note: "", requested: [{ productId: 1, units: 5 }], items: [], createdAt: "", createdBy: "",
    dispatchedAt: null, dispatchedBy: null, receivedAt: null, receivedBy: null, cancelledAt: null, cancelledBy: null, cancelReason: null,
  });
  const base = { branchName: (b: string) => (b === "principal" ? "Principal" : "Sucursal"), expiry: [], inventory: [], now: NOW };

  it("ordena lo crítico primero y lleva al módulo que lo resuelve", () => {
    const alerts = buildAlerts({
      ...base,
      user: { role: "encargado", branchId: "principal" },
      transfers: [transfer("solicitado", "principal", "sucursal"), transfer("solicitado", "sucursal", "principal")],
      cash: [cash("principal", true, new Date(2026, 9, 26, 8).toISOString())],
    });
    expect(alerts.map((a) => [a.tone, a.href])).toEqual([["critical", "/caja"], ["warning", "/traslados"]]);
    expect(alerts[1]!.title).toBe("Sucursal pidió mercadería (T-0004)");
  });

  it("avisa la caja cerrada y no repite traslados que no le tocan", () => {
    const alerts = buildAlerts({ ...base, user: { role: "encargado", branchId: "sucursal" }, transfers: [transfer("solicitado", "principal", "sucursal")], cash: [cash("sucursal", false, null)], refillsToNotify: 3 });
    expect(alerts.map((a) => a.id)).toEqual(["caja-sucursal", "recompras"]);
    expect(alerts[1]!.title).toBe("3 clientes por avisar su recompra");
  });
});
