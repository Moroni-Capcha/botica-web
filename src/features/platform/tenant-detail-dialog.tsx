"use client";

import type { ReactNode } from "react";
import { Ban, CalendarClock, CheckCircle2, Clock, TriangleAlert, type LucideIcon } from "lucide-react";
import type { AccountStatus, TenantDetail } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useTenant } from "@/lib/queries";
import { STATUS_LABEL, limaDay } from "@/lib/domain/account";
import { HISTORY_LABEL, accountDeadline, activityLabel, roleLabel } from "@/lib/domain/platform";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { dateShort, timeShort } from "@/lib/format";
import { cn } from "@/lib/cn";

const STATUS_VIEW: Record<AccountStatus, { badge: string; icon: LucideIcon }> = {
  active: { badge: "bg-success-bg text-success-fg", icon: CheckCircle2 },
  trial: { badge: "bg-info-bg text-info-fg", icon: Clock },
  overdue: { badge: "bg-warning-bg text-warning-fg", icon: TriangleAlert },
  suspended: { badge: "bg-danger-bg text-danger-fg", icon: Ban },
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

const Pill = ({ children, tone }: { children: ReactNode; tone: string }) => <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", tone)}>{children}</span>;

const when = (iso: string) => `${dateShort(iso)} · ${timeShort(iso)}`;

/** Detalle de solo lectura de una botica: locales, personal, actividad de 30 días y lo que Digi!HME le ha hecho. */
export function TenantDetailDialog({ code, name, onClose }: { code: string; name: string; onClose: () => void }) {
  const query = useTenant(code);
  const d = query.data;

  return (
    <Dialog title={name} description="Solo lectura. Para cambiar el plan o la cuenta usa los botones de la lista." onClose={onClose} size="lg" footer={<Button onClick={onClose}>Cerrar</Button>}>
      {query.error ? (
        <div className="grid justify-items-start gap-3" role="alert">
          <p className="text-sm text-danger-fg">{errorMessage(query.error)}</p>
          <Button size="sm" onClick={() => void query.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : !d ? (
        <div className="grid gap-3" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-sunken" />
          ))}
        </div>
      ) : (
        <DetailBody d={d} />
      )}
    </Dialog>
  );
}

function DetailBody({ d }: { d: TenantDetail }) {
  const now = Date.now();
  const t = d.tenant;
  const view = STATUS_VIEW[t.status];
  const Icon = view.icon;
  const deadline = accountDeadline(t, limaDay(now));
  const v = d.activity.vouchersLast30Days;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-subtle p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{t.name}</p>
          <p className="truncate text-xs text-muted">
            {t.code} · {t.planName} · hasta {t.maxBranches} {t.maxBranches === 1 ? "local" : "locales"}
          </p>
        </div>
        <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", view.badge)}>
          <Icon className="h-3.5 w-3.5" aria-hidden /> {STATUS_LABEL[t.status]}
        </span>
        {deadline && (
          <p className="flex w-full items-center gap-1.5 text-xs text-fg-2">
            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden /> {deadline}
          </p>
        )}
      </div>

      <Section title={`Locales (${t.branches} activos)`}>
        <ul className="divide-y divide-line-soft rounded-xl border border-line">
          {d.branches.map((b) => (
            <li key={b.id} className="flex min-h-10 items-center justify-between gap-3 px-3 py-2">
              <span className={cn("min-w-0 break-words text-sm", b.closed && "text-muted")}>{b.name}</span>
              <Pill tone={b.active ? "bg-success-bg text-success-fg" : "bg-sunken text-muted"}>{b.active ? "Activo" : "Cerrado"}</Pill>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`Personal (${t.users} activos)`}>
        <ul className="divide-y divide-line-soft rounded-xl border border-line">
          {d.staff.map((s, i) => (
            <li key={`${s.name}-${i}`} className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-0">
                <span className={cn("block break-words text-sm font-medium", !s.active && "text-muted")}>{s.name}</span>
                <span className="block text-xs text-muted">
                  {roleLabel(s.role)} · {s.lastLoginAt ? `Ingresó ${activityLabel(s.lastLoginAt, now).toLowerCase()}` : "Nunca ingresó"}
                </span>
              </span>
              <Pill tone={s.active ? "bg-success-bg text-success-fg" : "bg-sunken text-muted"}>{s.active ? "Activo" : "Desactivado"}</Pill>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Actividad de los últimos 30 días">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Ventas" value={d.activity.salesLast30Days} />
          <Stat label="Aceptados por SUNAT" value={v.accepted} tone="text-success-fg" />
          <Stat label="Pendientes" value={v.pending} tone={v.pending ? "text-warning-fg" : undefined} />
          <Stat label="Rechazados" value={v.rejected} tone={v.rejected ? "text-danger-fg" : undefined} />
        </div>
        <p className="text-xs text-muted">{d.activity.lastSaleAt ? `Última venta: ${when(d.activity.lastSaleAt)}` : "Todavía no registra ventas."}</p>
      </Section>

      <Section title="Lo que ha hecho Digi!HME">
        {d.history.length === 0 ? (
          <p className="rounded-xl border border-line px-3 py-3 text-sm text-muted">Digi!HME aún no hizo cambios en esta botica.</p>
        ) : (
          <ul className="divide-y divide-line-soft rounded-xl border border-line">
            {d.history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="px-3 py-2.5">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="font-medium">{HISTORY_LABEL[h.action]}</span>
                  <span className="text-xs tabular-nums text-muted">{when(h.at)}</span>
                </p>
                {h.reason && <p className="mt-0.5 break-words text-xs text-fg-2">Motivo: {h.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string | undefined }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <span className="block text-xs text-muted">{label}</span>
      <span className={cn("mt-0.5 block text-xl font-semibold tabular-nums", tone)}>{value}</span>
    </div>
  );
}
