import { describe, expect, it } from "vitest";
import type { Customer, CustomerInput, Product } from "@/lib/api/types";
import { peruMobile, refillMessage, refillRows, suggestedCycle, toNotify, validateCustomer, whatsappLink } from "./customers";

const NOW = new Date(2026, 9, 27, 10, 0).getTime(); // 27/10/2026
const at = (d: number, m = 9) => new Date(2026, m, d, 11, 0).toISOString();

const losartan: Product = {
  id: 17, name: "Losartán", active: "Losartán", conc: "50 mg", form: "Tableta", lab: "Genfar", category: "Crónicos", rx: "receta",
  unitsPerBox: 30, unitsPerBlister: 10, unitName: "tableta", priceUnit: 0.5, priceBlister: 4.5, priceBox: 12, cost: 0.2, minStock: 60, location: "C-1", barcode: "7751000000017", sanitaryReg: "EN-17", coldChain: false,
};
const metformina: Product = { ...losartan, id: 18, name: "Metformina", conc: "850 mg", barcode: "7751000000018" };
const customer = (id: number, over: Partial<Customer> = {}): Customer => ({
  id, name: "Rosa Huamán Quispe", dni: "40125588", ruc: "", phone: "987 112 334", points: 0, treatments: [{ productId: 17, everyDays: 30 }], contactConsent: true, notes: "", createdAt: at(1, 0), ...over,
});

describe("recompras", () => {
  it("calcula cuándo se le termina y ordena lo atrasado primero", () => {
    const customers = [customer(1), customer(2, { name: "Jorge Castillo", treatments: [{ productId: 18, everyDays: 30 }, { productId: 17, everyDays: 15 }] })];
    const rows = refillRows(
      customers,
      [
        { customerId: 1, productId: 17, lastPurchaseAt: at(29, 8), lastUnits: 30, lastContactAt: null }, // 29/09 + 30 = 29/10 → en 2 días
        { customerId: 2, productId: 18, lastPurchaseAt: at(20, 8), lastUnits: 30, lastContactAt: null }, // 20/09 + 30 = 20/10 → atrasado 7
        { customerId: 2, productId: 17, lastPurchaseAt: at(25), lastUnits: 15, lastContactAt: null }, // 25/10 + 15 = 09/11 → al día
      ],
      [losartan, metformina],
      NOW,
    );
    expect(rows.map((r) => [r.customer.id, r.product.id, r.status, r.due])).toEqual([
      [2, 18, "atrasado", -7],
      [1, 17, "pronto", 2],
      [2, 17, "al_dia", 13],
    ]);
  });

  it("sin compra registrada queda al final; no repite el aviso de los últimos días", () => {
    const rows = refillRows(
      [customer(1), customer(3, { name: "Ana", treatments: [{ productId: 18, everyDays: 30 }] })],
      [{ customerId: 1, productId: 17, lastPurchaseAt: at(20, 8), lastUnits: 30, lastContactAt: at(26) }],
      [losartan, metformina],
      NOW,
    );
    expect(rows[0]).toMatchObject({ status: "atrasado", recentlyContacted: true });
    expect(rows[1]!.status).toBe("sin_compra");
    expect(toNotify(rows)).toEqual([]);
  });

  it("solo avisa a quien dio su consentimiento", () => {
    const rows = refillRows([customer(1, { contactConsent: false })], [{ customerId: 1, productId: 17, lastPurchaseAt: at(20, 8), lastUnits: 30, lastContactAt: null }], [losartan], NOW);
    expect(toNotify(rows)).toEqual([]);
  });

  it("sugiere el ciclo según lo que compra", () => {
    expect(suggestedCycle(losartan, 0)).toBe(30);
    expect(suggestedCycle(losartan, 60)).toBe(60);
    expect(suggestedCycle(losartan, 60, 2)).toBe(30);
  });
});

describe("WhatsApp", () => {
  it("normaliza celulares peruanos", () => {
    expect(peruMobile("987 112 334")).toBe("51987112334");
    expect(peruMobile("+51 987-112-334")).toBe("51987112334");
    expect(peruMobile("01 330 4455")).toBeNull();
  });

  it("arma el enlace con el mensaje sin nombrar la enfermedad", () => {
    const msg = refillMessage({ customer: customer(1), product: losartan, due: 2 }, "Botica Huánuco");
    expect(msg).toBe("Hola Rosa, le saluda Botica Huánuco. Le recordamos que su Losartán 50 mg se le termina en 2 días. Ya lo tenemos disponible: puede pasar a recogerlo o responder este mensaje para separárselo.");
    expect(whatsappLink("987112334", "Hola")).toBe("https://wa.me/51987112334?text=Hola");
    expect(whatsappLink("013304455", "Hola")).toBeNull();
  });
});

describe("ficha del cliente", () => {
  const input = (over: Partial<CustomerInput> = {}): CustomerInput => ({ name: "Rosa Huamán", dni: "40125588", ruc: "", phone: "987112334", treatments: [{ productId: 17, everyDays: 30 }], contactConsent: true, notes: "", ...over });

  it("valida documento, celular y tratamientos", () => {
    expect(validateCustomer(input())).toEqual({});
    expect(validateCustomer(input({ dni: "123" })).dni).toBeTruthy();
    expect(validateCustomer(input({ ruc: "30123456789" })).ruc).toBeTruthy();
    expect(validateCustomer(input({ phone: "01 330 4455" })).contactConsent).toBeTruthy();
    expect(validateCustomer(input({ treatments: [{ productId: 17, everyDays: 30 }, { productId: 17, everyDays: 15 }] })).treatments).toBeTruthy();
    expect(validateCustomer(input({ treatments: [{ productId: 17, everyDays: 0 }] })).treatments).toBeTruthy();
  });

  it("no repite DNI con otro cliente", () => {
    expect(validateCustomer(input(), [customer(5)]).dni).toBeTruthy();
    expect(validateCustomer(input(), [customer(5)], 5).dni).toBeUndefined();
  });
});
