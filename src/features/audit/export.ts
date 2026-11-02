import { api } from "@/lib/api";
import type { AuditEntry, AuditQuery, Branch, Pharmacy } from "@/lib/api/types";
import { actionLabel, actorRole, changeSummary, entityLabelOf } from "@/lib/domain/audit";
import { MAX_PAGE_SIZE } from "@/lib/domain/pagination";
import { timeShort } from "@/lib/format";
import { downloadXlsx, fileStamp, sheet } from "@/lib/excel/xlsx";

/** Tope de filas de un Excel: pasado esto se pide acotar el periodo o los filtros. */
export const AUDIT_EXPORT_CAP = 5000;

/** Pide todas las páginas que cumplen los filtros (hasta el tope), de 100 en 100. */
export async function collectAudit(query: Omit<AuditQuery, "page" | "pageSize">, cap = AUDIT_EXPORT_CAP): Promise<{ entries: AuditEntry[]; total: number; truncated: boolean }> {
  const entries: AuditEntry[] = [];
  let total = 0;
  for (let page = 1; entries.length < cap; page++) {
    const res = await api.listAudit({ ...query, page, pageSize: MAX_PAGE_SIZE });
    total = res.total;
    entries.push(...res.items);
    if (res.items.length === 0 || entries.length >= res.total) break;
  }
  return { entries: entries.slice(0, cap), total, truncated: total > cap };
}

const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Una fila por entrada, de la más antigua a la más reciente. El detalle es el mismo texto "antes → después" de la pantalla. */
export function exportAudit({ entries, branches, from, to, filtersLabel, truncated, pharmacy }: { entries: AuditEntry[]; branches: Branch[]; from: string; to: string; filtersLabel: string; truncated: boolean; pharmacy: Pharmacy | undefined }) {
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const sorted = [...entries].sort((a, b) => a.at.localeCompare(b.at));
  downloadXlsx(
    `auditoria-${fileStamp()}.xlsx`,
    [
      sheet({
        name: "Auditoría",
        title: `Auditoría · del ${from} al ${to}`,
        subtitle: `${pharmacy?.name ?? "Botica"} · ${filtersLabel}${truncated ? ` · Solo las ${entries.length.toLocaleString("es-PE")} más recientes: acota el periodo para ver el resto` : ""} · Generado el ${new Date().toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}`,
        rows: sorted,
        columns: [
          { header: "Fecha", value: (e) => localDay(e.at), type: "date", width: 12 },
          { header: "Hora", value: (e) => timeShort(e.at), width: 8 },
          { header: "Persona", value: (e) => e.userName, width: 24 },
          { header: "Rol", value: (e) => actorRole(e), width: 14 },
          { header: "Local", value: (e) => (e.branchId ? branchName(e.branchId) : ""), width: 14 },
          { header: "Acción", value: (e) => actionLabel(e.action), width: 30 },
          { header: "Sobre", value: (e) => entityLabelOf(e.entity), width: 14 },
          { header: "Elemento", value: (e) => e.entityLabel, width: 28 },
          { header: "Detalle", value: (e) => changeSummary(e.before, e.after, { branchName }), width: 70 },
        ],
      }),
    ],
    { brand: pharmacy?.brand, author: pharmacy?.name },
  );
}
