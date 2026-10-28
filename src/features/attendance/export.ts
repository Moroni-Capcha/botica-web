import type { Branch, Pharmacy } from "@/lib/api/types";
import { DOW, MARK_LABEL, STATUS_LABEL, type DaySummary, type WorkerPeriod } from "@/lib/domain/attendance";
import { round2 } from "@/lib/domain/pharmacy";
import { downloadXlsx, fileStamp, sheet } from "@/lib/excel/xlsx";

const t = (iso: string | undefined) => (iso ? new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "");
const localDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Resumen por trabajador y detalle diario del periodo. Sirve para la planilla. */
export function exportAttendance({ summary, rows, branches, days, tolerance, pharmacy }: { summary: WorkerPeriod[]; rows: DaySummary[]; branches: Branch[]; days: number; tolerance: number; pharmacy: Pharmacy | undefined }) {
  const name = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const subtitle = `${pharmacy?.name ?? "Botica"} · Últimos ${days} días · Tardanza: más de ${tolerance} min · Generado el ${new Date().toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}`;
  const detail = [...rows].sort((a, b) => a.day - b.day || a.worker.name.localeCompare(b.worker.name));
  downloadXlsx(
    `asistencia-${days}-dias-${fileStamp()}.xlsx`,
    [
      sheet({
        name: "Resumen",
        title: `Resumen de asistencia · últimos ${days} días`,
        subtitle,
        rows: summary,
        columns: [
          { header: "Trabajador", value: (x) => x.worker.name, width: 22 },
          { header: "Cargo", value: (x) => x.worker.role, width: 20 },
          { header: "Local", value: (x) => name(x.worker.branchId), width: 12 },
          { header: "Horario", value: (x) => `${x.worker.schedule.start} a ${x.worker.schedule.end}`, width: 13 },
          { header: "Días programados", value: (x) => x.scheduledDays, type: "int", width: 11 },
          { header: "Días asistidos", value: (x) => x.attended, type: "int", width: 10 },
          { header: "Faltas", value: (x) => x.absences, type: "int", width: 8 },
          { header: "Tardanzas", value: (x) => x.lates, type: "int", width: 10 },
          { header: "Minutos de tardanza", value: (x) => x.lateMinutes, type: "int", width: 12 },
          { header: "Horas trabajadas", value: (x) => round2(x.worked / 60), type: "num", width: 11 },
          { header: "Horas extra", value: (x) => round2(x.overtime / 60), type: "num", width: 10 },
          { header: "Sin marca de salida", value: (x) => x.missingExit, type: "int", width: 11 },
          { header: "Puntualidad", value: (x) => x.punctuality / 100, type: "pct", width: 11 },
        ],
        totals: {
          Faltas: summary.reduce((s, x) => s + x.absences, 0),
          Tardanzas: summary.reduce((s, x) => s + x.lates, 0),
          "Horas trabajadas": round2(summary.reduce((s, x) => s + x.worked, 0) / 60),
          "Horas extra": round2(summary.reduce((s, x) => s + x.overtime, 0) / 60),
        },
      }),
      sheet({
        name: "Detalle diario",
        title: `Marcaciones · últimos ${days} días`,
        subtitle,
        rows: detail,
        columns: [
          { header: "Fecha", value: (r) => localDay(r.day), type: "date", width: 12 },
          { header: "Día", value: (r) => DOW[new Date(r.day).getDay()], width: 6 },
          { header: "Trabajador", value: (r) => r.worker.name, width: 22 },
          { header: "Local", value: (r) => name(r.worker.branchId), width: 12 },
          { header: "Horario", value: (r) => (r.scheduled ? `${r.worker.schedule.start} a ${r.worker.schedule.end}` : "Descanso"), width: 13 },
          { header: "Entrada", value: (r) => t(r.entrada?.at), width: 10 },
          { header: "Inicio refrigerio", value: (r) => t(r.refIni?.at), width: 11 },
          { header: "Fin refrigerio", value: (r) => t(r.refFin?.at), width: 11 },
          { header: "Salida", value: (r) => t(r.salida?.at), width: 10 },
          { header: "Horas trabajadas", value: (r) => round2(r.worked / 60), type: "num", width: 11 },
          { header: "Tardanza (min)", value: (r) => r.late || null, type: "int", width: 10 },
          { header: "Horas extra", value: (r) => (r.overtime ? round2(r.overtime / 60) : null), type: "num", width: 10 },
          { header: "Estado", value: (r) => STATUS_LABEL[r.status], width: 17 },
          { header: "Marcas manuales", value: (r) => r.marks.filter((m) => m.manual).map((m) => `${MARK_LABEL[m.type]}: ${m.note} (${m.registeredBy ?? ""})`).join("; "), width: 42 },
        ],
      }),
    ],
    { brand: pharmacy?.brand, author: pharmacy?.name },
  );
}
