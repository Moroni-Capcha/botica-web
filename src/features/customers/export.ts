import type { CustomerSummary, Pharmacy, Product } from "@/lib/api/types";
import { refillMessage, type RefillRow } from "@/lib/domain/customers";
import { downloadXlsx, fileStamp, sheet } from "@/lib/excel/xlsx";

const STATUS: Record<RefillRow["status"], string> = { atrasado: "Atrasado", hoy: "Hoy", pronto: "Pronto", al_dia: "Al día", sin_compra: "Sin compra" };
const localDay = (ms: number | string | null) => {
  if (ms === null) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function exportCustomers({ customers, refills, products, pharmacy }: { customers: CustomerSummary[]; refills: RefillRow[]; products: Product[]; pharmacy: Pharmacy | undefined }) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const subtitle = `${pharmacy?.name ?? "Botica"} · Generado el ${new Date().toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })} · Uso interno: contiene datos personales`;
  downloadXlsx(
    `clientes-${fileStamp()}.xlsx`,
    [
      sheet({
        name: "Recompras",
        title: "Recordatorios de recompra",
        subtitle,
        rows: refills,
        columns: [
          { header: "Estado", value: (r) => STATUS[r.status], width: 11 },
          { header: "Días", value: (r) => r.due, type: "int", width: 7 },
          { header: "Cliente", value: (r) => r.customer.name, width: 28 },
          { header: "Celular", value: (r) => r.customer.phone, width: 13 },
          { header: "Acepta avisos", value: (r) => (r.customer.contactConsent ? "Sí" : "No"), width: 10 },
          { header: "Medicamento", value: (r) => `${r.product.name} ${r.product.conc}`, width: 30 },
          { header: "Ciclo (días)", value: (r) => r.treatment.everyDays, type: "int", width: 9 },
          { header: "Última compra", value: (r) => localDay(r.lastPurchaseAt), type: "date", width: 13 },
          { header: "Le toca", value: (r) => localDay(r.nextAt), type: "date", width: 13 },
          { header: "Último aviso", value: (r) => localDay(r.lastContactAt), type: "date", width: 13 },
          { header: "Mensaje sugerido", value: (r) => (r.customer.contactConsent ? refillMessage(r, pharmacy?.name ?? "la botica") : ""), width: 70 },
        ],
      }),
      sheet({
        name: "Clientes",
        title: "Cartera de clientes",
        subtitle,
        rows: [...customers].sort((a, b) => b.totalSpent - a.totalSpent),
        columns: [
          { header: "Cliente", value: (c) => c.name, width: 30 },
          { header: "DNI", value: (c) => c.dni, width: 11 },
          { header: "RUC", value: (c) => c.ruc, width: 13 },
          { header: "Celular", value: (c) => c.phone, width: 13 },
          { header: "Acepta avisos", value: (c) => (c.contactConsent ? "Sí" : "No"), width: 10 },
          { header: "Compras", value: (c) => c.purchases, type: "int", width: 9 },
          { header: "Total comprado", value: (c) => c.totalSpent, type: "money", width: 14 },
          { header: "Última compra", value: (c) => localDay(c.lastPurchaseAt), type: "date", width: 13 },
          { header: "Puntos", value: (c) => c.points, type: "int", width: 8 },
          { header: "Tratamientos", value: (c) => c.treatments.map((t) => byId.get(t.productId)?.name ?? t.productId).join(", "), width: 30 },
          { header: "Notas", value: (c) => c.notes, width: 30 },
        ],
        totals: { "Total comprado": Math.round(customers.reduce((s, c) => s + c.totalSpent, 0) * 100) / 100 },
      }),
    ],
    { brand: pharmacy?.brand, author: pharmacy?.name },
  );
}
