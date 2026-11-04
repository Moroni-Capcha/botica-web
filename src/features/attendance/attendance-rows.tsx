"use client";

import { memo } from "react";
import { AlarmClock, CircleCheck, CircleDashed, Coffee, LogOut, Moon, Pencil, TriangleAlert, UserCheck, UserX, type LucideIcon } from "lucide-react";
import type { Worker } from "@/lib/api/types";
import { DOW, fmtHours, STATUS_LABEL, type DayStatus, type DaySummary, type WorkerPeriod } from "@/lib/domain/attendance";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { IconButton } from "@/components/ui/icon-button";
import { td } from "@/components/ui/table";
import type { Tone } from "@/components/ui/tone";
import { cn } from "@/lib/cn";
import { dateShort, timeShort } from "@/lib/format";

/** Estado del día: tono + icono + texto (el color nunca va solo). */
const STATUS_UI: Record<DayStatus, { tone: Tone; solid?: boolean; icon: LucideIcon }> = {
  en_turno: { tone: "success", icon: UserCheck },
  refrigerio: { tone: "warning", icon: Coffee },
  salio: { tone: "neutral", icon: LogOut },
  pendiente: { tone: "neutral", icon: CircleDashed },
  no_llega: { tone: "danger", icon: AlarmClock },
  falta: { tone: "danger", solid: true, icon: UserX },
  sin_salida: { tone: "special", icon: TriangleAlert },
  descanso: { tone: "neutral", icon: Moon },
};

export function StatusChip({ status }: { status: DayStatus }) {
  const ui = STATUS_UI[status];
  const Icon = ui.icon;
  return (
    <Chip tone={ui.tone} solid={ui.solid}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden /> {STATUS_LABEL[status]}
    </Chip>
  );
}

/** Puntualidad de la entrada: tardanza con icono y minutos, o "A tiempo". */
function LateChip({ late }: { late: number }) {
  return late ? (
    <Chip tone="danger">
      <AlarmClock className="h-3 w-3 shrink-0" aria-hidden /> +{late} min
    </Chip>
  ) : (
    <Chip tone="success">
      <CircleCheck className="h-3 w-3 shrink-0" aria-hidden /> A tiempo
    </Chip>
  );
}

/** Marca hecha a mano: icono y texto, con el motivo y quién la registró en el título. */
export function ManualChip({ title }: { title?: string }) {
  return (
    <Chip tone="special" title={title}>
      <Pencil className="h-3 w-3 shrink-0" aria-hidden /> manual
    </Chip>
  );
}

/** Línea del día: horario programado, tiempo trabajado, refrigerio, tardanza y la hora actual. */
export function DayTimeline({ s, now }: { s: DaySummary; now: number }) {
  const from = s.day + 7 * 3600_000;
  const to = s.day + 23 * 3600_000;
  const pos = (t: number) => `${Math.min(100, Math.max(0, ((t - from) / (to - from)) * 100))}%`;
  const width = (a: number, b: number) => `${Math.max(0, ((Math.min(b, to) - Math.max(a, from)) / (to - from)) * 100)}%`;
  const t = (iso?: string) => (iso ? new Date(iso).getTime() : 0);
  const entry = t(s.entrada?.at);
  const end = s.status === "salio" ? t(s.salida?.at) : s.isToday && s.entrada ? Math.min(now, to) : 0;
  const label = `${s.worker.name}: ${STATUS_LABEL[s.status]}${s.entrada ? `, entró ${timeShort(s.entrada.at)}` : ""}${s.salida && s.status === "salio" ? `, salió ${timeShort(s.salida.at)}` : ""}${s.late > 0 ? `, tardanza de ${s.late} min` : ""}`;
  return (
    <div className="relative h-6 w-full min-w-[220px] rounded-md bg-sunken" role="img" aria-label={label}>
      {[9, 12, 15, 18, 21].map((h) => (
        <span key={h} className="absolute top-0 h-full w-px bg-line" style={{ left: pos(s.day + h * 3600_000) }} />
      ))}
      {s.scheduled && <span className="absolute top-1 h-4 rounded border border-dashed border-muted" style={{ left: pos(s.scheduleStart), width: width(s.scheduleStart, s.scheduleEnd) }} />}
      {entry > 0 && end > 0 && <span className={cn("absolute top-1.5 h-3 rounded-sm bg-brand", s.status === "salio" ? "opacity-85" : "opacity-60")} style={{ left: pos(entry), width: width(entry, end) }} />}
      {s.refIni && <span className="absolute top-1.5 h-3 bg-warning" style={{ left: pos(t(s.refIni.at)), width: width(t(s.refIni.at), s.refFin ? t(s.refFin.at) : now) }} />}
      {s.late > 0 && entry > 0 && <span className="absolute top-1.5 h-3 rounded-l-sm bg-danger" style={{ left: pos(s.scheduleStart), width: width(s.scheduleStart, entry) }} />}
      {s.isToday && <span className="absolute -top-0.5 h-7 w-0.5 bg-fg" style={{ left: pos(now) }} />}
    </div>
  );
}

/** Leyenda de la línea del día: cada color lleva su nombre. */
export function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-block h-2.5 w-4 rounded-sm", className)} aria-hidden />
      {label}
    </span>
  );
}

const refText = (s: DaySummary, dash: string) => (s.refIni ? `${timeShort(s.refIni.at)} – ${s.refFin ? timeShort(s.refFin.at) : dash}` : "—");

interface WorkerLabels {
  multi: boolean;
  branchName: (id: string) => string;
}

/** Fila de "Personal de hoy". */
export const TodayRow = memo(function TodayRow({ s, now, multi, branchName }: WorkerLabels & { s: DaySummary; now: number }) {
  return (
    <tr className={s.status === "descanso" ? "opacity-60" : undefined}>
      <td className={td}>
        <p className="font-medium text-fg">{s.worker.name}</p>
        <p className="text-caption text-muted">
          {multi && <span className="mr-1.5 rounded bg-brand/10 px-1.5 py-px text-micro font-semibold text-brand">{branchName(s.worker.branchId)}</span>}
          {s.worker.role}
        </p>
      </td>
      <td className={cn(td, "whitespace-nowrap text-caption tabular-nums text-fg-2")}>{s.scheduled ? `${s.worker.schedule.start} – ${s.worker.schedule.end}` : "Descanso"}</td>
      <td className={cn(td, "whitespace-nowrap")}>
        {s.entrada ? (
          <div className="grid justify-items-start gap-0.5">
            <span className="font-semibold tabular-nums">
              {timeShort(s.entrada.at)}
              {s.entrada.manual && <Pencil className="ml-1 inline h-3 w-3 text-special-fg" role="img" aria-label="Marca manual" />}
            </span>
            <LateChip late={s.late} />
          </div>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className={cn(td, "whitespace-nowrap text-caption tabular-nums text-fg-2")}>{refText(s, "…")}</td>
      <td className={cn(td, "whitespace-nowrap font-semibold tabular-nums")}>{s.salida && s.status === "salio" ? timeShort(s.salida.at) : <span className="font-normal text-muted">—</span>}</td>
      <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{s.worked ? fmtHours(s.worked) : "—"}</td>
      <td className={td}>
        <StatusChip status={s.status} />
      </td>
      <td className={td}>
        <DayTimeline s={s} now={now} />
      </td>
    </tr>
  );
});

/** Tarjeta de "Personal de hoy" para pantallas angostas: mismos datos que la fila, sin desplazamiento horizontal. */
export const TodayCard = memo(function TodayCard({ s, now, multi, branchName }: WorkerLabels & { s: DaySummary; now: number }) {
  return (
    <li>
      <Card padding="sm" className={s.status === "descanso" ? "opacity-60" : undefined}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-fg">{s.worker.name}</p>
            <p className="text-caption text-muted">
              {multi && `${branchName(s.worker.branchId)} · `}
              {s.worker.role} · {s.scheduled ? `${s.worker.schedule.start} – ${s.worker.schedule.end}` : "Descanso"}
            </p>
          </div>
          <StatusChip status={s.status} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line-soft pt-2 text-caption text-muted">
          <div>
            <dt>Entrada</dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 text-small font-semibold tabular-nums text-fg">
              {s.entrada ? timeShort(s.entrada.at) : "—"}
              {s.entrada?.manual && <ManualChip title={`${s.entrada.note} · ${s.entrada.registeredBy ?? ""}`} />}
              {s.entrada && <LateChip late={s.late} />}
            </dd>
          </div>
          <div>
            <dt>Salida</dt>
            <dd className="mt-0.5 text-small font-semibold tabular-nums text-fg">{s.salida && s.status === "salio" ? timeShort(s.salida.at) : "—"}</dd>
          </div>
          <div>
            <dt>Refrigerio</dt>
            <dd className="mt-0.5 text-small tabular-nums text-fg-2">{refText(s, "…")}</dd>
          </div>
          <div>
            <dt>Horas</dt>
            <dd className="mt-0.5 text-small font-semibold tabular-nums text-fg">{s.worked ? fmtHours(s.worked) : "—"}</dd>
          </div>
        </dl>
        <div className="mt-3">
          <DayTimeline s={s} now={now} />
        </div>
      </Card>
    </li>
  );
});

const dayText = (s: DaySummary) => `${DOW[new Date(s.day).getDay()]} ${dateShort(s.day)}`;

/** Fila del historial. */
export const HistoryRow = memo(function HistoryRow({ s, multi, branchName, onFix }: WorkerLabels & { s: DaySummary; onFix: (workerId: string) => void }) {
  return (
    <tr>
      <td className={cn(td, "whitespace-nowrap text-caption tabular-nums text-fg-2")}>{dayText(s)}</td>
      <td className={td}>
        <p className="font-medium text-fg">{s.worker.name}</p>
        <p className="text-caption text-muted">
          {multi && `${branchName(s.worker.branchId)} · `}
          {s.worker.schedule.start} – {s.worker.schedule.end}
        </p>
      </td>
      <td className={cn(td, "whitespace-nowrap tabular-nums")}>
        {s.entrada ? timeShort(s.entrada.at) : "—"}
        {s.entrada?.manual && (
          <span className="ml-1">
            <ManualChip title={`${s.entrada.note} · ${s.entrada.registeredBy ?? ""}`} />
          </span>
        )}
      </td>
      <td className={cn(td, "whitespace-nowrap text-caption tabular-nums text-fg-2")}>{refText(s, "—")}</td>
      <td className={cn(td, "whitespace-nowrap tabular-nums")}>
        {s.salida ? timeShort(s.salida.at) : "—"}
        {s.salida?.manual && (
          <span className="ml-1">
            <ManualChip title={`${s.salida.note} · ${s.salida.registeredBy ?? ""}`} />
          </span>
        )}
      </td>
      <td className={cn(td, "text-right tabular-nums")}>{s.worked ? fmtHours(s.worked) : "—"}</td>
      <td className={cn(td, "text-right tabular-nums", s.late ? "font-semibold text-danger-fg" : "text-muted")}>{s.late ? `${s.late} min` : "—"}</td>
      <td className={cn(td, "text-right tabular-nums", s.overtime ? "font-semibold text-success-fg" : "text-muted")}>{s.overtime ? fmtHours(s.overtime) : "—"}</td>
      <td className={td}>
        <StatusChip status={s.status} />
      </td>
      <td className={cn(td, "text-right")}>
        {(s.status === "sin_salida" || s.status === "falta") && (
          <Button size="sm" variant="ghost" onClick={() => onFix(s.worker.id)}>
            Corregir
          </Button>
        )}
      </td>
    </tr>
  );
});

/** Tarjeta del historial para pantallas angostas. */
export const HistoryCard = memo(function HistoryCard({ s, multi, branchName, onFix }: WorkerLabels & { s: DaySummary; onFix: (workerId: string) => void }) {
  return (
    <li>
      <Card padding="sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-fg">{s.worker.name}</p>
            <p className="text-caption tabular-nums text-muted">
              {dayText(s)} · {multi && `${branchName(s.worker.branchId)} · `}
              {s.worker.schedule.start} – {s.worker.schedule.end}
            </p>
          </div>
          <StatusChip status={s.status} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line-soft pt-2 text-caption text-muted">
          <div>
            <dt>Entrada</dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 text-small font-semibold tabular-nums text-fg">
              {s.entrada ? timeShort(s.entrada.at) : "—"}
              {s.entrada?.manual && <ManualChip title={`${s.entrada.note} · ${s.entrada.registeredBy ?? ""}`} />}
            </dd>
          </div>
          <div>
            <dt>Salida</dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 text-small font-semibold tabular-nums text-fg">
              {s.salida ? timeShort(s.salida.at) : "—"}
              {s.salida?.manual && <ManualChip title={`${s.salida.note} · ${s.salida.registeredBy ?? ""}`} />}
            </dd>
          </div>
          <div>
            <dt>Refrigerio</dt>
            <dd className="mt-0.5 text-small tabular-nums text-fg-2">{refText(s, "—")}</dd>
          </div>
          <div>
            <dt>Horas</dt>
            <dd className="mt-0.5 text-small font-semibold tabular-nums text-fg">{s.worked ? fmtHours(s.worked) : "—"}</dd>
          </div>
          <div>
            <dt>Tardanza</dt>
            <dd className={cn("mt-0.5 text-small tabular-nums", s.late ? "font-semibold text-danger-fg" : "text-muted")}>{s.late ? `${s.late} min` : "—"}</dd>
          </div>
          <div>
            <dt>Extra</dt>
            <dd className={cn("mt-0.5 text-small tabular-nums", s.overtime ? "font-semibold text-success-fg" : "text-muted")}>{s.overtime ? fmtHours(s.overtime) : "—"}</dd>
          </div>
        </dl>
        {(s.status === "sin_salida" || s.status === "falta") && (
          <div className="mt-3">
            <Button size="sm" variant="ghost" onClick={() => onFix(s.worker.id)}>
              Corregir
            </Button>
          </div>
        )}
      </Card>
    </li>
  );
});

/** Barra de puntualidad: el porcentaje va siempre escrito al lado. */
function PunctualityMeter({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded-full bg-sunken" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label="Puntualidad">
        <div className={cn("h-full rounded-full", value >= 90 ? "bg-success" : value >= 75 ? "bg-warning" : "bg-danger")} style={{ width: `${value}%` }} />
      </div>
      <span className="text-caption font-semibold tabular-nums">{value} %</span>
    </div>
  );
}

/** Fila del resumen por trabajador. */
export const SummaryRow = memo(function SummaryRow({ x, multi, branchName }: WorkerLabels & { x: WorkerPeriod }) {
  return (
    <tr>
      <td className={td}>
        <p className="font-medium text-fg">{x.worker.name}</p>
        <p className="text-caption text-muted">
          {multi && `${branchName(x.worker.branchId)} · `}
          {x.worker.role} · {x.worker.schedule.start} – {x.worker.schedule.end}
        </p>
      </td>
      <td className={cn(td, "text-right tabular-nums")}>
        {x.attended}/{x.scheduledDays}
      </td>
      <td className={cn(td, "text-right tabular-nums", x.absences ? "font-semibold text-danger-fg" : "text-muted")}>{x.absences || "—"}</td>
      <td className={cn(td, "text-right tabular-nums", x.lates ? "font-semibold text-danger-fg" : "text-muted")}>{x.lates || "—"}</td>
      <td className={cn(td, "text-right tabular-nums")}>{x.lateMinutes || "—"}</td>
      <td className={cn(td, "text-right tabular-nums")}>{fmtHours(x.worked)}</td>
      <td className={cn(td, "text-right tabular-nums text-success-fg")}>{x.overtime ? fmtHours(x.overtime) : "—"}</td>
      <td className={cn(td, "text-right tabular-nums", x.missingExit ? "font-semibold text-special-fg" : "text-muted")}>{x.missingExit || "—"}</td>
      <td className={td}>
        <PunctualityMeter value={x.punctuality} />
      </td>
    </tr>
  );
});

/** Tarjeta del resumen por trabajador para pantallas angostas. */
export const SummaryCard = memo(function SummaryCard({ x, multi, branchName }: WorkerLabels & { x: WorkerPeriod }) {
  return (
    <li>
      <Card padding="sm">
        <p className="font-semibold text-fg">{x.worker.name}</p>
        <p className="text-caption text-muted">
          {multi && `${branchName(x.worker.branchId)} · `}
          {x.worker.role} · {x.worker.schedule.start} – {x.worker.schedule.end}
        </p>
        <div className="mt-2">
          <PunctualityMeter value={x.punctuality} />
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-line-soft pt-2 text-caption text-muted">
          <div>
            <dt>Asistió</dt>
            <dd className="mt-0.5 text-small font-semibold tabular-nums text-fg">
              {x.attended}/{x.scheduledDays}
            </dd>
          </div>
          <div>
            <dt>Faltas</dt>
            <dd className={cn("mt-0.5 text-small tabular-nums", x.absences ? "font-semibold text-danger-fg" : "text-muted")}>{x.absences || "—"}</dd>
          </div>
          <div>
            <dt>Tardanzas</dt>
            <dd className={cn("mt-0.5 text-small tabular-nums", x.lates ? "font-semibold text-danger-fg" : "text-muted")}>{x.lates || "—"}</dd>
          </div>
          <div>
            <dt>Min. tarde</dt>
            <dd className="mt-0.5 text-small tabular-nums text-fg">{x.lateMinutes || "—"}</dd>
          </div>
          <div>
            <dt>Horas</dt>
            <dd className="mt-0.5 text-small font-semibold tabular-nums text-fg">{fmtHours(x.worked)}</dd>
          </div>
          <div>
            <dt>Extra</dt>
            <dd className={cn("mt-0.5 text-small tabular-nums", x.overtime ? "text-success-fg" : "text-muted")}>{x.overtime ? fmtHours(x.overtime) : "—"}</dd>
          </div>
          <div>
            <dt>Sin salida</dt>
            <dd className={cn("mt-0.5 text-small tabular-nums", x.missingExit ? "font-semibold text-special-fg" : "text-muted")}>{x.missingExit || "—"}</dd>
          </div>
        </dl>
      </Card>
    </li>
  );
});

const daysText = (w: Worker) =>
  [1, 2, 3, 4, 5, 6, 0]
    .filter((d) => w.schedule.days.includes(d))
    .map((d) => DOW[d])
    .join(" · ");

function ActiveChip({ active }: { active: boolean }) {
  return active ? (
    <Chip tone="success">
      <CircleCheck className="h-3 w-3 shrink-0" aria-hidden /> Activo
    </Chip>
  ) : (
    <Chip tone="neutral">
      <Moon className="h-3 w-3 shrink-0" aria-hidden /> Inactivo
    </Chip>
  );
}

/** Fila de la lista de personal. */
export const WorkerRow = memo(function WorkerRow({ w, branchName, onEdit }: { w: Worker; branchName: (id: string) => string; onEdit: (w: Worker) => void }) {
  return (
    <tr className={!w.active ? "opacity-60" : undefined}>
      <td className={td}>
        <p className="font-medium text-fg">{w.name}</p>
        <p className="text-caption text-muted">{w.role}</p>
      </td>
      <td className={cn(td, "text-caption")}>{branchName(w.branchId)}</td>
      <td className={cn(td, "whitespace-nowrap text-caption tabular-nums")}>
        {w.schedule.start} – {w.schedule.end}
      </td>
      <td className={cn(td, "text-caption text-fg-2")}>{daysText(w)}</td>
      <td className={td}>
        <ActiveChip active={w.active} />
      </td>
      <td className={cn(td, "text-right")}>
        <IconButton onClick={() => onEdit(w)} aria-label={`Editar ${w.name}`}>
          <Pencil className="h-4 w-4" aria-hidden />
        </IconButton>
      </td>
    </tr>
  );
});

/** Tarjeta de trabajador para pantallas angostas. */
export const WorkerCard = memo(function WorkerCard({ w, branchName, onEdit }: { w: Worker; branchName: (id: string) => string; onEdit: (w: Worker) => void }) {
  return (
    <li>
      <Card padding="sm" className={!w.active ? "opacity-60" : undefined}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-fg">{w.name}</p>
            <p className="text-caption text-muted">
              {w.role} · {branchName(w.branchId)}
            </p>
          </div>
          <IconButton onClick={() => onEdit(w)} aria-label={`Editar ${w.name}`}>
            <Pencil className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption text-fg-2">
          <ActiveChip active={w.active} />
          <span className="tabular-nums">
            {w.schedule.start} – {w.schedule.end}
          </span>
          <span>{daysText(w)}</span>
        </div>
      </Card>
    </li>
  );
});
