"use client";

import type { ReactNode } from "react";
import { Building2, CircleCheck, Clock, TriangleAlert, WalletCards, type LucideIcon } from "lucide-react";
import type { TenantSummary } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useMetrics } from "@/lib/queries";
import { daysLeft } from "@/lib/domain/account";
import { activityLabel } from "@/lib/domain/platform";
import { ColumnChart, type ChartDatum, type ChartSeries } from "@/components/charts/column-chart";
import { SERIES_COLORS } from "@/lib/chart-colors";
import { soles } from "@/lib/format";
import { cn } from "@/lib/cn";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MONTHS_FULL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const SERIES: ChartSeries[] = [{ key: "n", label: "Boticas nuevas", color: SERIES_COLORS[0] }];

function monthDatum(month: string, count: number): ChartDatum {
  const [y, m] = month.split("-");
  const i = Math.max(0, Math.min(11, Number(m) - 1));
  return { key: month, label: MONTHS[i] ?? month, title: `${MONTHS_FULL[i] ?? month} de ${y}`, values: { n: count } };
}

function Tile({ icon: Icon, label, value, hint, tone }: { icon: LucideIcon; label: string; value: ReactNode; hint?: string; tone: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-4">
      <span className={cn("flex items-center gap-1.5 text-xs font-medium", tone)}>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> {label}
      </span>
      <span className="mt-1 block truncate text-2xl font-semibold tabular-nums">{value}</span>
      {hint && <span className="block text-[11px] text-muted">{hint}</span>}
    </div>
  );
}

function ListCard({ title, hint, empty, children, count }: { title: string; hint: string; empty: string; children: ReactNode; count: number }) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface" aria-label={title}>
      <div className="px-4 pt-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      {count === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-4 py-8 text-center">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-success-bg text-success-fg">
            <CircleCheck className="h-5 w-5" aria-hidden />
          </span>
          <p className="max-w-[26ch] text-sm text-muted">{empty}</p>
        </div>
      ) : (
        <ul className="mt-2 pb-2">{children}</ul>
      )}
    </section>
  );
}

function Row({ tenant, detail, icon: Icon, tone, onOpen }: { tenant: TenantSummary; detail: string; icon: LucideIcon; tone: string; onOpen: (t: TenantSummary) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(tenant)}
        aria-label={`Ver el detalle de ${tenant.name}`}
        className="flex min-h-10 w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{tenant.name}</span>
          <span className="block truncate text-xs text-muted">{tenant.planName}</span>
        </span>
        <span className={cn("flex shrink-0 items-center gap-1.5 text-xs font-medium", tone)}>
          <Icon className="h-3.5 w-3.5" aria-hidden /> {detail}
        </span>
      </button>
    </li>
  );
}

/** Resumen de la plataforma, arriba de la lista de la consola: ingreso, estados, altas por mes, boticas sin actividad y pruebas por vencer. */
export function MetricsPanel({ now, today, onOpen }: { now: number; today: string; onOpen: (t: TenantSummary) => void }) {
  const query = useMetrics();
  const m = query.data;

  if (query.error)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
        <TriangleAlert className="h-4 w-4 shrink-0 text-warning-fg" aria-hidden />
        <span className="min-w-0">No se pudo cargar el resumen. {errorMessage(query.error)}</span>
        <button type="button" className="inline-flex min-h-10 items-center font-semibold text-fg underline" onClick={() => void query.refetch()}>
          Reintentar
        </button>
      </div>
    );

  if (!m)
    return (
      <div className="grid gap-3" aria-busy="true" aria-label="Cargando el resumen">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-sunken" />
          ))}
        </div>
        <div className="h-56 animate-pulse rounded-2xl bg-sunken" />
      </div>
    );

  const data = m.newTenantsByMonth.map((x) => monthDatum(x.month, x.count));
  const newTotal = m.newTenantsByMonth.reduce((s, x) => s + x.count, 0);

  return (
    <section className="grid min-w-0 gap-3" aria-label="Resumen de la plataforma">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={WalletCards} label="Ingreso mensual" value={soles(m.monthlyRecurringRevenue.withIgv)} hint={`${soles(m.monthlyRecurringRevenue.withoutIgv)} sin IGV`} tone="text-fg-2" />
        <Tile icon={Building2} label="Altas este mes" value={m.newTenantsByMonth[m.newTenantsByMonth.length - 1]?.count ?? 0} hint={`${newTotal} en los últimos 6 meses`} tone="text-success-fg" />
        <Tile icon={TriangleAlert} label="Sin actividad" value={m.inactive.length} hint="14 días o más sin usar el sistema" tone="text-warning-fg" />
        <Tile icon={Clock} label="Pruebas por vencer" value={m.trialsEndingSoon.length} hint="Terminan en 7 días o menos" tone="text-info-fg" />
      </div>

      <div className="grid min-w-0 gap-3 lg:grid-cols-3">
        <section className="min-w-0 rounded-2xl border border-line bg-surface p-4 lg:col-span-1" aria-label="Boticas nuevas por mes">
          <h2 className="text-sm font-semibold">Boticas nuevas por mes</h2>
          <p className="mb-2 text-xs text-muted">{newTotal === 0 ? "Ninguna en los últimos 6 meses" : `${newTotal} en los últimos 6 meses`}</p>
          <ColumnChart data={data} series={SERIES} height={190} format={(n) => String(n)} integer ariaLabel="Boticas nuevas por mes, últimos 6 meses" emptyText="Aún no hay altas" />
        </section>

        <ListCard title="Sin actividad" hint="Activas o en prueba, 14 días o más sin usar el sistema" empty="Todas las boticas usaron el sistema en los últimos 14 días." count={m.inactive.length}>
          {m.inactive.map((t) => (
            <Row key={t.code} tenant={t} icon={TriangleAlert} tone="text-warning-fg" detail={t.lastActivityAt ? activityLabel(t.lastActivityAt, now) : "Nunca entró"} onOpen={onOpen} />
          ))}
        </ListCard>

        <ListCard title="Pruebas por vencer" hint="La prueba gratis termina en 7 días o menos" empty="Ninguna prueba termina esta semana." count={m.trialsEndingSoon.length}>
          {m.trialsEndingSoon.map((t) => {
            const d = t.trialEndsAt ? daysLeft(t.trialEndsAt, today) : 0;
            return <Row key={t.code} tenant={t} icon={Clock} tone="text-info-fg" detail={d === 0 ? "Termina hoy" : d === 1 ? "Queda 1 día" : `Quedan ${d} días`} onOpen={onOpen} />;
          })}
        </ListCard>
      </div>
    </section>
  );
}
