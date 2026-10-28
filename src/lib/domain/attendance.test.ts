import { describe, expect, it } from "vitest";
import type { AttendanceMark, MarkType, Worker } from "@/lib/api/types";
import { allowedMarks, daySummary, fmtHours, historyRows, periodSummary, scheduleError } from "./attendance";

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const NOW = new Date(2026, 9, 27, 13, 0).getTime(); // martes 27/10/2026, 1:00 p. m.

const ana: Worker = { id: "w1", name: "Ana", role: "Técnica", branchId: "principal", schedule: { start: "08:00", end: "16:00", days: [1, 2, 3, 4, 5, 6] }, active: true };
let id = 0;
const mark = (d: number, h: number, m: number, type: MarkType, workerId = "w1"): AttendanceMark => ({ id: ++id, workerId, branchId: "principal", at: at(d, h, m), type, manual: false, note: "", registeredBy: null });

describe("marcación", () => {
  it("sigue el orden entrada, refrigerio y salida", () => {
    expect(allowedMarks([])).toEqual(["entrada"]);
    expect(allowedMarks([{ type: "entrada" }])).toEqual(["ref_ini", "salida"]);
    expect(allowedMarks([{ type: "entrada" }, { type: "ref_ini" }])).toEqual(["ref_fin"]);
    expect(allowedMarks([{ type: "entrada" }, { type: "ref_ini" }, { type: "ref_fin" }])).toEqual(["salida"]);
    expect(allowedMarks([{ type: "entrada" }, { type: "salida" }])).toEqual(["entrada"]);
  });

  it("valida el horario", () => {
    expect(scheduleError({ start: "08:00", end: "16:00", days: [1] })).toBeNull();
    expect(scheduleError({ start: "16:00", end: "08:00", days: [1] })).toBeTruthy();
    expect(scheduleError({ start: "8:00", end: "16:00", days: [1] })).toBeTruthy();
    expect(scheduleError({ start: "08:00", end: "16:00", days: [] })).toBeTruthy();
  });
});

describe("resumen del día", () => {
  it("calcula tardanza, refrigerio, horas y extra de un día cerrado", () => {
    // Lunes 26: entra 8:17, refrigerio 12:00–12:50, sale 17:00
    const marks = [mark(26, 8, 17, "entrada"), mark(26, 12, 0, "ref_ini"), mark(26, 12, 50, "ref_fin"), mark(26, 17, 0, "salida")];
    const s = daySummary(ana, new Date(2026, 9, 26).getTime(), marks, NOW);
    expect(s.status).toBe("salio");
    expect(s.late).toBe(17);
    expect(s.breakMinutes).toBe(50);
    expect(s.worked).toBe(473); // 8:43 − 0:50
    expect(s.scheduledMinutes).toBe(420); // 8 h − 1 h
    expect(s.overtime).toBe(53);
    expect(fmtHours(s.worked)).toBe("7:53");
  });

  it("no cuenta tardanza dentro de la tolerancia y descuenta el refrigerio no marcado", () => {
    const s = daySummary(ana, new Date(2026, 9, 26).getTime(), [mark(26, 8, 9, "entrada"), mark(26, 16, 0, "salida")], NOW);
    expect(s.late).toBe(0);
    expect(s.breakMinutes).toBe(60);
    expect(s.worked).toBe(411);
    expect(s.overtime).toBe(0);
  });

  it("hoy: en turno, en refrigerio o sin marcar según la hora", () => {
    const today = new Date(2026, 9, 27).getTime();
    expect(daySummary(ana, today, [mark(27, 7, 55, "entrada")], NOW).status).toBe("en_turno");
    expect(daySummary(ana, today, [mark(27, 7, 55, "entrada"), mark(27, 12, 40, "ref_ini")], NOW).status).toBe("refrigerio");
    expect(daySummary(ana, today, [], NOW).status).toBe("no_llega");
    expect(daySummary(ana, today, [], new Date(2026, 9, 27, 8, 5).getTime()).status).toBe("pendiente");
    expect(daySummary(ana, today, [mark(27, 8, 0, "entrada")], NOW).worked).toBe(300);
  });

  it("días pasados: falta, sin salida o descanso", () => {
    expect(daySummary(ana, new Date(2026, 9, 26).getTime(), [], NOW).status).toBe("falta");
    expect(daySummary(ana, new Date(2026, 9, 24).getTime(), [mark(24, 8, 0, "entrada")], NOW).status).toBe("sin_salida");
    expect(daySummary(ana, new Date(2026, 9, 25).getTime(), [], NOW).status).toBe("descanso"); // domingo
  });
});

describe("periodo", () => {
  it("suma asistencias, faltas, tardanzas y puntualidad", () => {
    const marks = [
      mark(26, 8, 30, "entrada"), mark(26, 16, 0, "salida"), // lunes: tarde
      mark(24, 7, 58, "entrada"), mark(24, 16, 5, "salida"), // sábado: a tiempo
      // viernes 23: falta
      mark(27, 7, 59, "entrada"), // hoy en turno: no cuenta todavía
    ];
    const rows = historyRows([ana], marks, 5, NOW);
    expect(rows.map((r) => r.status)).toEqual(["en_turno", "salio", "salio", "falta"]);
    const [p] = periodSummary([ana], rows);
    expect(p).toMatchObject({ scheduledDays: 3, attended: 2, absences: 1, lates: 1, lateMinutes: 30, punctuality: 50 });
  });
});
