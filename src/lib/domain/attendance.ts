/**
 * Asistencia del personal: estado del día, tardanza, horas trabajadas y extra (reglas puras, se prueban con Vitest).
 * Los días se toman en la hora local del equipo (Perú no cambia de horario en el año).
 */
import type { AttendanceMark, AttendanceSettings, MarkType, Worker, WorkSchedule } from "@/lib/api/types";
import { startOfDay } from "./pharmacy";

const MIN = 60_000;
const DAY = 86_400_000;

export const DEFAULT_ATTENDANCE: AttendanceSettings = { toleranceMinutes: 10, breakMinutes: 60, overtimeAfterMinutes: 15 };

/** "08:30" → 510 */
export const hm = (s: string): number => {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** 135 → "2:15" */
export const fmtHours = (minutes: number) => {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

export const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export const MARK_LABEL: Record<MarkType, string> = { entrada: "Entrada", ref_ini: "Inicio de refrigerio", ref_fin: "Fin de refrigerio", salida: "Salida" };

export const isValidTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Horario válido: horas bien escritas, salida después de la entrada (no cruza medianoche) y al menos un día. */
export function scheduleError(s: WorkSchedule): string | null {
  if (!isValidTime(s.start) || !isValidTime(s.end)) return "Escribe las horas como 08:00";
  if (hm(s.end) <= hm(s.start)) return "La salida debe ser después de la entrada";
  if (!s.days.length) return "Elige al menos un día";
  return null;
}

/**
 * Qué marca toca ahora según las marcas del día: entrada → (refrigerio) → salida.
 * El refrigerio es opcional y una sola vez por turno. Después de la salida se puede volver a entrar (turno partido).
 */
export function allowedMarks(today: { type: MarkType }[]): MarkType[] {
  const last = today[today.length - 1]?.type;
  if (!last || last === "salida") return ["entrada"];
  if (last === "ref_ini") return ["ref_fin"];
  const sinceEntry = today.slice(today.map((m) => m.type).lastIndexOf("entrada"));
  return sinceEntry.some((m) => m.type === "ref_ini") ? ["salida"] : ["ref_ini", "salida"];
}

export type DayStatus = "en_turno" | "refrigerio" | "salio" | "pendiente" | "no_llega" | "falta" | "sin_salida" | "descanso";

export const STATUS_LABEL: Record<DayStatus, string> = {
  en_turno: "En turno",
  refrigerio: "En refrigerio",
  salio: "Salió",
  pendiente: "Aún no entra",
  no_llega: "No ha marcado",
  falta: "Falta",
  sin_salida: "Sin marca de salida",
  descanso: "Descanso",
};

export interface DaySummary {
  worker: Worker;
  day: number; // inicio del día
  marks: AttendanceMark[];
  scheduled: boolean;
  scheduleStart: number;
  scheduleEnd: number;
  /** Minutos programados descontando el refrigerio. */
  scheduledMinutes: number;
  entrada: AttendanceMark | undefined;
  salida: AttendanceMark | undefined;
  refIni: AttendanceMark | undefined;
  refFin: AttendanceMark | undefined;
  status: DayStatus;
  /** Minutos de tardanza (0 si llegó dentro de la tolerancia). */
  late: number;
  breakMinutes: number;
  worked: number;
  overtime: number;
  manual: boolean;
  isToday: boolean;
}

/** Resumen de un trabajador en un día. `marks` puede traer marcas de otros días o trabajadores: se filtran. */
export function daySummary(worker: Worker, day: number, marks: AttendanceMark[], now: number, settings: AttendanceSettings = DEFAULT_ATTENDANCE): DaySummary {
  const dayStart = startOfDay(day);
  const own = marks
    .filter((m) => m.workerId === worker.id)
    .map((m) => ({ m, t: new Date(m.at).getTime() }))
    .filter(({ t }) => t >= dayStart && t < dayStart + DAY)
    .sort((a, b) => a.t - b.t);
  const list = own.map((x) => x.m);
  const time = (m: AttendanceMark | undefined) => (m ? new Date(m.at).getTime() : 0);
  const scheduled = worker.schedule.days.includes(new Date(dayStart).getDay());
  const scheduleStart = dayStart + hm(worker.schedule.start) * MIN;
  const scheduleEnd = dayStart + hm(worker.schedule.end) * MIN;
  const scheduledMinutes = Math.max(0, (scheduleEnd - scheduleStart) / MIN - settings.breakMinutes);
  const entrada = list.find((m) => m.type === "entrada");
  const salida = [...list].reverse().find((m) => m.type === "salida");
  const refIni = list.find((m) => m.type === "ref_ini");
  const refFin = list.find((m) => m.type === "ref_fin");
  const isToday = dayStart === startOfDay(now);
  const last = list[list.length - 1];

  let status: DayStatus;
  if (!entrada) {
    if (!scheduled) status = "descanso";
    else if (isToday && now < scheduleStart + settings.toleranceMinutes * MIN) status = "pendiente";
    else if (isToday && now < scheduleEnd) status = "no_llega";
    else status = "falta";
  } else if (last?.type === "salida") status = "salio";
  else if (isToday) status = last?.type === "ref_ini" ? "refrigerio" : "en_turno";
  else status = "sin_salida";

  const lateRaw = entrada && scheduled ? (time(entrada) - scheduleStart) / MIN : 0;
  const late = lateRaw > settings.toleranceMinutes ? Math.round(lateRaw) : 0;

  /* Horas trabajadas: suma de tramos entrada→salida, menos refrigerios */
  let worked = 0;
  let openAt: number | null = null;
  let breakAt: number | null = null;
  let breakMinutes = 0;
  for (const { m, t } of own) {
    if (m.type === "entrada") openAt = t;
    else if (m.type === "ref_ini") breakAt = t;
    else if (m.type === "ref_fin" && breakAt !== null) {
      breakMinutes += (t - breakAt) / MIN;
      breakAt = null;
    } else if (m.type === "salida" && openAt !== null) {
      worked += (t - openAt) / MIN;
      openAt = null;
    }
  }
  if (isToday && openAt !== null) worked += (now - openAt) / MIN;
  if (isToday && breakAt !== null) breakMinutes += (now - breakAt) / MIN;
  /* Si no marcó refrigerio en una jornada de más de 5 horas, se descuenta el refrigerio del horario (no es tiempo de trabajo) */
  const tookBreak = own.some(({ m }) => m.type === "ref_ini");
  if (!tookBreak && worked > 300) breakMinutes = settings.breakMinutes;
  worked = Math.max(0, worked - breakMinutes);

  const extra = worked - scheduledMinutes;
  const overtime = salida && last?.type === "salida" && extra > settings.overtimeAfterMinutes ? Math.round(extra) : 0;
  return {
    worker, day: dayStart, marks: list, scheduled, scheduleStart, scheduleEnd, scheduledMinutes, entrada, salida, refIni, refFin, status, late,
    breakMinutes: Math.round(breakMinutes), worked: Math.round(worked), overtime, manual: list.some((m) => m.manual), isToday,
  };
}

/** Días hacia atrás desde hoy (incluido) con su resumen. Omite descansos y "aún no entra". */
export function historyRows(workers: Worker[], marks: AttendanceMark[], days: number, now: number, settings?: AttendanceSettings): DaySummary[] {
  const today = startOfDay(now);
  const out: DaySummary[] = [];
  for (let d = 0; d < days; d++) {
    /* Mediodía para no caer en otro día por un cambio de hora */
    const day = startOfDay(today - d * DAY + 12 * 3600_000);
    for (const w of workers) {
      const s = daySummary(w, day, marks, now, settings);
      if (s.status === "descanso" || s.status === "pendiente") continue;
      out.push(s);
    }
  }
  return out;
}

export interface WorkerPeriod {
  worker: Worker;
  scheduledDays: number;
  attended: number;
  absences: number;
  lates: number;
  lateMinutes: number;
  worked: number;
  overtime: number;
  missingExit: number;
  /** Porcentaje de días con asistencia en que llegó a tiempo. */
  punctuality: number;
}

/** Totales por trabajador. El día de hoy solo cuenta si ya cerró el turno. */
export function periodSummary(workers: Worker[], rows: DaySummary[]): WorkerPeriod[] {
  return workers.map((worker) => {
    const own = rows.filter((r) => r.worker.id === worker.id && !(r.isToday && r.status !== "salio" && r.status !== "falta"));
    const attended = own.filter((r) => r.entrada).length;
    const lates = own.filter((r) => r.late > 0);
    return {
      worker,
      scheduledDays: own.filter((r) => r.scheduled).length,
      attended,
      absences: own.filter((r) => r.status === "falta").length,
      lates: lates.length,
      lateMinutes: lates.reduce((s, r) => s + r.late, 0),
      worked: own.reduce((s, r) => s + r.worked, 0),
      overtime: own.reduce((s, r) => s + r.overtime, 0),
      missingExit: own.filter((r) => r.status === "sin_salida").length,
      punctuality: attended ? Math.round(((attended - lates.length) / attended) * 100) : 0,
    };
  });
}
