"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { CircleAlert, KeyRound, Lock, Pencil, Plus, Power, RotateCcw, Save, Store, TriangleAlert, UserRound } from "lucide-react";
import type { Branch, BranchInput, BranchSeries, Pharmacy, StaffAccount } from "@/lib/api/types";
import type { PublicConfig } from "@/lib/api";
import { errorMessage } from "@/lib/api";
import { useAccounts, useBranchSeries, useConfig, useSetBranchActive, useUpdateBranch, useUpdatePharmacy, useUpdateRules } from "@/lib/queries";
import { useSessionStore } from "@/lib/auth/session-store";
import { daysUntil } from "@/lib/domain/pharmacy";
import { branchErrors, contrast, docNumber, hasErrors, isHex, pharmacyErrors, planUsage, rulesErrors, RULE_LIMITS, toneShift, type Rules } from "@/lib/domain/settings";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Field, Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Table, td } from "@/components/ui/table";
import { notify } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useBranchLots } from "@/features/shared/branch-scope";
import { AccountDialog } from "./account-dialog";
import { CloseBranchDialog, NewBranchDialog } from "./branch-dialogs";

type Tab = "botica" | "locales" | "cuentas" | "reglas";
const card = "rounded-2xl border border-zinc-200 bg-white";
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function SettingsScreen() {
  const isAdmin = useSessionStore((s) => s.session?.user.role === "admin");
  const config = useConfig();
  const [tab, setTab] = useState<Tab>("botica");

  if (!isAdmin) {
    return (
      <Empty icon={Lock} title="Solo el administrador cambia los ajustes">
        Si algo de la botica o de tu local está mal, avísale al administrador.
      </Empty>
    );
  }
  if (config.error) {
    return (
      <Empty icon={TriangleAlert} title="No se pudieron cargar los ajustes">
        {errorMessage(config.error)}
      </Empty>
    );
  }
  const c = config.data;

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4 sm:p-6">
      <Segmented<Tab>
        label="Sección"
        value={tab}
        onChange={setTab}
        options={[
          { id: "botica", label: "Botica" },
          { id: "locales", label: "Locales y comprobantes" },
          { id: "cuentas", label: "Cuentas y PIN" },
          { id: "reglas", label: "Reglas" },
        ]}
      />
      {!c ? (
        <div className={cn(card, "h-72 animate-pulse bg-zinc-50")} />
      ) : tab === "botica" ? (
        <PharmacyForm key={JSON.stringify(c.pharmacy)} initial={c.pharmacy} />
      ) : tab === "locales" ? (
        <Branches config={c} />
      ) : tab === "cuentas" ? (
        <Accounts branches={c.branches} closed={c.closedBranches} />
      ) : (
        <RulesForm key={JSON.stringify([c.expiry, c.purchasing, c.attendance])} config={c} />
      )}
    </div>
  );
}

function SaveBar({ dirty, loading, error, onSave, onReset, children }: { dirty: boolean; loading: boolean; error: unknown; onSave: () => void; onReset: () => void; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 px-4 py-3 sm:px-5">
      <div className="mr-auto min-w-0 text-sm">
        {error ? <p className="text-rose-600" role="alert">{errorMessage(error)}</p> : children ?? <p className="text-zinc-500">{dirty ? "Tienes cambios sin guardar." : "Sin cambios."}</p>}
      </div>
      <Button onClick={onReset} disabled={!dirty || loading}>Descartar</Button>
      <Button variant="primary" onClick={onSave} loading={loading} disabled={!dirty}>
        <Save className="h-4 w-4" /> Guardar
      </Button>
    </div>
  );
}

function Section({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="px-4 pt-4 sm:px-5 sm:pt-5">
      <div className="flex items-start gap-2">
        <div className="mr-auto min-w-0">
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/* ------------------------------ Botica ------------------------------ */

function ColorField({ label, value, onChange, error, hint }: { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string }) {
  return (
    <Field label={label} error={error} hint={hint}>
      <div className="flex gap-2">
        <input type="color" value={isHex(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-10 w-12 shrink-0 cursor-pointer rounded-xl border border-zinc-200 bg-white p-1" aria-label={`${label}: elegir`} />
        <Input value={value} onChange={(e) => onChange(e.target.value.trim())} maxLength={7} className="font-mono uppercase" aria-invalid={!!error} />
      </div>
    </Field>
  );
}

function PharmacyForm({ initial }: { initial: Pharmacy }) {
  const [f, setF] = useState(initial);
  const save = useUpdatePharmacy();
  const set = <K extends keyof Pharmacy>(k: K, v: Pharmacy[K]) => setF((x) => ({ ...x, [k]: v }));
  const errors = pharmacyErrors(f);
  const dirty = !same(f, initial);
  const ratio = isHex(f.brand) ? contrast(f.brand, "#ffffff") : null;
  const preview = { "--brand": isHex(f.brand) ? f.brand : initial.brand, "--accent": isHex(f.accent) ? f.accent : initial.accent } as CSSProperties;

  const submit = () => {
    if (hasErrors(errors)) return;
    save.mutate(f, { onSuccess: () => notify("Datos de la botica guardados. Los colores ya se aplicaron.") });
  };

  return (
    <section className={card} aria-label="Datos de la botica">
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div>
          <Section title="Datos de la botica" description="Salen en la pantalla de ingreso, en los comprobantes y en los Excel.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre comercial" error={errors.name} className="sm:col-span-2">
                <Input value={f.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
              </Field>
              <Field label="Lema o descripción corta" error={errors.tagline} className="sm:col-span-2">
                <Input value={f.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Botica · Atención farmacéutica" />
              </Field>
              <Field label="RUC" error={errors.ruc}>
                <Input inputMode="numeric" maxLength={11} value={f.ruc} onChange={(e) => set("ruc", e.target.value.replace(/\D/g, ""))} className="tabular-nums" aria-invalid={!!errors.ruc} />
              </Field>
              <Field label="Teléfono" error={errors.phone}>
                <Input inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
              </Field>
            </div>
          </Section>
          <Section title="Colores" description="El principal va en botones, la barra lateral y los Excel; el de acento, en detalles.">
            <div className="grid gap-3 pb-4 sm:grid-cols-2 sm:pb-5">
              <ColorField label="Color principal" value={f.brand} onChange={(v) => set("brand", v)} error={errors.brand} hint={ratio ? `Contraste con texto blanco: ${ratio.toLocaleString("es-PE")} (mínimo 4,5)` : undefined} />
              <ColorField label="Color de acento" value={f.accent} onChange={(v) => set("accent", v)} error={errors.accent} />
            </div>
          </Section>
        </div>
        <div className="border-t border-zinc-100 p-4 sm:p-5 lg:border-l lg:border-t-0" style={preview}>
          <p className="text-xs font-medium text-zinc-600">Vista previa</p>
          <div className="mt-2 overflow-hidden rounded-2xl border border-zinc-200">
            <div className="flex items-center gap-3 bg-brand p-4 text-white">
              <BrandMark size={40} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{f.name || "Nombre de la botica"}</p>
                <p className="truncate text-xs text-white/70">{f.tagline || "Lema"}</p>
              </div>
            </div>
            <div className="grid gap-2 bg-white p-4">
              <Button variant="primary">Cobrar S/ 24,50</Button>
              <p className="flex items-center gap-2 text-xs text-zinc-600">
                <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden /> Caja abierta
              </p>
              <p className="text-[11px] text-zinc-400">RUC {f.ruc || "—"} · {f.phone || "sin teléfono"}</p>
            </div>
          </div>
        </div>
      </div>
      <SaveBar dirty={dirty} loading={save.isPending} error={save.error} onSave={submit} onReset={() => setF(initial)}>
        {dirty && hasErrors(errors) ? <p className="text-rose-600">Corrige lo marcado para guardar.</p> : undefined}
      </SaveBar>
    </section>
  );
}

/* ------------------------------ Locales ------------------------------ */

function Branches({ config }: { config: PublicConfig }) {
  const series = useBranchSeries();
  const setActive = useSetBranchActive();
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState<Branch | null>(null);
  const all = [...config.branches, ...config.closedBranches];
  const plan = planUsage(all, config.plan.maxBranches);
  const pct = Math.min(100, Math.round((plan.active / Math.max(1, plan.max)) * 100));

  const reactivate = (b: Branch) =>
    setActive.mutate({ id: b.id, active: true }, { onSuccess: () => notify(`${b.name} está activo otra vez. Reactiva su cuenta y su personal en Cuentas y en Asistencia.`), onError: (e) => notify(errorMessage(e), "warn") });

  return (
    <div className="grid gap-4">
      <section className={cn(card, "flex flex-wrap items-center gap-4 p-4 sm:p-5")} aria-label="Locales del plan">
        <div className="mr-auto min-w-0">
          <h2 className="text-sm font-semibold text-zinc-900">
            Usas {plan.active} de {plan.max} {plan.max === 1 ? "local" : "locales"} · {config.plan.name}
          </h2>
          <div className="mt-2 h-2 w-56 max-w-full overflow-hidden rounded-full bg-zinc-100" role="meter" aria-valuemin={0} aria-valuemax={plan.max} aria-valuenow={plan.active} aria-label="Locales activos del plan">
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-zinc-500">
            {plan.canAdd ? `Puedes abrir ${plan.left === 1 ? "1 local más" : `${plan.left} locales más`}.` : "Llegaste al tope de tu plan. Para abrir otro local, amplía el plan con Digi!HME o desactiva uno."}
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)} disabled={!plan.canAdd}>
          <Plus className="h-4 w-4" /> Nuevo local
        </Button>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        {config.branches.map((b) => (
          <BranchForm key={JSON.stringify(b)} branch={b} branches={all} series={series.data?.find((s) => s.branchId === b.id)} onClose={config.branches.length > 1 ? () => setClosing(b) : undefined} />
        ))}
      </div>
      {config.closedBranches.length > 0 && (
        <section className={cn(card, "overflow-hidden")} aria-label="Locales desactivados">
          <h2 className="px-4 pt-4 text-sm font-semibold text-zinc-900 sm:px-5">Locales desactivados</h2>
          <p className="px-4 pb-2 text-xs text-zinc-500 sm:px-5">Ya no venden ni reciben mercadería. Su historial sigue en Reportes, Caja y el kardex.</p>
          <ul className="divide-y divide-zinc-100">
            {config.closedBranches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <Store className="h-4 w-4 text-zinc-400" aria-hidden />
                <div className="mr-auto min-w-0">
                  <p className="text-sm font-medium text-zinc-700">{b.name}</p>
                  <p className="truncate text-xs text-zinc-500">{b.address} · serie {b.series}</p>
                </div>
                <Button size="sm" onClick={() => reactivate(b)} disabled={!plan.canAdd || setActive.isPending} title={plan.canAdd ? undefined : "Tu plan no tiene cupo para otro local activo"}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reactivar
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-zinc-500">
        Cada serie nueva debe darse de alta en SUNAT y en el proveedor de facturación electrónica antes de emitir comprobantes; coordínalo con soporte de Digi!HME.
      </p>
      {creating && <NewBranchDialog branches={all} onClose={() => setCreating(false)} />}
      {closing && <CloseBranchDialog branch={closing} activeCount={config.branches.length} onClose={() => setClosing(null)} />}
    </div>
  );
}

function BranchForm({ branch, branches, series, onClose }: { branch: Branch; branches: Branch[]; series: BranchSeries | undefined; onClose?: () => void }) {
  const initial: BranchInput = { name: branch.name, address: branch.address, series: branch.series };
  const [f, setF] = useState(initial);
  const save = useUpdateBranch();
  const set = <K extends keyof BranchInput>(k: K, v: BranchInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const errors = branchErrors(f, branches, branch.id);
  const dirty = !same(f, initial);
  const seriesChanged = f.series !== branch.series;

  const submit = () => {
    if (hasErrors(errors)) return;
    save.mutate({ id: branch.id, input: f }, { onSuccess: () => notify(`${f.name.trim()} actualizado`) });
  };

  return (
    <section className={card} aria-label={`Local ${branch.name}`}>
      <Section
        title={branch.name}
        description={`Código interno: ${branch.id}`}
        action={
          onClose && (
            <Button size="sm" variant="ghost" onClick={onClose}>
              <Power className="h-3.5 w-3.5" /> Desactivar
            </Button>
          )
        }
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <Field label="Nombre" error={errors.name}>
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
          </Field>
          <Field label="Serie" error={errors.series}>
            <Input inputMode="numeric" maxLength={3} value={f.series} onChange={(e) => set("series", e.target.value.replace(/\D/g, ""))} className="font-mono tabular-nums" aria-invalid={!!errors.series} />
          </Field>
          <Field label="Dirección" error={errors.address} className="sm:col-span-2">
            <Input value={f.address} onChange={(e) => set("address", e.target.value)} aria-invalid={!!errors.address} />
          </Field>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 pb-4 text-xs sm:pb-5">
          {(["boleta", "factura"] as const).map((t) => (
            <div key={t} className="rounded-xl bg-zinc-50 px-3 py-2">
              <dt className="text-zinc-500">Próxima {t}</dt>
              <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-zinc-900">
                {series ? docNumber(t, branch.series, (t === "boleta" ? series.lastBoleta : series.lastFactura) + 1) : "…"}
              </dd>
            </div>
          ))}
        </dl>
      </Section>
      <SaveBar dirty={dirty} loading={save.isPending} error={save.error} onSave={submit} onReset={() => setF(initial)}>
        {seriesChanged && !errors.series ? (
          <p className="flex items-start gap-1.5 text-amber-700">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> La serie {f.series} debe estar autorizada en SUNAT. Los comprobantes seguirán desde el último emitido en esa serie.
          </p>
        ) : undefined}
      </SaveBar>
    </section>
  );
}

/* ------------------------------ Cuentas ------------------------------ */

function Accounts({ branches, closed }: { branches: Branch[]; closed: Branch[] }) {
  const accounts = useAccounts();
  const me = useSessionStore((s) => s.session?.user.id ?? "");
  const [editing, setEditing] = useState<StaffAccount | "new" | null>(null);
  const list = accounts.data ?? [];
  const branchName = (id: string | null) => {
    const open = branches.find((b) => b.id === id);
    if (open) return open.name;
    const c = closed.find((b) => b.id === id);
    return c ? `${c.name} (desactivado)` : "—";
  };

  return (
    <section className={cn(card, "overflow-hidden")} aria-label="Cuentas">
      <div className="flex flex-wrap items-start gap-3 p-4 sm:p-5">
        <div className="mr-auto min-w-0">
          <h2 className="text-sm font-semibold text-zinc-900">Cuentas para ingresar</h2>
          <p className="mt-0.5 max-w-xl text-xs text-zinc-500">
            El administrador ve todos los locales y los reportes; cada cuenta de local vende, cobra y recibe solo en el suyo. El PIN para marcar asistencia de cada trabajador se cambia en{" "}
            <Link href="/asistencia" className="font-semibold text-brand underline">Asistencia</Link>.
          </p>
        </div>
        <Button variant="primary" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Nueva cuenta
        </Button>
      </div>
      {accounts.error ? (
        <p className="px-5 pb-5 text-sm text-rose-600">{errorMessage(accounts.error)}</p>
      ) : (
        <Table head={["Nombre", "Rol", "Local", "Estado", { label: "", align: "right" }]} minWidth={560}>
          {accounts.isLoading && (
            <tr>
              <td colSpan={5} className={cn(td, "text-zinc-400")}>Cargando…</td>
            </tr>
          )}
          {list.map((a) => (
            <tr key={a.id} className={cn(!a.active && "text-zinc-400")}>
              <td className={td}>
                <span className="flex items-center gap-2 font-medium">
                  <UserRound className="h-4 w-4 text-zinc-400" /> {a.name}
                  {a.id === me && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">Tú</span>}
                </span>
              </td>
              <td className={td}>{a.role === "admin" ? "Administrador" : "Cuenta de local"}</td>
              <td className={td}>{a.role === "admin" ? "Todos" : branchName(a.branchId)}</td>
              <td className={td}>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", a.active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500")}>{a.active ? "Activa" : "Desactivada"}</span>
              </td>
              <td className={cn(td, "text-right")}>
                <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <p className="flex items-center gap-1.5 border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500 sm:px-5">
        <KeyRound className="h-3.5 w-3.5" /> Al cambiar el PIN, el rol o el local de una cuenta, o al desactivarla, se cierran sus sesiones abiertas.
      </p>
      {editing && <AccountDialog account={editing === "new" ? null : editing} accounts={list} branches={branches} currentUserId={me} onClose={() => setEditing(null)} />}
    </section>
  );
}

/* ------------------------------ Reglas ------------------------------ */

function NumberField({ label, unit, value, onChange, error, hint }: { label: string; unit: string; value: number; onChange: (v: number) => void; error?: string; hint?: string }) {
  return (
    <Field label={label} error={error} hint={hint}>
      <div className="flex items-center gap-2">
        <Input type="number" inputMode="numeric" value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))} className="w-24 tabular-nums" aria-invalid={!!error} />
        <span className="text-sm text-zinc-500">{unit}</span>
      </div>
    </Field>
  );
}

function RulesForm({ config }: { config: PublicConfig }) {
  const initial: Rules = { expiry: config.expiry, purchasing: config.purchasing, attendance: config.attendance };
  const [f, setF] = useState<Rules>(initial);
  const save = useUpdateRules();
  const lots = useBranchLots(config.branches.map((b) => b.id));
  const [now] = useState(() => Date.now());
  const errors = rulesErrors(f);
  const dirty = !same(f, initial);
  const set = <G extends keyof Rules>(g: G, k: keyof Rules[G], v: number) => setF((x) => ({ ...x, [g]: { ...x[g], [k]: v } }));
  const lim = (k: keyof typeof RULE_LIMITS) => `De ${RULE_LIMITS[k][0]} a ${RULE_LIMITS[k][1]}`;
  const daysLeft = useMemo(() => lots.lots.filter((l) => l.qty > 0).map((l) => daysUntil(l.expiresOn, now)), [lots.lots, now]);
  const shift = !errors["expiry.red"] && !errors["expiry.yellow"] && !same(f.expiry, initial.expiry) ? toneShift(daysLeft, initial.expiry, f.expiry) : null;

  const submit = () => {
    if (hasErrors(errors)) return;
    save.mutate(f, { onSuccess: () => notify("Reglas guardadas. Ya se aplican en todos los módulos.") });
  };

  return (
    <section className={card} aria-label="Reglas de operación">
      <Section title="Vencimientos" description="Arman el semáforo de lotes en Vencimientos, Inventario, Traslados y el Panel.">
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField label="Crítico (rojo) hasta" unit="días" value={f.expiry.red} onChange={(v) => set("expiry", "red", v)} error={errors["expiry.red"]} hint={lim("expiry.red")} />
          <NumberField label="Por vencer (ámbar) hasta" unit="días" value={f.expiry.yellow} onChange={(v) => set("expiry", "yellow", v)} error={errors["expiry.yellow"]} hint={lim("expiry.yellow")} />
        </div>
        {shift && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Con estos plazos {shift.changed === 1 ? "cambia de color 1 lote" : `cambian de color ${shift.changed} lotes`}: críticos {shift.before.critico} → {shift.after.critico}, por vencer {shift.before.por_vencer} → {shift.after.por_vencer}.
          </p>
        )}
      </Section>
      <Section title="Compras" description="Para el pedido sugerido y la revisión al recibir mercadería.">
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField label="El pedido cubre" unit="días de venta" value={f.purchasing.coverDays} onChange={(v) => set("purchasing", "coverDays", v)} error={errors["purchasing.coverDays"]} hint={`${lim("purchasing.coverDays")}, además del stock mínimo`} />
          <NumberField label="Vida útil mínima al recibir" unit="días" value={f.purchasing.minShelfDays} onChange={(v) => set("purchasing", "minShelfDays", v)} error={errors["purchasing.minShelfDays"]} hint={`${lim("purchasing.minShelfDays")}. Un lote que vence antes recibe una advertencia`} />
        </div>
      </Section>
      <Section title="Asistencia" description="Para tardanzas, horas trabajadas y horas extra.">
        <div className="grid gap-3 pb-4 sm:grid-cols-3 sm:pb-5">
          <NumberField label="Tolerancia de ingreso" unit="min" value={f.attendance.toleranceMinutes} onChange={(v) => set("attendance", "toleranceMinutes", v)} error={errors["attendance.toleranceMinutes"]} hint={lim("attendance.toleranceMinutes")} />
          <NumberField label="Refrigerio" unit="min" value={f.attendance.breakMinutes} onChange={(v) => set("attendance", "breakMinutes", v)} error={errors["attendance.breakMinutes"]} hint={`${lim("attendance.breakMinutes")}. Se descuenta si no lo marcan`} />
          <NumberField label="Horas extra desde" unit="min" value={f.attendance.overtimeAfterMinutes} onChange={(v) => set("attendance", "overtimeAfterMinutes", v)} error={errors["attendance.overtimeAfterMinutes"]} hint={`${lim("attendance.overtimeAfterMinutes")} después del horario`} />
        </div>
      </Section>
      <SaveBar dirty={dirty} loading={save.isPending} error={save.error} onSave={submit} onReset={() => setF(initial)}>
        {dirty && hasErrors(errors) ? <p className="text-rose-600">Corrige lo marcado para guardar.</p> : undefined}
      </SaveBar>
    </section>
  );
}
