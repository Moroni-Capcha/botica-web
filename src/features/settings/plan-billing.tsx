"use client";

import { Receipt } from "lucide-react";
import type { PublicConfig } from "@/lib/api";
import { useAccount } from "@/lib/queries";
import { ALL_MODULES, STATUS_LABEL, daysLeft, effectiveStatus, limaDay } from "@/lib/domain/account";
import { planUsage } from "@/lib/domain/settings";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/cn";
import { Empty } from "@/components/ui/empty";

const card = "rounded-2xl border border-zinc-200 bg-white";
const BADGE = { trial: "bg-sky-50 text-sky-700", active: "bg-emerald-50 text-emerald-700", overdue: "bg-amber-50 text-amber-800", suspended: "bg-rose-50 text-rose-700" } as const;
const fmtDay = (d: string) => new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/** Pestaña "Plan y facturación": plan, uso de locales, estado de la cuenta y módulos incluidos. */
export function PlanBilling({ config }: { config: PublicConfig }) {
  const { data: account, isLoading, isError } = useAccount();
  const plan = planUsage([...config.branches, ...config.closedBranches], config.plan.maxBranches);
  const today = limaDay(Date.now());

  if (isLoading) return <div className={cn(card, "h-72 animate-pulse bg-zinc-50")} />;
  if (isError || !account) return <Empty icon={Receipt} title="No se pudo leer tu plan">Intenta de nuevo en un momento.</Empty>;

  const status = effectiveStatus(account, today);
  const when =
    status === "trial" && account.trialEndsAt
      ? `Prueba gratis hasta el ${fmtDay(account.trialEndsAt)} (${Math.max(0, daysLeft(account.trialEndsAt, today))} días).`
      : status === "active" && account.renewsAt
        ? `Se renueva el ${fmtDay(account.renewsAt)}.`
        : status === "overdue"
          ? "Tu plan está vencido. Regulariza el pago con Digi!HME."
          : status === "suspended"
            ? "Cuenta en solo lectura. Contacta a Digi!HME para reactivarla."
            : null;
  const modules = ALL_MODULES.map((id) => ({ id, label: NAV.find((n) => n.id === id)?.label ?? id, included: account.modules.includes(id) }));

  return (
    <div className="grid gap-4">
      <section className={cn(card, "grid gap-4 p-4 sm:grid-cols-3 sm:p-5")} aria-label="Resumen del plan">
        <div>
          <p className="text-xs font-medium text-zinc-500">Plan</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">{config.plan.name}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-500">Locales</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">
            {plan.active} de {plan.max}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-500">Estado de la cuenta</p>
          <p className="mt-1">
            <span className={cn("inline-block rounded-full px-2.5 py-1 text-xs font-semibold", BADGE[status])}>{STATUS_LABEL[status]}</span>
          </p>
        </div>
        {when && <p className="text-sm text-zinc-600 sm:col-span-3">{when}</p>}
      </section>

      <section className={cn(card, "p-4 sm:p-5")} aria-label="Módulos incluidos">
        <h2 className="text-sm font-semibold text-zinc-900">Módulos de tu plan</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <li key={m.id} className={cn("flex items-center justify-between rounded-xl border px-3 py-2 text-sm", m.included ? "border-zinc-200 text-zinc-800" : "border-dashed border-zinc-200 text-zinc-400")}>
              {m.label}
              <span className="text-[11px] font-semibold">{m.included ? "Incluido" : "No incluido"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={cn(card, "p-4 sm:p-5")} aria-label="Facturas">
        <h2 className="text-sm font-semibold text-zinc-900">Facturas</h2>
        <p className="mt-2 text-sm text-zinc-500">Próximamente: facturas de tu plan.</p>
      </section>
    </div>
  );
}
