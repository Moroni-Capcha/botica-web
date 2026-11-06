"use client";

import { useState } from "react";
import type { TenantAction, TenantSummary } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { usePlans, useUpdateTenant } from "@/lib/queries";
import { ACTION_TITLE, MAX_TRIAL_EXTENSION_DAYS, REASON_MAX, addDays, reasonError } from "@/lib/domain/platform";
import { limaDay } from "@/lib/domain/account";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { notify } from "@/components/ui/toast";
import { dateShort, soles } from "@/lib/format";

const DONE: Record<TenantAction["action"], string> = {
  change_plan: "Plan cambiado",
  extend_trial: "Prueba extendida",
  suspend: "Cuenta suspendida",
  reactivate: "Cuenta reactivada",
};

/** Pide el motivo y aplica una acción sobre una botica. El motivo queda en la auditoría de esa botica. */
export function TenantActionDialog({ tenant, kind, onClose }: { tenant: TenantSummary; kind: TenantAction["action"]; onClose: () => void }) {
  const plans = usePlans();
  const mutation = useUpdateTenant();
  const [planId, setPlanId] = useState(tenant.planId ?? "");
  const [days, setDays] = useState(14);
  const [reason, setReason] = useState("");

  const today = limaDay(Date.now());
  const problem =
    reasonError(reason) ??
    (kind === "change_plan" && (!planId || planId === tenant.planId) ? "Elige un plan distinto al actual." : null) ??
    (kind === "extend_trial" && (!Number.isInteger(days) || days < 1 || days > MAX_TRIAL_EXTENSION_DAYS) ? `Los días van de 1 a ${MAX_TRIAL_EXTENSION_DAYS}.` : null);
  const newEnd = tenant.trialEndsAt && tenant.trialEndsAt > today ? addDays(tenant.trialEndsAt, days) : addDays(today, days);

  const build = (): TenantAction => {
    const r = reason.trim();
    if (kind === "change_plan") return { action: kind, planId, reason: r };
    if (kind === "extend_trial") return { action: kind, days, reason: r };
    return { action: kind, reason: r };
  };
  const submit = () => {
    if (problem) return;
    mutation.mutate(
      { code: tenant.code, input: build() },
      {
        onSuccess: () => {
          notify(`${DONE[kind]}: ${tenant.name}`);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      title={`${ACTION_TITLE[kind]} · ${tenant.name}`}
      description={
        kind === "suspend"
          ? "La botica podrá mirar todo, pero no registrar cambios (solo lectura) hasta que la reactives."
          : kind === "reactivate"
            ? "La botica vuelve a poder registrar ventas y cambios."
            : kind === "extend_trial"
              ? "Suma días de prueba gratis. Si la prueba ya venció, se cuenta desde hoy."
              : "Cambia el límite de locales y los módulos que ve la botica."
      }
      onClose={onClose}
      footer={
        <>
          {mutation.error && <p className="mr-auto text-sm text-danger-fg" role="alert">{errorMessage(mutation.error)}</p>}
          <Button onClick={onClose}>Volver</Button>
          <Button variant={kind === "suspend" ? "danger" : "primary"} disabled={!!problem} loading={mutation.isPending} onClick={submit}>
            {ACTION_TITLE[kind]}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="rounded-xl bg-subtle p-3 text-sm text-fg-2">
          <b>{tenant.name}</b> <span className="text-muted">({tenant.code})</span> · {tenant.planName}
          {tenant.trialEndsAt && tenant.status !== "active" ? ` · prueba hasta el ${dateShort(tenant.trialEndsAt)}` : ""}
        </p>

        {kind === "change_plan" && (
          <Field label="Plan nuevo" hint={`Hoy tiene ${tenant.branches} ${tenant.branches === 1 ? "local activo" : "locales activos"}. No se puede bajar a un plan donde no quepan.`}>
            <Select value={planId} onChange={(e) => setPlanId(e.target.value)} disabled={plans.isLoading}>
              {!tenant.planId && <option value="">Elige un plan</option>}
              {(plans.data ?? []).map((p) => (
                <option key={p.id} value={p.id} disabled={p.id === tenant.planId}>
                  {p.name} · hasta {p.maxBranches} {p.maxBranches === 1 ? "local" : "locales"} · {soles(p.priceMonthly)} al mes{p.id === tenant.planId ? " (actual)" : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {kind === "extend_trial" && (
          <Field label="Días a sumar" hint={`La prueba terminaría el ${dateShort(newEnd)}.`}>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="number" min={1} max={MAX_TRIAL_EXTENSION_DAYS} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-24" />
              {[7, 14, 30].map((d) => (
                <Button key={d} size="sm" variant={days === d ? "dark" : "secondary"} onClick={() => setDays(d)}>
                  {d} días
                </Button>
              ))}
            </div>
          </Field>
        )}

        <Field label="Motivo" hint="Queda registrado en la auditoría de la botica, con tu nombre de Digi!HME.">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === "suspend" ? "Ej.: pago de octubre pendiente" : "Ej.: pidió más tiempo para decidir"} maxLength={REASON_MAX} />
        </Field>
      </form>
    </Dialog>
  );
}
