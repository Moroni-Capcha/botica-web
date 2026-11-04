"use client";

import { AlarmClock, Check, CircleCheck, Clock, Lock, Minus, Receipt, type LucideIcon } from "lucide-react";
import type { PublicConfig } from "@/lib/api";
import { useAccount } from "@/lib/queries";
import { ALL_MODULES, STATUS_LABEL, daysLeft, effectiveStatus, limaDay } from "@/lib/domain/account";
import { planUsage } from "@/lib/domain/settings";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Empty } from "@/components/ui/empty";
import type { Tone } from "@/components/ui/tone";

/** Estado de la cuenta: tono + icono + texto (el color nunca va solo). */
const BADGE: Record<"trial" | "active" | "overdue" | "suspended", { tone: Tone; icon: LucideIcon }> = {
  trial: { tone: "info", icon: Clock },
  active: { tone: "success", icon: CircleCheck },
  overdue: { tone: "warning", icon: AlarmClock },
  suspended: { tone: "danger", icon: Lock },
};
const fmtDay = (d: string) => new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/** Pestaña "Plan y facturación": plan, uso de locales, estado de la cuenta y módulos incluidos. */
export function PlanBilling({ config }: { config: PublicConfig }) {
  const { data: account, isLoading, isError } = useAccount();
  const plan = planUsage([...config.branches, ...config.closedBranches], config.plan.maxBranches);
  const today = limaDay(Date.now());

  if (isLoading) return <Card padding="none" className="h-72 animate-pulse bg-sunken" aria-busy="true" />;
  if (isError || !account) return (
      <Card padding="none">
        <Empty icon={Receipt} title="No se pudo leer tu plan">Intenta de nuevo en un momento.</Empty>
      </Card>
    );

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
      <Card as="section" className="grid gap-4 sm:grid-cols-3" aria-label="Resumen del plan">
        <div>
          <p className="text-xs font-medium text-muted">Plan</p>
          <p className="mt-1 text-lg font-semibold text-fg">{config.plan.name}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted">Locales</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-fg">
            {plan.active} de {plan.max}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted">Estado de la cuenta</p>
          <p className="mt-1">
            <StatusChip status={status} />
          </p>
        </div>
        {when && <p className="text-sm text-fg-2 sm:col-span-3">{when}</p>}
      </Card>

      <Card as="section" aria-label="Módulos incluidos">
        <h2 className="text-sm font-semibold text-fg">Módulos de tu plan</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <li key={m.id} className={cn("flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm", m.included ? "border-line text-fg" : "border-dashed border-line text-muted")}>
              {m.label}
              {m.included ? (
                <Chip tone="success">
                  <Check className="h-3 w-3 shrink-0" aria-hidden /> Incluido
                </Chip>
              ) : (
                <Chip>
                  <Minus className="h-3 w-3 shrink-0" aria-hidden /> No incluido
                </Chip>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card as="section" aria-label="Facturas">
        <h2 className="text-sm font-semibold text-fg">Facturas</h2>
        <p className="mt-2 text-sm text-muted">Próximamente: facturas de tu plan.</p>
      </Card>
    </div>
  );
}

function StatusChip({ status }: { status: keyof typeof BADGE }) {
  const { tone, icon: Icon } = BADGE[status];
  return (
    <Chip tone={tone} className="px-2.5 py-1 text-xs">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> {STATUS_LABEL[status]}
    </Chip>
  );
}
