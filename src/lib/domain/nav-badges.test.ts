import { describe, expect, it } from "vitest";
import { cashBadge, expiryBadge, voucherBadge } from "./nav-badges";

const DAY = 86_400_000;
const now = new Date(2026, 5, 15, 10).getTime();
const day = (offset: number) => {
  const d = new Date(now + offset * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

describe("expiryBadge", () => {
  it("no avisa si todo está vigente o sin stock", () => {
    expect(expiryBadge([{ qty: 5, expiresOn: day(200) }, { qty: 0, expiresOn: day(-3) }], now)).toBeNull();
  });
  it("cuenta vencidos y críticos; rojo si hay alguno vencido", () => {
    const b = expiryBadge([{ qty: 1, expiresOn: day(-1) }, { qty: 2, expiresOn: day(10) }, { qty: 3, expiresOn: day(60) }], now);
    expect(b).toMatchObject({ count: 2, tone: "danger" });
    expect(b?.label).toBe("1 lote vencido y 1 lote por vencer pronto");
  });
  it("ámbar si solo hay lotes por vencer pronto", () => {
    expect(expiryBadge([{ qty: 1, expiresOn: day(5) }, { qty: 1, expiresOn: day(30) }], now)).toMatchObject({ count: 2, tone: "warn" });
  });
});

describe("cashBadge", () => {
  it("distingue abierta, cerrada y sin dato", () => {
    expect(cashBadge({ open: true })).toMatchObject({ tone: "ok", label: "Caja abierta" });
    expect(cashBadge({ open: false })).toMatchObject({ tone: "idle", label: "Caja cerrada" });
    expect(cashBadge(undefined)).toBeNull();
  });
});

describe("voucherBadge", () => {
  it("no avisa sin pendientes ni rechazados", () => {
    expect(voucherBadge({ pendiente: 0, rechazado: 0 })).toBeNull();
  });
  it("rojo con rechazados, ámbar solo con pendientes", () => {
    expect(voucherBadge({ pendiente: 2, rechazado: 1 })).toMatchObject({ count: 3, tone: "danger", label: "1 rechazado y 2 pendientes en SUNAT" });
    expect(voucherBadge({ pendiente: 1, rechazado: 0 })).toMatchObject({ count: 1, tone: "warn" });
  });
});
