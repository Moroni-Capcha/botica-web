/**
 * Clientes y recompras (reglas puras, se prueban con Vitest).
 */
import type { Customer, CustomerInput, Product, RefillInfo, Treatment } from "@/lib/api/types";
import { isValidDni, isValidRuc, startOfDay } from "./pharmacy";

const DAY = 86_400_000;

/* ------------------------------ Recompras ------------------------------ */

export type RefillStatus = "atrasado" | "hoy" | "pronto" | "al_dia" | "sin_compra";

export interface RefillRow {
  customer: Customer;
  product: Product;
  treatment: Treatment;
  lastPurchaseAt: string | null;
  /** Fecha en que se le termina, según su ciclo. */
  nextAt: number | null;
  /** Días que faltan (negativo = atrasado). */
  due: number | null;
  status: RefillStatus;
  /** Se le avisó después de su última compra y hace menos de 5 días: no conviene repetir. */
  recentlyContacted: boolean;
  lastContactAt: string | null;
}

/** Días antes de que se le termine en que ya conviene avisar. */
export const SOON_DAYS = 3;

export function refillRows(customers: Customer[], infos: RefillInfo[], products: Product[], now: number): RefillRow[] {
  const byProduct = new Map(products.map((p) => [p.id, p]));
  const info = new Map(infos.map((i) => [`${i.customerId}:${i.productId}`, i]));
  const today = startOfDay(now);
  const rows: RefillRow[] = [];
  for (const customer of customers) {
    for (const treatment of customer.treatments) {
      const product = byProduct.get(treatment.productId);
      if (!product) continue;
      const i = info.get(`${customer.id}:${treatment.productId}`);
      const last = i?.lastPurchaseAt ? new Date(i.lastPurchaseAt).getTime() : null;
      const nextAt = last !== null ? startOfDay(last) + treatment.everyDays * DAY : null;
      const due = nextAt !== null ? Math.round((nextAt - today) / DAY) : null;
      const status: RefillStatus = due === null ? "sin_compra" : due < 0 ? "atrasado" : due === 0 ? "hoy" : due <= SOON_DAYS ? "pronto" : "al_dia";
      const contact = i?.lastContactAt ? new Date(i.lastContactAt).getTime() : null;
      const recentlyContacted = contact !== null && (last === null || contact > last) && now - contact < 5 * DAY;
      rows.push({ customer, product, treatment, lastPurchaseAt: i?.lastPurchaseAt ?? null, nextAt, due, status, recentlyContacted, lastContactAt: i?.lastContactAt ?? null });
    }
  }
  const rank: Record<RefillStatus, number> = { atrasado: 0, hoy: 1, pronto: 2, al_dia: 3, sin_compra: 4 };
  return rows.sort((a, b) => rank[a.status] - rank[b.status] || (a.due ?? 999) - (b.due ?? 999) || a.customer.name.localeCompare(b.customer.name));
}

/** Los que hay que avisar hoy: atrasados, hoy o en los próximos días, que aceptaron contacto y no se les avisó hace poco. */
export const toNotify = (rows: RefillRow[]) => rows.filter((r) => (r.status === "atrasado" || r.status === "hoy" || r.status === "pronto") && r.customer.contactConsent && !r.recentlyContacted);

/* ------------------------------ WhatsApp ------------------------------ */

/** Celular peruano en formato internacional sin "+": "987 654 321" → "51987654321". null si no es un celular. */
export function peruMobile(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  if (/^9\d{8}$/.test(d)) return `51${d}`;
  if (/^519\d{8}$/.test(d)) return d;
  return null;
}

export const whatsappLink = (phone: string, text: string): string | null => {
  const n = peruMobile(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Mensaje de recordatorio, corto y sin datos de salud innecesarios (no nombra la enfermedad). */
export function refillMessage(r: Pick<RefillRow, "customer" | "product" | "due">, pharmacyName: string): string {
  const when = r.due === null ? "" : r.due < 0 ? "ya le tocaba renovarlo" : r.due === 0 ? "se le termina hoy" : r.due === 1 ? "se le termina mañana" : `se le termina en ${r.due} días`;
  return `Hola ${firstName(r.customer.name)}, le saluda ${pharmacyName}. Le recordamos que su ${r.product.name} ${r.product.conc} ${when}. Ya lo tenemos disponible: puede pasar a recogerlo o responder este mensaje para separárselo.`.replace(/\s+\./g, ".");
}

/* ------------------------------ Ficha ------------------------------ */

export type CustomerErrors = Partial<Record<"name" | "dni" | "ruc" | "phone" | "treatments" | "contactConsent", string>>;

export function validateCustomer(c: CustomerInput, others: Customer[] = [], selfId?: number): CustomerErrors {
  const e: CustomerErrors = {};
  if (c.name.trim().length < 3) e.name = "Escribe el nombre completo o la razón social.";
  if (c.dni && !isValidDni(c.dni)) e.dni = "El DNI tiene 8 dígitos.";
  else if (c.dni && others.some((o) => o.id !== selfId && o.dni === c.dni)) e.dni = "Ya hay un cliente con ese DNI.";
  if (c.ruc && !isValidRuc(c.ruc)) e.ruc = "RUC de 11 dígitos que empieza en 10 o 20.";
  else if (c.ruc && others.some((o) => o.id !== selfId && o.ruc === c.ruc)) e.ruc = "Ya hay un cliente con ese RUC.";
  if (c.phone && !/^[\d\s+()-]{6,20}$/.test(c.phone)) e.phone = "Escribe solo números.";
  if (c.contactConsent && !peruMobile(c.phone)) e.contactConsent = "Para avisarle hace falta un celular (9 dígitos).";
  const ids = c.treatments.map((t) => t.productId);
  if (new Set(ids).size !== ids.length) e.treatments = "Un medicamento está repetido.";
  else if (c.treatments.some((t) => !Number.isInteger(t.everyDays) || t.everyDays < 1 || t.everyDays > 365)) e.treatments = "El ciclo va de 1 a 365 días.";
  return e;
}

/**
 * Ciclo sugerido para un tratamiento: lo que dura la presentación que más compra.
 * Si lleva una caja de 30 tabletas y toma 1 al día, son 30 días. Sin datos, 30.
 */
export function suggestedCycle(product: Product, lastUnits: number, perDay = 1): number {
  const units = lastUnits > 0 ? lastUnits : product.unitsPerBox > 1 ? product.unitsPerBox : 30;
  return Math.max(1, Math.min(365, Math.round(units / perDay)));
}

/** Puntos: 1 por cada S/ 10. */
export const pointsFor = (total: number) => Math.floor(total / 10);
