import { describe, expect, it } from "vitest";
import type { Lot, Product } from "@/lib/api/types";
import { dailyRates } from "./expiry";
import { DEFAULT_THRESHOLDS, stockOf } from "./pharmacy";
import { checkTransferLine, suggestTransfers, transferActions, transferCode, transferMode, transferUnits, type TransferLineDraft } from "./transfers";

const NOW = new Date(2026, 9, 27, 10, 0).getTime(); // 27/10/2026

const amox: Product = {
  id: 7, name: "Amoxicilina", active: "Amoxicilina", conc: "500 mg", form: "Cápsula", lab: "Genfar", category: "Antibióticos", rx: "receta",
  unitsPerBox: 100, unitsPerBlister: 10, unitName: "cápsula", priceUnit: 0.6, priceBlister: 5, priceBox: 45, cost: 0.25, minStock: 100,
  minStockByBranch: { sucursal: 40 }, location: "B-2", barcode: "7751000000007", sanitaryReg: "EN-2", coldChain: false,
};
/** Resumen de stock vigente por local, como lo entrega GET /stock/summary. */
const summary = (lots: Lot[]) => new Map(["principal", "sucursal"].map((b) => [`${b}:7`, stockOf(lots.filter((l) => l.branchId === b), 7, NOW)]));
const suggest = (lots: Lot[], rates: Map<string, number>) =>
  suggestTransfers({ products: [amox], lots, stock: summary(lots), branchIds: ["principal", "sucursal"], rates, now: NOW, coverDays: 15, thresholds: DEFAULT_THRESHOLDS });

const lot = (id: number, branchId: string, expiresOn: string, qty: number): Lot => ({ id, branchId, productId: 7, code: `L${id}`, expiresOn, qty, cost: 0.25, discount: 0, receivedOn: null, supplier: null });

describe("sugerencias de traslado", () => {
  it("sugiere llevar stock al local que está en su mínimo si el otro tiene de sobra", () => {
    // principal 2 u/día, sucursal 1 u/día. Sucursal con 30 (mínimo 40). Principal con 600.
    const rates = dailyRates([
      { branchId: "principal", productId: 7, units: 60, days: 30 },
      { branchId: "sucursal", productId: 7, units: 30, days: 30 },
    ]);
    const s = suggest([lot(1, "principal", "2028-01-01", 600), lot(2, "sucursal", "2028-01-01", 30)], rates);
    expect(s).toHaveLength(1);
    // necesita 40 + 1 × 7 − 30 = 17; sobran 600 − (100 + 30) = 470
    expect(s[0]).toMatchObject({ kind: "stock", from: "principal", to: "sucursal", units: 17, lotId: null });
  });

  it("no sugiere si el origen no tiene de sobra", () => {
    const rates = dailyRates([{ branchId: "principal", productId: 7, units: 300, days: 30 }]);
    expect(suggest([lot(1, "principal", "2028-01-01", 200), lot(2, "sucursal", "2028-01-01", 10)], rates)).toEqual([]);
  });

  it("sugiere mover un lote por vencer al local que lo vende más rápido", () => {
    // Principal vende 1 u/día y tiene 60 que vencen en 20 días → 40 en riesgo. Sucursal vende 5 u/día.
    const rates = dailyRates([
      { branchId: "principal", productId: 7, units: 30, days: 30 },
      { branchId: "sucursal", productId: 7, units: 150, days: 30 },
    ]);
    const s = suggest([lot(1, "principal", "2026-11-16", 60), lot(2, "sucursal", "2028-01-01", 500)], rates);
    const v = s.find((x) => x.kind === "vencimiento")!;
    expect(v).toMatchObject({ from: "principal", to: "sucursal", lotId: 1, units: 40, loss: 10 });
    expect(s[0]!.kind).toBe("vencimiento");
  });
});

describe("formulario de traslado", () => {
  const lots = [lot(1, "principal", "2027-01-01", 50), lot(2, "principal", "2027-06-01", 300), lot(3, "principal", "2026-10-01", 80)];
  const line = (over: Partial<TransferLineDraft> = {}): TransferLineDraft => ({ key: "a", productId: 7, lotId: null, qty: 3, mode: "caja", ...over });

  it("cuenta solo stock vigente y descuenta otras filas", () => {
    const a = line({ qty: 2 });
    const b = line({ key: "b", lotId: 1, qty: 50, mode: "unidad" });
    expect(checkTransferLine(a, amox, { mode: "send", originLots: lots, lines: [a, b], now: NOW })).toEqual({ units: 200, available: 300, error: null });
    expect(checkTransferLine(line({ qty: 4 }), amox, { mode: "send", originLots: lots, lines: [], now: NOW }).error).toContain("Solo hay 350");
  });

  it("valida el lote elegido; un pedido no exige stock", () => {
    expect(checkTransferLine(line({ lotId: 1, qty: 60, mode: "unidad" }), amox, { mode: "send", originLots: lots, lines: [], now: NOW }).error).toContain("en ese lote");
    expect(checkTransferLine(line({ qty: 9 }), amox, { mode: "ask", originLots: lots, lines: [], now: NOW }).error).toBeNull();
    expect(checkTransferLine(line({ qty: 0 }), amox, { mode: "ask", originLots: lots, lines: [], now: NOW }).error).toBe("Indica la cantidad");
  });
});

describe("permisos", () => {
  const principal = { role: "encargado" as const, branchId: "principal" };
  const sucursal = { role: "encargado" as const, branchId: "sucursal" };
  const admin = { role: "admin" as const, branchId: null };
  const t = (status: "solicitado" | "en_transito" | "recibido") => ({ status, fromBranchId: "principal", toBranchId: "sucursal" });

  it("el origen despacha, el destino recibe y el pedido lo anula cualquiera", () => {
    expect(transferActions(t("solicitado"), principal)).toEqual({ dispatch: true, receive: false, cancel: true });
    expect(transferActions(t("solicitado"), sucursal)).toEqual({ dispatch: false, receive: false, cancel: true });
    expect(transferActions(t("en_transito"), sucursal)).toEqual({ dispatch: false, receive: true, cancel: false });
    expect(transferActions(t("en_transito"), principal)).toEqual({ dispatch: false, receive: false, cancel: true });
    expect(transferActions(t("recibido"), admin)).toEqual({ dispatch: false, receive: false, cancel: false });
  });

  it("el encargado envía desde su local y pide al otro", () => {
    expect(transferMode(sucursal, "sucursal")).toBe("send");
    expect(transferMode(sucursal, "principal")).toBe("ask");
    expect(transferMode(admin, "principal")).toBe("send");
  });

  it("numera y suma unidades", () => {
    expect(transferCode(12)).toBe("T-0012");
    expect(transferUnits({ items: [], requested: [{ productId: 1, units: 5 }, { productId: 2, units: 3 }] })).toBe(8);
  });
});
