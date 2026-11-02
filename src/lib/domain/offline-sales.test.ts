import { describe, expect, it } from "vitest";
import type { Lot, Product, SaleSyncItem } from "@/lib/api/types";
import { buildCartLines, cartTotals } from "./pharmacy";
import {
  applyBatchError, applyOutcome, applyReserved, backoffDelay, buildProvisionalSale, classifyFailure, discardFailed, dueItems, emptyQueue,
  enqueueSale, forceDue, isConnectionError, markSyncing, newClientSaleId, pruneSynced, queueSummary, recoverInterrupted, reservedUnits,
  restoreQueue, retryFailed, HOLD_MS, SYNCED_KEEP_MS, type QueueState,
} from "./offline-sales";

const NOW = new Date(2026, 10, 2, 10, 0).getTime();

const paracetamol: Product = {
  id: 1, name: "Paracetamol", active: "Paracetamol", conc: "500 mg", form: "Tableta", lab: "Genfar", category: "Analgésicos", rx: "libre",
  unitsPerBox: 100, unitsPerBlister: 10, unitName: "tableta", priceUnit: 0.2, priceBlister: 1.8, priceBox: 15, cost: 0.08, minStock: 100,
  location: "A-1", barcode: "7751", sanitaryReg: "EN-1", coldChain: false,
};
const lot = (id: number, expiresOn: string, qty: number, branchId = "principal"): Lot => ({ id, branchId, productId: 1, code: `L${id}`, expiresOn, qty, cost: 0.08, discount: 0, receivedOn: null, supplier: null });

const sale = (id: string, units = 2, branchId = "principal"): SaleSyncItem => ({
  clientSaleId: id,
  branchId,
  items: [{ productId: 1, presentation: "unidad", qty: units }],
  payment: { method: "efectivo", received: 10 },
  document: { type: "boleta" },
});
const add = (s: QueueState, id: string, now = NOW, units = 2, branchId = "principal") =>
  enqueueSale(s, { request: sale(id, units, branchId), total: units * 0.2, reserve: [{ productId: 1, units }], now }).state;
const get = (s: QueueState, id: string) => s.items.find((i) => i.clientSaleId === id)!;

describe("clave de idempotencia", () => {
  it("genera claves distintas con forma de UUID", () => {
    const a = newClientSaleId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(newClientSaleId()).not.toBe(a);
  });
});

describe("cola: entrada y orden", () => {
  it("numera los tickets provisionales en orden y los marca en la venta", () => {
    let s = add(emptyQueue(), "a");
    s = add(s, "b");
    expect(s.items.map((i) => i.ticket)).toEqual(["OFF-0001", "OFF-0002"]);
    expect(get(s, "a").request).toMatchObject({ offlineTicket: "OFF-0001", soldAt: new Date(NOW).toISOString(), clientSaleId: "a" });
    expect(get(s, "a")).toMatchObject({ status: "pending", attempts: 0, total: 0.4, itemCount: 1 });
  });

  it("encolar la misma clave dos veces no duplica ni gasta otro número", () => {
    const once = add(emptyQueue(), "a");
    const twice = add(once, "a");
    expect(twice.items).toHaveLength(1);
    expect(twice.nextSeq).toBe(2);
  });

  it("no reutiliza el número de un ticket descartado", () => {
    let s = add(emptyQueue(), "a");
    s = applyOutcome(markSyncing(s, ["a"]), "a", { ok: false, error: { code: "STOCK_INSUFICIENTE", status: 409, message: "x" } }, NOW);
    s = add(discardFailed(s, "a"), "b");
    expect(s.items.map((i) => i.ticket)).toEqual(["OFF-0002"]);
  });

  it("envía en orden de cobro (FIFO) y respeta el límite del lote", () => {
    let s = emptyQueue();
    for (const id of ["a", "b", "c", "d"]) s = add(s, id);
    expect(dueItems(s, NOW).map((i) => i.clientSaleId)).toEqual(["a", "b", "c", "d"]);
    expect(dueItems(s, NOW, 2).map((i) => i.clientSaleId)).toEqual(["a", "b"]);
  });

  it("no adelanta una venta posterior mientras la anterior espera su reintento", () => {
    let s = add(add(emptyQueue(), "a"), "b");
    s = applyOutcome(markSyncing(s, ["a"]), "a", { ok: false, error: { code: "SIN_CONEXION", status: 0, message: "sin red" } }, NOW);
    expect(dueItems(s, NOW + 1_000)).toEqual([]);
    expect(dueItems(s, NOW + 5_000).map((i) => i.clientSaleId)).toEqual(["a", "b"]);
  });

  it("una venta fallida no frena a las siguientes", () => {
    let s = add(add(emptyQueue(), "a"), "b");
    s = applyOutcome(markSyncing(s, ["a"]), "a", { ok: false, error: { code: "STOCK_INSUFICIENTE", status: 409, message: "x" } }, NOW);
    expect(dueItems(s, NOW).map((i) => i.clientSaleId)).toEqual(["b"]);
  });
});

describe("clasificación de errores", () => {
  it("reintenta los fallos de red y de servidor", () => {
    expect(classifyFailure({ code: "SIN_CONEXION", status: 0 })).toBe("retry");
    expect(classifyFailure({ code: "HTTP_502", status: 502 })).toBe("retry");
    expect(classifyFailure({ code: "HTTP_429", status: 429 })).toBe("retry");
    expect(classifyFailure({ code: "ERROR_INTERNO", status: 500 })).toBe("retry");
    expect(classifyFailure({})).toBe("retry");
  });
  it("retiene sin contar intentos la sesión vencida y la cuenta en solo lectura", () => {
    expect(classifyFailure({ code: "NO_AUTORIZADO", status: 401 })).toBe("hold");
    expect(classifyFailure({ code: "CUENTA_SUSPENDIDA", status: 403 })).toBe("hold");
  });
  it("manda a revisión humana lo que el servidor rechaza por una regla", () => {
    for (const code of ["STOCK_INSUFICIENTE", "CAJA_CERRADA", "RECETA_REQUERIDA", "DOCUMENTO_INVALIDO", "PRODUCTO_NO_EXISTE", "CLAVE_REPETIDA", "SIN_PERMISO"]) {
      expect(classifyFailure({ code, status: code === "STOCK_INSUFICIENTE" ? 409 : 400 })).toBe("conflict");
    }
  });
  it("reconoce solo la falta de conexión como motivo para guardar sin conexión", () => {
    expect(isConnectionError({ code: "SIN_CONEXION", status: 0 })).toBe(true);
    expect(isConnectionError({ code: "STOCK_INSUFICIENTE", status: 409 })).toBe(false);
    expect(isConnectionError({ code: "HTTP_500", status: 500 })).toBe(false);
    expect(isConnectionError(null)).toBe(false);
  });
  it("la espera crece al doble y se detiene en 5 minutos", () => {
    expect([1, 2, 3, 4].map(backoffDelay)).toEqual([5_000, 10_000, 20_000, 40_000]);
    expect(backoffDelay(30)).toBe(5 * 60_000);
  });
});

describe("cola: resultado del envío", () => {
  it("una venta enviada queda con su número oficial", () => {
    const s = applyOutcome(markSyncing(add(emptyQueue(), "a"), ["a"]), "a", { ok: true, saleNumber: "B001-000124", saleId: "s_1" }, NOW);
    expect(get(s, "a")).toMatchObject({ status: "synced", saleNumber: "B001-000124", saleId: "s_1", syncedAt: NOW, lastError: null });
  });

  it("un fallo de red vuelve a pendiente con espera creciente y nunca la descarta", () => {
    let s = add(emptyQueue(), "a");
    let t = NOW;
    for (const wait of [5_000, 10_000, 20_000]) {
      s = applyOutcome(markSyncing(s, ["a"]), "a", { ok: false, error: { code: "SIN_CONEXION", status: 0, message: "sin red" } }, t);
      expect(get(s, "a")).toMatchObject({ status: "pending", nextAttemptAt: t + wait });
      t += wait;
    }
    expect(get(s, "a").attempts).toBe(3);
  });

  it("un conflicto la deja fallida y visible con el motivo", () => {
    const s = applyOutcome(markSyncing(add(emptyQueue(), "a"), ["a"]), "a", { ok: false, error: { code: "STOCK_INSUFICIENTE", status: 409, message: "No hay stock" } }, NOW);
    expect(get(s, "a")).toMatchObject({ status: "failed", attempts: 1, lastError: { code: "STOCK_INSUFICIENTE", message: "No hay stock", kind: "conflict" } });
    expect(queueSummary(s)).toMatchObject({ failed: 1, unsent: 1 });
  });

  it("la sesión vencida espera sin gastar intentos", () => {
    const s = applyOutcome(markSyncing(add(emptyQueue(), "a"), ["a"]), "a", { ok: false, error: { code: "NO_AUTORIZADO", status: 401, message: "Vuelve a ingresar" } }, NOW);
    expect(get(s, "a")).toMatchObject({ status: "pending", attempts: 0, nextAttemptAt: NOW + HOLD_MS });
  });

  it("si falla la llamada completa, todas vuelven a pendientes, aunque el error parezca de negocio", () => {
    let s = add(add(emptyQueue(), "a"), "b");
    s = applyBatchError(markSyncing(s, ["a", "b"]), ["a", "b"], { code: "DATOS_INVALIDOS", status: 400, message: "Lote mal formado" }, NOW);
    expect(s.items.map((i) => i.status)).toEqual(["pending", "pending"]);
    expect(s.items.every((i) => i.nextAttemptAt !== null && i.lastError?.kind === "retry")).toBe(true);
  });

  it("sincronizar ahora quita la espera de las pendientes", () => {
    let s = applyOutcome(markSyncing(add(emptyQueue(), "a"), ["a"]), "a", { ok: false, error: { code: "SIN_CONEXION", status: 0, message: "x" } }, NOW);
    expect(dueItems(s, NOW)).toEqual([]);
    s = forceDue(s);
    expect(dueItems(s, NOW).map((i) => i.clientSaleId)).toEqual(["a"]);
  });
});

describe("cola: reintentar y descartar", () => {
  const failed = () => applyOutcome(markSyncing(add(add(emptyQueue(), "a"), "b"), ["a"]), "a", { ok: false, error: { code: "CAJA_CERRADA", status: 400, message: "Caja cerrada" } }, NOW);

  it("reintentar devuelve la fallida a pendiente y conserva el motivo anterior", () => {
    const s = retryFailed(failed(), "a");
    expect(get(s, "a")).toMatchObject({ status: "pending", nextAttemptAt: null, lastError: { code: "CAJA_CERRADA" } });
  });
  it("solo se puede descartar una venta fallida", () => {
    const s = failed();
    expect(discardFailed(s, "b").items).toHaveLength(2); // pendiente: no se toca
    expect(discardFailed(s, "a").items.map((i) => i.clientSaleId)).toEqual(["b"]);
    const synced = applyOutcome(add(emptyQueue(), "c"), "c", { ok: true, saleNumber: "B001-1", saleId: "s" }, NOW);
    expect(discardFailed(synced, "c").items).toHaveLength(1);
  });
  it("reintentar no toca las que no fallaron", () => {
    const s = add(emptyQueue(), "a");
    expect(retryFailed(s, "a")).toEqual(s);
  });
});

describe("cola: recuperación y limpieza", () => {
  it("lo que quedó enviándose por un cierre brusco vuelve a pendiente", () => {
    const s = recoverInterrupted(markSyncing(add(emptyQueue(), "a"), ["a"]));
    expect(get(s, "a").status).toBe("pending");
  });
  it("restaura lo guardado, ignora basura y no repite números", () => {
    expect(restoreQueue(null)).toEqual(emptyQueue());
    expect(restoreQueue({ items: "x" })).toEqual(emptyQueue());
    const saved = markSyncing(add(add(emptyQueue(), "a"), "b"), ["a"]);
    const back = restoreQueue(JSON.parse(JSON.stringify({ ...saved, nextSeq: 1 })));
    expect(back.items.map((i) => i.status)).toEqual(["pending", "pending"]);
    expect(back.nextSeq).toBe(3);
    expect(restoreQueue({ items: [{ nope: true }, saved.items[0]], nextSeq: 5 }).items).toHaveLength(1);
  });
  it("quita las enviadas hace más de un día y deja el resto", () => {
    let s = add(add(emptyQueue(), "a"), "b");
    s = applyOutcome(s, "a", { ok: true, saleNumber: "B001-1", saleId: "s" }, NOW);
    expect(pruneSynced(s, NOW + SYNCED_KEEP_MS).items).toHaveLength(2);
    expect(pruneSynced(s, NOW + SYNCED_KEEP_MS + 1).items.map((i) => i.clientSaleId)).toEqual(["b"]);
  });
  it("cuenta cada estado", () => {
    let s = add(add(add(emptyQueue(), "a"), "b"), "c");
    s = applyOutcome(s, "a", { ok: true, saleNumber: "B001-1", saleId: "s" }, NOW);
    s = applyOutcome(s, "b", { ok: false, error: { code: "STOCK_INSUFICIENTE", status: 409, message: "x" } }, NOW);
    expect(queueSummary(s)).toEqual({ pending: 1, syncing: 0, failed: 1, synced: 1, unsent: 2 });
  });
});

describe("stock reservado sin conexión", () => {
  it("suma lo vendido sin enviar de un local y no cuenta lo ya enviado", () => {
    let s = add(add(add(emptyQueue(), "a", NOW, 3), "b", NOW, 4), "c", NOW, 9, "sucursal");
    s = applyOutcome(s, "a", { ok: true, saleNumber: "B001-1", saleId: "s" }, NOW);
    expect(reservedUnits(s, "principal").get(1)).toBe(4);
    expect(reservedUnits(s, "sucursal").get(1)).toBe(9);
  });
  it("las fallidas siguen reservando: la mercadería ya salió del local", () => {
    const s = applyOutcome(add(emptyQueue(), "a", NOW, 5), "a", { ok: false, error: { code: "STOCK_INSUFICIENTE", status: 409, message: "x" } }, NOW);
    expect(reservedUnits(s, "principal").get(1)).toBe(5);
  });
  it("descuenta por FEFO sin tocar los lotes originales", () => {
    const lots = [lot(2, "2027-06-30", 10), lot(1, "2026-12-31", 4)];
    const out = applyReserved(lots, new Map([[1, 6]]), NOW);
    expect(out.find((l) => l.id === 1)!.qty).toBe(0); // vence primero: sale primero
    expect(out.find((l) => l.id === 2)!.qty).toBe(8);
    expect(lots.map((l) => l.qty)).toEqual([10, 4]);
  });
  it("no deja stock negativo si se reservó más de lo que hay", () => {
    const out = applyReserved([lot(1, "2026-12-31", 3)], new Map([[1, 10]]), NOW);
    expect(out[0]!.qty).toBe(0);
  });
  it("sin reservas devuelve los mismos lotes", () => {
    const lots = [lot(1, "2026-12-31", 3)];
    expect(applyReserved(lots, new Map(), NOW)).toBe(lots);
  });
});

describe("ticket provisional", () => {
  it("arma la venta con el número OFF y los totales del carrito", () => {
    const lines = buildCartLines([{ key: "k", productId: 1, presentation: "blister", qty: 2 }], new Map([[1, paracetamol]]), [lot(1, "2026-12-31", 100)], NOW);
    const totals = cartTotals(lines);
    const s = buildProvisionalSale({
      clientSaleId: "abc", ticket: "OFF-0007", branchId: "principal", soldAt: new Date(NOW).toISOString(), sellerName: "Rosa", lines, totals,
      payment: { method: "efectivo", received: 5 }, document: { type: "boleta" }, customerId: null, prescription: null,
    });
    expect(s).toMatchObject({ number: "OFF-0007", offlineTicket: "OFF-0007", clientSaleId: "abc", total: 3.6, branchId: "principal", sellerName: "Rosa" });
    expect(s.payment).toMatchObject({ received: 5, change: 1.4 });
    expect(s.items[0]).toMatchObject({ qty: 2, units: 20, presentationLabel: "Blíster x10", total: 3.6 });
    expect(s.items[0]!.lots).toEqual([{ lotId: 1, code: "L1", expiresOn: "2026-12-31", units: 20 }]);
  });
});
