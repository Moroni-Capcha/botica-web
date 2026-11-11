"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Ban, CalendarPlus, LogOut, RefreshCw, Repeat, Search, ShieldCheck, TriangleAlert, Building2 } from "lucide-react";
import type { AccountStatus, PlatformSession, TenantAction, TenantSummary } from "@/lib/api/types";
import { apiMode, errorMessage, platformApi } from "@/lib/api";
import { useTenants } from "@/lib/queries";
import { STATUS_LABEL, limaDay } from "@/lib/domain/account";
import { accountDeadline, activityLabel, tenantActions } from "@/lib/domain/platform";
import { DEFAULT_PAGE_SIZE } from "@/lib/domain/pagination";
import { DIGIHME, DigiHmeLogo } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { Table, td } from "@/components/ui/table";
import { dateShort } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ThemeSwitch } from "@/components/theme-toggle";
import { MetricsPanel } from "./metrics-panel";
import { TenantActionDialog } from "./tenant-action-dialog";
import { TenantDetailDialog } from "./tenant-detail-dialog";

const STATUS_STYLE: Record<AccountStatus, { badge: string; card: string }> = {
  active: { badge: "bg-success-bg text-success-fg", card: "text-success-fg" },
  trial: { badge: "bg-info-bg text-info-fg", card: "text-info-fg" },
  overdue: { badge: "bg-warning-bg text-warning-fg", card: "text-warning-fg" },
  suspended: { badge: "bg-danger-bg text-danger-fg", card: "text-danger-fg" },
};
const STATUS_ORDER: AccountStatus[] = ["active", "trial", "overdue", "suspended"];

/** Consola interna: las boticas clientes, su plan y estado, con las acciones de Digi!HME. */
export function ConsoleScreen({ session, onLogout }: { session: PlatformSession; onLogout: () => void }) {
  const [now] = useState(() => Date.now());
  const today = limaDay(now);
  const [text, setText] = useState("");
  const q = useDeferredValue(text.trim());
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<TenantSummary | null>(null);
  const [dialog, setDialog] = useState<{ tenant: TenantSummary; kind: TenantAction["action"] } | null>(null);

  const query = useMemo(() => ({ page, pageSize: DEFAULT_PAGE_SIZE, ...(q ? { q } : {}), ...(status ? { status } : {}) }), [page, q, status]);
  const tenants = useTenants(query);
  const rows = tenants.data?.items ?? [];
  const counts = tenants.data?.counts;
  const total = tenants.data?.total ?? 0;

  const logout = () => {
    void platformApi.logout().catch(() => undefined);
    onLogout();
  };

  return (
    <div className="min-h-dvh bg-subtle text-fg" style={{ ["--brand" as string]: DIGIHME.navy, ["--accent" as string]: DIGIHME.cyan }}>
      <header className="sticky top-0 z-20 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <DigiHmeLogo height={30} />
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white" style={{ background: DIGIHME.navy }}>
            <ShieldCheck className="h-3.5 w-3.5" /> Consola interna
          </span>
          {apiMode === "mock" && <span className="rounded-full bg-warning-bg px-2.5 py-1 text-[11px] font-semibold text-warning-fg">Datos de prueba</span>}
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <ThemeSwitch />
            <div className="ml-1 hidden text-right leading-tight sm:block">
              <p className="text-sm font-medium">{session.operator.name}</p>
              <p className="text-xs text-muted">{session.operator.email}</p>
            </div>
            <Button size="sm" onClick={logout}>
              <LogOut className="h-3.5 w-3.5" /> Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Boticas clientes</h1>
          <p className="mt-0.5 text-sm text-muted">Plan, estado de la cuenta y actividad. Cada cambio pide un motivo y queda en la auditoría de la botica.</p>
        </div>

        <MetricsPanel now={now} today={today} onOpen={setDetail} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label="Boticas por estado">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => {
                setStatus(status === s ? null : s);
                setPage(1);
              }}
              className={cn("rounded-2xl border bg-surface p-4 text-left transition hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2", status === s ? "border-fg ring-1 ring-fg" : "border-line")}
            >
              <span className="block text-xs font-medium text-muted">{STATUS_LABEL[s]}</span>
              <span className={cn("mt-1 block text-2xl font-semibold tabular-nums", STATUS_STYLE[s].card)}>{counts ? counts[s] : "…"}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por nombre o código de la botica"
              className="pl-9"
              aria-label="Buscar botica"
            />
          </div>
          <p className="text-xs text-muted">{tenants.data ? `${total} ${total === 1 ? "botica" : "boticas"}${q || status ? " con esos filtros" : ""}` : ""}</p>
          <Button size="sm" className="ml-auto" onClick={() => void tenants.refetch()} loading={tenants.isFetching && !tenants.isLoading}>
            <RefreshCw className="h-3.5 w-3.5" /> Actualizar
          </Button>
        </div>

        <section className="overflow-hidden rounded-2xl border border-line bg-surface" aria-label="Lista de boticas">
          {tenants.error ? (
            <Empty icon={TriangleAlert} title="No se pudo cargar la lista">
              {errorMessage(tenants.error)}{" "}
              <button type="button" className="font-semibold underline" onClick={() => void tenants.refetch()}>
                Reintentar
              </button>
            </Empty>
          ) : tenants.isLoading ? (
            <div className="grid gap-2 p-4 sm:p-5" aria-busy="true">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-sunken" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <Empty icon={Building2} title="Ninguna botica coincide">
              Cambia la búsqueda o quita el filtro de estado.
            </Empty>
          ) : (
            <div className={cn("transition-opacity", tenants.isFetching && "opacity-60")}>
              <Table minWidth={1080} head={["Botica", "Plan", "Estado", "Creada", "Última actividad", { label: "Locales", align: "right" }, { label: "Usuarios", align: "right" }, { label: "Acciones", align: "right" }]}>
                {rows.map((t) => {
                  const can = tenantActions(t);
                  const deadline = accountDeadline(t, today);
                  return (
                    <tr key={t.code}>
                      <td className={td}>
                        <button type="button" onClick={() => setDetail(t)} aria-label={`Ver el detalle de ${t.name}`} className="-my-1 block min-h-10 rounded-lg py-1 text-left hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">
                          <span className="block font-semibold">{t.name}</span>
                          <span className="block text-xs text-muted">{t.code}</span>
                        </button>
                      </td>
                      <td className={cn(td, "whitespace-nowrap")}>{t.planName}</td>
                      <td className={td}>
                        <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLE[t.status].badge)}>{STATUS_LABEL[t.status]}</span>
                        {deadline && <span className="mt-0.5 block text-[11px] text-muted">{deadline}</span>}
                      </td>
                      <td className={cn(td, "whitespace-nowrap text-xs tabular-nums text-fg-2")}>{dateShort(t.createdAt)}</td>
                      <td className={cn(td, "whitespace-nowrap text-xs text-fg-2")} title={t.lastActivityAt ?? undefined}>
                        {activityLabel(t.lastActivityAt, now)}
                      </td>
                      <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>
                        {t.branches} <span className="text-xs text-muted">/ {t.maxBranches}</span>
                      </td>
                      <td className={cn(td, "text-right tabular-nums")}>{t.users}</td>
                      <td className={cn(td, "whitespace-nowrap text-right")}>
                        <span className="inline-flex gap-1.5">
                          {can.changePlan && (
                            <Button size="sm" onClick={() => setDialog({ tenant: t, kind: "change_plan" })}>
                              <Repeat className="h-3.5 w-3.5" /> Plan
                            </Button>
                          )}
                          {can.extendTrial && (
                            <Button size="sm" onClick={() => setDialog({ tenant: t, kind: "extend_trial" })}>
                              <CalendarPlus className="h-3.5 w-3.5" /> Extender prueba
                            </Button>
                          )}
                          {can.suspend && (
                            <Button size="sm" variant="secondary" className="text-danger-fg" onClick={() => setDialog({ tenant: t, kind: "suspend" })}>
                              <Ban className="h-3.5 w-3.5" /> Suspender
                            </Button>
                          )}
                          {can.reactivate && (
                            <Button size="sm" variant="primary" onClick={() => setDialog({ tenant: t, kind: "reactivate" })}>
                              Reactivar
                            </Button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </Table>
            </div>
          )}
          {tenants.data && <Pagination page={tenants.data.page} pageSize={tenants.data.pageSize} total={tenants.data.total} onPage={setPage} busy={tenants.isFetching} noun="boticas" />}
        </section>
      </main>

      {detail && <TenantDetailDialog code={detail.code} name={detail.name} onClose={() => setDetail(null)} />}
      {dialog && <TenantActionDialog tenant={dialog.tenant} kind={dialog.kind} onClose={() => setDialog(null)} />}
    </div>
  );
}
