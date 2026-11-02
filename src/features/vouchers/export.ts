import type { Branch, Pharmacy } from "@/lib/api/types";
import { round2 } from "@/lib/domain/pharmacy";
import { KIND_LABEL, STATUS_LABEL, type VoucherRow } from "@/lib/domain/vouchers";
import { downloadXlsx, fileStamp, sheet } from "@/lib/excel/xlsx";

const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Una fila por comprobante o nota. Las notas de crédito van con el importe en negativo, para que el total del periodo cuadre. */
export function exportVouchers({ rows, branches, scopeLabel, from, to, pharmacy }: { rows: VoucherRow[]; branches: Branch[]; scopeLabel: string; from: string; to: string; pharmacy: Pharmacy | undefined }) {
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const sorted = [...rows].sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
  /* Solo lo que SUNAT aceptó cuenta en el total; lo anulado, rechazado o pendiente queda fuera */
  const signed = (r: VoucherRow) => (r.kind === "nota_credito" ? -r.total : r.total);
  const counted = sorted.filter((r) => r.status === "aceptado");
  downloadXlsx(
    `comprobantes-${fileStamp()}.xlsx`,
    [
      sheet({
        name: "Comprobantes",
        title: `Comprobantes electrónicos · del ${from} al ${to}`,
        subtitle: `${pharmacy?.name ?? "Botica"} · ${scopeLabel} · El total suma solo lo aceptado por SUNAT y las notas de crédito restan · Generado el ${new Date().toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}`,
        rows: sorted,
        columns: [
          { header: "Fecha", value: (r) => localDay(r.issuedAt), type: "date", width: 12 },
          { header: "Tipo", value: (r) => KIND_LABEL[r.kind], width: 15 },
          { header: "N.º", value: (r) => r.number, width: 14 },
          { header: "Modifica a", value: (r) => r.refNumber ?? "", width: 14 },
          { header: "Local", value: (r) => branchName(r.branchId), width: 13 },
          { header: "Cliente", value: (r) => r.customerName || "Cliente varios", width: 28 },
          { header: "Documento", value: (r) => r.customerDocId, width: 13 },
          { header: "Importe", value: (r) => signed(r), type: "money", width: 12 },
          { header: "Estado", value: (r) => STATUS_LABEL[r.status], width: 11 },
          { header: "Código SUNAT", value: (r) => r.sunat?.code ?? "", width: 12 },
          { header: "Respuesta de SUNAT", value: (r) => r.sunat?.message ?? "", width: 46 },
          { header: "Envíos", value: (r) => r.attempts, type: "int", width: 8 },
          { header: "Anulado por", value: (r) => r.voucher?.voided?.by ?? "", width: 18 },
          { header: "Motivo", value: (r) => r.voucher?.voided?.reason ?? (r.note ? `${r.note.reasonLabel}: ${r.note.note}` : ""), width: 36 },
        ],
        totals: { Importe: round2(counted.reduce((s, r) => s + signed(r), 0)) },
      }),
    ],
    { brand: pharmacy?.brand, author: pharmacy?.name },
  );
}
