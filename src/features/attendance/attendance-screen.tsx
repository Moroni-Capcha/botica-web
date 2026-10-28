"use client";

import { useMemo, useState } from "react";
import { Clock3, FileSpreadsheet, Fingerprint, Pencil, Plus, Timer, TriangleAlert, UserCheck, UserX, type LucideIcon } from "lucide-react";
import type { Worker } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useConfig, useMarks, useWorkers } from "@/lib/queries";
import { daySummary, DEFAULT_ATTENDANCE, DOW, fmtHours, historyRows, periodSummary, STATUS_LABEL, type DayStatus, type DaySummary } from "@/lib/domain/attendance";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Table, td } from "@/components/ui/table";
import { notify } from "@/components/ui/toast";
import { dateShort, timeShort } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ScopeToggle, useBranchScope } from "@/features/shared/branch-scope";
import { KioskDialog } from "./kiosk-dialog";
import { ManualMarkDialog, WorkerDialog } from "./dialogs";
import { exportAttendance } from "./export";

type Tab = "hoy" | "historial" | "resumen" | "personal";
const RANGES = [7, 15, 30] as const;
const STATUS_CLASS: Record<DayStatus, string> = {
  en_turno: "bg-emerald-100 text-emerald-700",
  refrigerio: "bg-amber-100 text-amber-800",
  salio: "bg-zinc-100 text-zinc-600",
  pendiente: "bg-zinc-100 text-zinc-500",
  no_llega: "bg-rose-100 text-rose-700",
  falta: "bg-rose-600 text-white",
  sin_salida: "bg-violet-100 text-violet-700",
  descanso: "bg-zinc-50 text-zinc-400",
};
const isoDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const firstName = (n: string) => n.replace(/^Q\.F\.\s*/, "").split(" ")[0];

export function AttendanceScreen() {
  const scope = useBranchScope();
  const { allBranches, branchName, branches, multi, operating, isAdmin } = scope;
  const config = useConfig();
  const settings = config.data?.attendance ?? DEFAULT_ATTENDANCE;
  const [now] = useState(() => Date.now());
  /* Siempre se traen 30 días: el historial y el resumen filtran en el front */
  const from = isoDay(now - 29 * 86_400_000);
  const to = isoDay(now);
  const workersQ = useWorkers();
  const marksQ = useMarks(from, to);
  const [clock, setClock] = useState(() => Date.now());

  const [tab, setTab] = useState<Tab>("hoy");
  const [range, setRange] = useState<(typeof RANGES)[number]>(7);
  const [who, setWho] = useState("todos");
  const [kiosk, setKiosk] = useState(false);
  const [manual, setManual] = useState<string | null | false>(false);
  const [editing, setEditing] = useState<Worker | "new" | null>(null);

  const allWorkers = workersQ.data ?? [];
  const workers = useMemo(() => allWorkers.filter((w) => w.active && (multi || w.branchId === operating)), [allWorkers, multi, operating]);
  const marks = marksQ.data ?? [];
  /* "Ahora" avanza al recargar las marcas para que las horas del día en curso se actualicen */
  const liveNow = Math.max(clock, marksQ.dataUpdatedAt || now);

  const today = useMemo(() => workers.map((w) => daySummary(w, liveNow, marks, liveNow, settings)), [workers, marks, liveNow, settings]);
  const rows = useMemo(() => historyRows(who === "todos" ? workers : workers.filter((w) => w.id === who), marks, range, liveNow, settings), [workers, who, marks, range, liveNow, settings]);
  const summary = useMemo(() => periodSummary(who === "todos" ? workers : workers.filter((w) => w.id === who), rows), [workers, who, rows]);

  const count = (st: DayStatus[]) => today.filter((r) => st.includes(r.status)).length;
  const lateToday = today.filter((r) => r.late > 0);

  if (!isAdmin) {
    return (
      <Empty icon={UserX} title="Solo el administrador ve la asistencia">
        Para marcar tu entrada o salida usa el botón de asistencia de la barra superior.
      </Empty>
    );
  }
  const error = workersQ.error ?? marksQ.error;
  if (error) {
    return (
      <Empty icon={TriangleAlert} title="No se pudo cargar la asistencia">
        {errorMessage(error)}{" "}
        <button type="button" className="font-semibold underline" onClick={() => void Promise.all([workersQ.refetch(), marksQ.refetch()])}>
          Reintentar
        </button>
      </Empty>
    );
  }
  const isLoading = workersQ.isLoading || marksQ.isLoading;

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Tab>
          label="Vista"
          value={tab}
          onChange={setTab}
          options={[
            { id: "hoy", label: "Hoy" },
            { id: "historial", label: "Historial" },
            { id: "resumen", label: "Resumen por trabajador" },
            { id: "personal", label: "Personal", count: workers.length },
          ]}
        />
        <ScopeToggle scope={scope.scope} onChange={scope.setScope} operatingName={branchName(operating)} />
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button onClick={() => setKiosk(true)}>
            <Fingerprint className="h-4 w-4" /> Marcar
          </Button>
          <Button onClick={() => setManual(null)} disabled={!workers.length}>
            <Pencil className="h-4 w-4" /> Marca manual
          </Button>
          <Button
            disabled={isLoading || !workers.length}
            onClick={() => {
              exportAttendance({ summary, rows, branches: allBranches, days: range, tolerance: settings.toleranceMinutes, pharmacy: config.data?.pharmacy });
              notify("Asistencia descargada");
            }}
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel {range} días
          </Button>
        </div>
      </div>

      {tab === "hoy" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={UserCheck} label="En el local ahora" value={`${count(["en_turno", "refrigerio"])} de ${today.filter((r) => r.scheduled).length}`} hint={`${count(["refrigerio"])} en refrigerio`} loading={isLoading} />
            <Kpi icon={Clock3} label="Tardanzas hoy" value={String(lateToday.length)} hint={lateToday.map((r) => `${firstName(r.worker.name)} ${r.late} min`).join(" · ") || "Todos a tiempo"} tone={lateToday.length ? "rose" : undefined} loading={isLoading} />
            <Kpi icon={UserX} label="Sin marcar entrada" value={String(count(["no_llega", "falta"]))} hint="Ya pasó su hora de ingreso" tone={count(["no_llega", "falta"]) ? "amber" : undefined} loading={isLoading} />
            <Kpi icon={Timer} label="Horas trabajadas hoy" value={fmtHours(today.reduce((s, r) => s + r.worked, 0))} hint="Todo el personal" loading={isLoading} />
          </div>
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white" aria-labelledby="att-today">
            <div className="border-b border-zinc-100 p-4 sm:px-5">
              <h2 id="att-today" className="font-semibold tracking-tight">Personal de hoy</h2>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                <Legend className="border border-dashed border-zinc-400 bg-transparent" label="Horario" />
                <Legend className="bg-brand" label="Trabajado" />
                <Legend className="bg-amber-300" label="Refrigerio" />
                <Legend className="bg-rose-500" label="Tardanza" />
                <Legend className="w-0.5 bg-zinc-900" label="Ahora" />
              </p>
            </div>
            {isLoading ? (
              <Skeleton />
            ) : !today.length ? (
              <Empty icon={UserX} title="No hay trabajadores registrados">Agrégalos en la pestaña Personal.</Empty>
            ) : (
              <Table minWidth={1060} head={["Trabajador", "Horario", "Entrada", "Refrigerio", "Salida", { label: "Horas", align: "right" }, "Estado", "Línea del día (7:00 a 23:00)"]}>
                {today.map((s) => (
                  <tr key={s.worker.id} className={s.status === "descanso" ? "opacity-50" : undefined}>
                    <td className={td}>
                      <p className="font-medium">{s.worker.name}</p>
                      <p className="text-xs text-zinc-500">
                        {multi && <span className="mr-1.5 rounded bg-brand/10 px-1.5 py-px text-[10.5px] font-semibold text-brand">{branchName(s.worker.branchId)}</span>}
                        {s.worker.role}
                      </p>
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-xs tabular-nums text-zinc-600")}>{s.scheduled ? `${s.worker.schedule.start} – ${s.worker.schedule.end}` : "Descanso"}</td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      {s.entrada ? (
                        <div className="grid gap-0.5">
                          <span className="font-semibold tabular-nums">
                            {timeShort(s.entrada.at)}
                            {s.entrada.manual && <Pencil className="ml-1 inline h-3 w-3 text-violet-600" aria-label="Marca manual" />}
                          </span>
                          <span className={cn("w-fit rounded-full px-1.5 text-[10.5px] font-semibold", s.late ? "bg-rose-100 text-rose-700" : "bg-emerald-50 text-emerald-700")}>{s.late ? `+${s.late} min` : "A tiempo"}</span>
                        </div>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-xs tabular-nums text-zinc-600")}>{s.refIni ? `${timeShort(s.refIni.at)} – ${s.refFin ? timeShort(s.refFin.at) : "…"}` : "—"}</td>
                    <td className={cn(td, "whitespace-nowrap font-semibold tabular-nums")}>{s.salida && s.status === "salio" ? timeShort(s.salida.at) : <span className="font-normal text-zinc-400">—</span>}</td>
                    <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{s.worked ? fmtHours(s.worked) : "—"}</td>
                    <td className={td}>
                      <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_CLASS[s.status])}>{STATUS_LABEL[s.status]}</span>
                    </td>
                    <td className={td}>
                      <DayTimeline s={s} now={liveNow} />
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
        </>
      )}

      {(tab === "historial" || tab === "resumen") && (
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Periodo" value={String(range)} onChange={(v) => setRange(Number(v) as (typeof RANGES)[number])} options={RANGES.map((r) => ({ id: String(r), label: `${r} días` }))} />
          <Select value={who} onChange={(e) => setWho(e.target.value)} className="w-auto" aria-label="Trabajador">
            <option value="todos">Todo el personal</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </Select>
        </div>
      )}

      {tab === "historial" && (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white" aria-label="Historial de asistencia">
          {isLoading ? (
            <Skeleton />
          ) : !rows.length ? (
            <Empty icon={Clock3} title="Sin marcas en el periodo" />
          ) : (
            <Table minWidth={1000} head={["Fecha", "Trabajador", "Entrada", "Refrigerio", "Salida", { label: "Horas", align: "right" }, { label: "Tardanza", align: "right" }, { label: "Extra", align: "right" }, "Estado", { label: <span className="sr-only">Corregir</span> }]}>
              {rows.map((s) => (
                <tr key={`${s.worker.id}-${s.day}`}>
                  <td className={cn(td, "whitespace-nowrap text-xs tabular-nums text-zinc-600")}>
                    {DOW[new Date(s.day).getDay()]} {dateShort(s.day)}
                  </td>
                  <td className={td}>
                    <p className="font-medium">{s.worker.name}</p>
                    <p className="text-xs text-zinc-500">
                      {multi && `${branchName(s.worker.branchId)} · `}
                      {s.worker.schedule.start} – {s.worker.schedule.end}
                    </p>
                  </td>
                  <td className={cn(td, "whitespace-nowrap tabular-nums")}>
                    {s.entrada ? timeShort(s.entrada.at) : "—"}
                    {s.entrada?.manual && <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] font-semibold text-violet-700" title={`${s.entrada.note} · ${s.entrada.registeredBy ?? ""}`}>manual</span>}
                  </td>
                  <td className={cn(td, "whitespace-nowrap text-xs tabular-nums text-zinc-600")}>{s.refIni ? `${timeShort(s.refIni.at)} – ${s.refFin ? timeShort(s.refFin.at) : "—"}` : "—"}</td>
                  <td className={cn(td, "whitespace-nowrap tabular-nums")}>
                    {s.salida ? timeShort(s.salida.at) : "—"}
                    {s.salida?.manual && <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] font-semibold text-violet-700" title={`${s.salida.note} · ${s.salida.registeredBy ?? ""}`}>manual</span>}
                  </td>
                  <td className={cn(td, "text-right tabular-nums")}>{s.worked ? fmtHours(s.worked) : "—"}</td>
                  <td className={cn(td, "text-right tabular-nums", s.late ? "font-semibold text-rose-600" : "text-zinc-400")}>{s.late ? `${s.late} min` : "—"}</td>
                  <td className={cn(td, "text-right tabular-nums", s.overtime ? "font-semibold text-emerald-700" : "text-zinc-400")}>{s.overtime ? fmtHours(s.overtime) : "—"}</td>
                  <td className={td}>
                    <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_CLASS[s.status])}>{STATUS_LABEL[s.status]}</span>
                  </td>
                  <td className={cn(td, "text-right")}>
                    {(s.status === "sin_salida" || s.status === "falta") && (
                      <Button size="sm" variant="ghost" onClick={() => setManual(s.worker.id)}>
                        Corregir
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </section>
      )}

      {tab === "resumen" && (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white" aria-labelledby="att-sum">
          <div className="border-b border-zinc-100 p-4 sm:px-5">
            <h2 id="att-sum" className="font-semibold tracking-tight">Últimos {range} días</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Tardanza: más de {settings.toleranceMinutes} min después de la hora de ingreso. Extra: más de {settings.overtimeAfterMinutes} min sobre el horario, descontando {settings.breakMinutes} min de refrigerio. Hoy cuenta cuando el turno cierra.
            </p>
          </div>
          {isLoading ? (
            <Skeleton />
          ) : (
            <Table minWidth={980} head={["Trabajador", { label: "Asistió", align: "right" }, { label: "Faltas", align: "right" }, { label: "Tardanzas", align: "right" }, { label: "Min. tarde", align: "right" }, { label: "Horas", align: "right" }, { label: "Extra", align: "right" }, { label: "Sin salida", align: "right" }, "Puntualidad"]}>
              {summary.map((x) => (
                <tr key={x.worker.id}>
                  <td className={td}>
                    <p className="font-medium">{x.worker.name}</p>
                    <p className="text-xs text-zinc-500">
                      {multi && `${branchName(x.worker.branchId)} · `}
                      {x.worker.role} · {x.worker.schedule.start} – {x.worker.schedule.end}
                    </p>
                  </td>
                  <td className={cn(td, "text-right tabular-nums")}>
                    {x.attended}/{x.scheduledDays}
                  </td>
                  <td className={cn(td, "text-right tabular-nums", x.absences ? "font-semibold text-rose-600" : "text-zinc-400")}>{x.absences || "—"}</td>
                  <td className={cn(td, "text-right tabular-nums", x.lates ? "font-semibold text-rose-600" : "text-zinc-400")}>{x.lates || "—"}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{x.lateMinutes || "—"}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{fmtHours(x.worked)}</td>
                  <td className={cn(td, "text-right tabular-nums text-emerald-700")}>{x.overtime ? fmtHours(x.overtime) : "—"}</td>
                  <td className={cn(td, "text-right tabular-nums", x.missingExit ? "font-semibold text-violet-700" : "text-zinc-400")}>{x.missingExit || "—"}</td>
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 rounded-full bg-zinc-100" role="meter" aria-valuenow={x.punctuality} aria-valuemin={0} aria-valuemax={100} aria-label="Puntualidad">
                        <div className={cn("h-full rounded-full", x.punctuality >= 90 ? "bg-emerald-600" : x.punctuality >= 75 ? "bg-amber-500" : "bg-rose-600")} style={{ width: `${x.punctuality}%` }} />
                      </div>
                      <span className="text-xs font-semibold tabular-nums">{x.punctuality} %</span>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </section>
      )}

      {tab === "personal" && (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white" aria-label="Personal">
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 p-4 sm:px-5">
            <p className="text-xs text-zinc-500">Cada trabajador marca con su propio PIN. Los inactivos no aparecen en el equipo de marcación.</p>
            <Button size="sm" variant="primary" onClick={() => setEditing("new")}>
              <Plus className="h-3.5 w-3.5" /> Nuevo trabajador
            </Button>
          </div>
          <Table minWidth={720} head={["Trabajador", "Local", "Horario", "Días", "Estado", { label: <span className="sr-only">Editar</span> }]}>
            {allWorkers
              .filter((w) => multi || w.branchId === operating)
              .map((w) => (
                <tr key={w.id} className={!w.active ? "opacity-50" : undefined}>
                  <td className={td}>
                    <p className="font-medium">{w.name}</p>
                    <p className="text-xs text-zinc-500">{w.role}</p>
                  </td>
                  <td className={cn(td, "text-xs")}>{branchName(w.branchId)}</td>
                  <td className={cn(td, "whitespace-nowrap text-xs tabular-nums")}>
                    {w.schedule.start} – {w.schedule.end}
                  </td>
                  <td className={cn(td, "text-xs text-zinc-600")}>{[1, 2, 3, 4, 5, 6, 0].filter((d) => w.schedule.days.includes(d)).map((d) => DOW[d]).join(" · ")}</td>
                  <td className={td}>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", w.active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500")}>{w.active ? "Activo" : "Inactivo"}</span>
                  </td>
                  <td className={cn(td, "text-right")}>
                    <button type="button" onClick={() => setEditing(w)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label={`Editar ${w.name}`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
          </Table>
        </section>
      )}

      {kiosk && (
        <KioskDialog
          branches={allBranches}
          fixedBranch={null}
          onClose={() => {
            setKiosk(false);
            setClock(Date.now());
          }}
        />
      )}
      {manual !== false && <ManualMarkDialog workers={workers} branchName={branchName} initialWorkerId={manual ?? undefined} onClose={() => setManual(false)} />}
      {editing && <WorkerDialog worker={editing === "new" ? null : editing} branches={allBranches} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Línea del día: horario programado, tiempo trabajado, refrigerio, tardanza y la hora actual. */
function DayTimeline({ s, now }: { s: DaySummary; now: number }) {
  const from = s.day + 7 * 3600_000;
  const to = s.day + 23 * 3600_000;
  const pos = (t: number) => `${Math.min(100, Math.max(0, ((t - from) / (to - from)) * 100))}%`;
  const width = (a: number, b: number) => `${Math.max(0, ((Math.min(b, to) - Math.max(a, from)) / (to - from)) * 100)}%`;
  const t = (iso?: string) => (iso ? new Date(iso).getTime() : 0);
  const entry = t(s.entrada?.at);
  const end = s.status === "salio" ? t(s.salida?.at) : s.isToday && s.entrada ? Math.min(now, to) : 0;
  const label = `${s.worker.name}: ${STATUS_LABEL[s.status]}${s.entrada ? `, entró ${timeShort(s.entrada.at)}` : ""}${s.salida && s.status === "salio" ? `, salió ${timeShort(s.salida.at)}` : ""}`;
  return (
    <div className="relative h-6 w-full min-w-[220px] rounded-md bg-zinc-50" role="img" aria-label={label}>
      {[9, 12, 15, 18, 21].map((h) => (
        <span key={h} className="absolute top-0 h-full w-px bg-zinc-200" style={{ left: pos(s.day + h * 3600_000) }} />
      ))}
      {s.scheduled && <span className="absolute top-1 h-4 rounded border border-dashed border-zinc-400" style={{ left: pos(s.scheduleStart), width: width(s.scheduleStart, s.scheduleEnd) }} />}
      {entry > 0 && end > 0 && <span className={cn("absolute top-1.5 h-3 rounded-sm bg-brand", s.status === "salio" ? "opacity-85" : "opacity-60")} style={{ left: pos(entry), width: width(entry, end) }} />}
      {s.refIni && <span className="absolute top-1.5 h-3 bg-amber-300" style={{ left: pos(t(s.refIni.at)), width: width(t(s.refIni.at), s.refFin ? t(s.refFin.at) : now) }} />}
      {s.late > 0 && entry > 0 && <span className="absolute top-1.5 h-3 rounded-l-sm bg-rose-500" style={{ left: pos(s.scheduleStart), width: width(s.scheduleStart, entry) }} />}
      {s.isToday && <span className="absolute -top-0.5 h-7 w-0.5 bg-zinc-900" style={{ left: pos(now) }} />}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-block h-2.5 w-4 rounded-sm", className)} />
      {label}
    </span>
  );
}

function Kpi({ icon: Icon, label, value, hint, tone, loading }: { icon: LucideIcon; label: string; value: string; hint?: string; tone?: "rose" | "amber"; loading?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4">
      <p className="flex items-center gap-2 text-xs font-semibold text-zinc-600">
        <span className={cn("grid h-7 w-7 place-items-center rounded-lg", tone === "rose" ? "bg-rose-100 text-rose-700" : tone === "amber" ? "bg-amber-100 text-amber-700" : "bg-brand/10 text-brand")}>
          <Icon className="h-4 w-4" />
        </span>
        {label}
      </p>
      {loading ? <div className="mt-2 h-7 w-20 animate-pulse rounded bg-zinc-100" /> : <p className="mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</p>}
      {hint && <p className="mt-0.5 truncate text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-2 p-4 sm:p-5" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-zinc-100" />
      ))}
    </div>
  );
}
