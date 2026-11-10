"use client";

import { useMemo, useState } from "react";
import { Clock3, FileSpreadsheet, Fingerprint, Pencil, Plus, Timer, TriangleAlert, UserCheck, UserX } from "lucide-react";
import type { Worker } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useConfig, useMarks, useWorkers } from "@/lib/queries";
import { daySummary, DEFAULT_ATTENDANCE, fmtHours, historyRows, periodSummary, type DayStatus } from "@/lib/domain/attendance";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Table } from "@/components/ui/table";
import { notify } from "@/components/ui/toast";
import { useMediaQuery } from "@/lib/use-media-query";
import { ScopeToggle, useBranchScope } from "@/features/shared/branch-scope";
import { Kpi } from "@/features/shared/kpi";
import { KioskDialog } from "./kiosk-dialog";
import { ManualMarkDialog, WorkerDialog } from "./dialogs";
import { exportAttendance } from "./export";
import { HistoryCard, HistoryRow, Legend, SummaryCard, SummaryRow, TodayCard, TodayRow, WorkerCard, WorkerRow } from "./attendance-rows";

type Tab = "hoy" | "historial" | "resumen" | "personal";
const RANGES = [7, 15, 30] as const;
const isoDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const firstName = (n: string) => n.replace(/^Q\.F\.\s*/, "").split(" ")[0];

export function AttendanceScreen() {
  const scope = useBranchScope();
  const wide = useMediaQuery("(min-width: 768px)");
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
  const staff = allWorkers.filter((w) => multi || w.branchId === operating);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <Card padding="none">
          <Empty icon={UserX} title="Solo el administrador ve la asistencia">
            Para marcar tu entrada o salida usa el botón de asistencia de la barra superior.
          </Empty>
        </Card>
      </div>
    );
  }
  const error = workersQ.error ?? marksQ.error;
  if (error) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <Card padding="none">
          <Empty icon={TriangleAlert} title="No se pudo cargar la asistencia">
            {errorMessage(error)}{" "}
            <button type="button" className="font-semibold underline" onClick={() => void Promise.all([workersQ.refetch(), marksQ.refetch()])}>
              Reintentar
            </button>
          </Empty>
        </Card>
      </div>
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
            <Fingerprint className="h-4 w-4" aria-hidden /> Marcar
          </Button>
          <Button onClick={() => setManual(null)} disabled={!workers.length}>
            <Pencil className="h-4 w-4" aria-hidden /> Marca manual
          </Button>
          <Button
            disabled={isLoading || !workers.length}
            onClick={() => {
              exportAttendance({ summary, rows, branches: allBranches, days: range, tolerance: settings.toleranceMinutes, pharmacy: config.data?.pharmacy });
              notify("Asistencia descargada");
            }}
          >
            <FileSpreadsheet className="h-4 w-4 text-success-fg" aria-hidden /> Excel {range} días
          </Button>
        </div>
      </div>

      {tab === "hoy" && (
        <div className="grid animate-swap-in gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={UserCheck} label="En el local ahora" value={`${count(["en_turno", "refrigerio"])} de ${today.filter((r) => r.scheduled).length}`} hint={`${count(["refrigerio"])} en refrigerio`} loading={isLoading} />
            <Kpi icon={Clock3} label="Tardanzas hoy" value={String(lateToday.length)} hint={lateToday.map((r) => `${firstName(r.worker.name)} ${r.late} min`).join(" · ") || "Todos a tiempo"} iconClass={lateToday.length ? "text-danger-fg" : undefined} valueClass={lateToday.length ? "text-danger-fg" : undefined} loading={isLoading} />
            <Kpi icon={UserX} label="Sin marcar entrada" value={String(count(["no_llega", "falta"]))} hint="Ya pasó su hora de ingreso" iconClass={count(["no_llega", "falta"]) ? "text-warning-fg" : undefined} valueClass={count(["no_llega", "falta"]) ? "text-warning-fg" : undefined} loading={isLoading} />
            <Kpi icon={Timer} label="Horas trabajadas hoy" value={fmtHours(today.reduce((s, r) => s + r.worked, 0))} hint="Todo el personal" loading={isLoading} />
          </div>
          <Card as="section" padding="none" className="overflow-hidden" aria-labelledby="att-today">
            <div className="border-b border-line-soft p-4 sm:px-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <h2 id="att-today" className="font-semibold tracking-tight">Personal de hoy</h2>
                <p className="text-caption tabular-nums text-muted" role="status" aria-live="polite">
                  {isLoading ? "" : `${today.length} ${today.length === 1 ? "trabajador" : "trabajadores"}`}
                </p>
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted">
                <Legend className="border border-dashed border-muted bg-transparent" label="Horario" />
                <Legend className="bg-brand" label="Trabajado" />
                <Legend className="bg-warning" label="Refrigerio" />
                <Legend className="bg-danger" label="Tardanza" />
                <Legend className="w-0.5 bg-fg" label="Ahora" />
              </p>
            </div>
            {isLoading ? (
              <Skeleton />
            ) : !today.length ? (
              <Empty icon={UserX} title="No hay trabajadores registrados">Agrégalos en la pestaña Personal.</Empty>
            ) : wide ? (
              <Table minWidth={1060} head={["Trabajador", "Horario", "Entrada", "Refrigerio", "Salida", { label: "Horas", align: "right" }, "Estado", "Línea del día (7:00 a 23:00)"]}>
                {today.map((s) => (
                  <TodayRow key={s.worker.id} s={s} now={liveNow} multi={multi} branchName={branchName} />
                ))}
              </Table>
            ) : (
              <ul className="grid gap-2 p-3">
                {today.map((s) => (
                  <TodayCard key={s.worker.id} s={s} now={liveNow} multi={multi} branchName={branchName} />
                ))}
              </ul>
            )}
          </Card>
        </div>
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
        <Card as="section" padding="none" className="animate-swap-in overflow-hidden" aria-labelledby="att-history">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line-soft p-4 sm:px-5">
            <h2 id="att-history" className="font-semibold tracking-tight">Historial de asistencia</h2>
            <p className="text-caption tabular-nums text-muted" role="status" aria-live="polite">
              {isLoading ? "" : `${rows.length} ${rows.length === 1 ? "registro" : "registros"}`}
            </p>
          </div>
          {isLoading ? (
            <Skeleton />
          ) : !rows.length ? (
            <Empty icon={Clock3} title="Sin marcas en el periodo" />
          ) : wide ? (
            <Table maxHeight={640} minWidth={1000} head={["Fecha", "Trabajador", "Entrada", "Refrigerio", "Salida", { label: "Horas", align: "right" }, { label: "Tardanza", align: "right" }, { label: "Extra", align: "right" }, "Estado", { label: <span className="sr-only">Corregir</span> }]}>
              {rows.map((s) => (
                <HistoryRow key={`${s.worker.id}-${s.day}`} s={s} multi={multi} branchName={branchName} onFix={setManual} />
              ))}
            </Table>
          ) : (
            <ul className="grid gap-2 p-3">
              {rows.map((s) => (
                <HistoryCard key={`${s.worker.id}-${s.day}`} s={s} multi={multi} branchName={branchName} onFix={setManual} />
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "resumen" && (
        <Card as="section" padding="none" className="animate-swap-in overflow-hidden" aria-labelledby="att-sum">
          <div className="border-b border-line-soft p-4 sm:px-5">
            <h2 id="att-sum" className="font-semibold tracking-tight">Últimos {range} días</h2>
            <p className="mt-0.5 text-caption text-muted">
              Tardanza: más de {settings.toleranceMinutes} min después de la hora de ingreso. Extra: más de {settings.overtimeAfterMinutes} min sobre el horario, descontando {settings.breakMinutes} min de refrigerio. Hoy cuenta cuando el turno cierra.
            </p>
          </div>
          {isLoading ? (
            <Skeleton />
          ) : wide ? (
            <Table minWidth={980} head={["Trabajador", { label: "Asistió", align: "right" }, { label: "Faltas", align: "right" }, { label: "Tardanzas", align: "right" }, { label: "Min. tarde", align: "right" }, { label: "Horas", align: "right" }, { label: "Extra", align: "right" }, { label: "Sin salida", align: "right" }, "Puntualidad"]}>
              {summary.map((x) => (
                <SummaryRow key={x.worker.id} x={x} multi={multi} branchName={branchName} />
              ))}
            </Table>
          ) : (
            <ul className="grid gap-2 p-3">
              {summary.map((x) => (
                <SummaryCard key={x.worker.id} x={x} multi={multi} branchName={branchName} />
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "personal" && (
        <Card as="section" padding="none" className="animate-swap-in overflow-hidden" aria-labelledby="att-staff">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft p-4 sm:px-5">
            <div className="min-w-0 flex-1 basis-64">
              <h2 id="att-staff" className="font-semibold tracking-tight">Personal</h2>
              <p className="mt-0.5 text-caption text-muted">Cada trabajador marca con su propio PIN. Los inactivos no aparecen en el equipo de marcación.</p>
            </div>
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" aria-hidden /> Nuevo trabajador
            </Button>
          </div>
          {wide ? (
            <Table minWidth={720} head={["Trabajador", "Local", "Horario", "Días", "Estado", { label: <span className="sr-only">Editar</span> }]}>
              {staff.map((w) => (
                <WorkerRow key={w.id} w={w} branchName={branchName} onEdit={setEditing} />
              ))}
            </Table>
          ) : (
            <ul className="grid gap-2 p-3">
              {staff.map((w) => (
                <WorkerCard key={w.id} w={w} branchName={branchName} onEdit={setEditing} />
              ))}
            </ul>
          )}
        </Card>
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

function Skeleton() {
  return (
    <div className="grid gap-2 p-4 sm:p-5" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-sunken" />
      ))}
    </div>
  );
}
