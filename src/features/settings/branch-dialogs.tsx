"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, Plus, Power } from "lucide-react";
import type { Branch, BranchInput } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { accountErrors, branchErrors, deactivateBlockers, hasErrors, nextSeries } from "@/lib/domain/settings";
import { useAccounts, useBranchStock, useCash, useCreateBranch, useSetBranchActive, useTransfers, useWorkers } from "@/lib/queries";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { notify } from "@/components/ui/toast";

/** Alta de un local, con su cuenta de ingreso si se marca la casilla. */
export function NewBranchDialog({ branches, onClose }: { branches: Branch[]; onClose: () => void }) {
  const [f, setF] = useState<BranchInput>(() => ({ name: "", address: "", series: nextSeries(branches) }));
  const [withAccount, setWithAccount] = useState(true);
  const [acc, setAcc] = useState({ name: "", pin: "" });
  const [tried, setTried] = useState(false);
  const accounts = useAccounts();
  const create = useCreateBranch();
  const set = <K extends keyof BranchInput>(k: K, v: BranchInput[K]) => setF((x) => ({ ...x, [k]: v }));

  const errors = branchErrors(f, branches, "");
  /* El local todavía no existe: se valida la cuenta contra un local provisional */
  const draft: Branch = { id: "__nuevo", ...f, active: true };
  const accErrors = withAccount ? accountErrors({ name: acc.name, role: "encargado", branchId: draft.id, pin: acc.pin, active: true }, accounts.data ?? [], [draft], null) : {};
  const ok = !hasErrors(errors) && !hasErrors(accErrors);

  const submit = () => {
    setTried(true);
    if (!ok) return;
    create.mutate(
      { ...f, name: f.name.trim(), address: f.address.trim(), account: withAccount ? { name: acc.name.trim(), pin: acc.pin } : null },
      {
        onSuccess: (r) => {
          notify(r.account ? `${r.branch.name} creado con la cuenta de ${r.account.name}. Abre su caja para empezar a vender.` : `${r.branch.name} creado. Crea su cuenta en Cuentas y PIN.`);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      title="Nuevo local"
      description="Empieza sin stock: cárgalo con un ingreso de compra o un traslado."
      onClose={onClose}
      footer={
        <>
          {create.error && <p className="mr-auto text-sm text-rose-600" role="alert">{errorMessage(create.error)}</p>}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={create.isPending} onClick={submit}>
            <Plus className="h-4 w-4" /> Crear local
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3 sm:grid-cols-[1fr_120px]"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Nombre" error={tried ? errors.name : undefined}>
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Sucursal Amarilis" aria-invalid={tried && !!errors.name} autoFocus />
        </Field>
        <Field label="Serie" error={tried ? errors.series : undefined} hint="Libre en tu RUC">
          <Input inputMode="numeric" maxLength={3} value={f.series} onChange={(e) => set("series", e.target.value.replace(/\D/g, ""))} className="font-mono tabular-nums" aria-invalid={tried && !!errors.series} />
        </Field>
        <Field label="Dirección" error={tried ? errors.address : undefined} className="sm:col-span-2">
          <Input value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="Jr. Huallayco 120, Amarilis" aria-invalid={tried && !!errors.address} />
        </Field>
        <fieldset className="grid gap-3 rounded-2xl border border-zinc-200 p-3 sm:col-span-2 sm:grid-cols-[1fr_140px]">
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={withAccount} onChange={(e) => setWithAccount(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
            <span>
              Crear la cuenta del local
              <span className="block text-xs text-zinc-500">La usa el químico farmacéutico a cargo para vender, cobrar y recibir en este local.</span>
            </span>
          </label>
          {withAccount && (
            <>
              <Field label="Nombre de quien la usa" error={tried ? accErrors.name : undefined}>
                <Input value={acc.name} onChange={(e) => setAcc((a) => ({ ...a, name: e.target.value }))} placeholder="Q.F. Ana Paz" aria-invalid={tried && !!accErrors.name} />
              </Field>
              <Field label="PIN" error={tried || acc.pin.length === 4 ? accErrors.pin : undefined} hint="4 dígitos">
                <Input inputMode="numeric" maxLength={4} value={acc.pin} onChange={(e) => setAcc((a) => ({ ...a, pin: e.target.value.replace(/\D/g, "") }))} className="tabular-nums tracking-[0.3em]" autoComplete="new-password" aria-invalid={tried && !!accErrors.pin} />
              </Field>
            </>
          )}
        </fieldset>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

/** Desactivar un local: muestra lo que lo impide y lo que se desactiva con él. */
export function CloseBranchDialog({ branch, activeCount, onClose }: { branch: Branch; activeCount: number; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const stock = useBranchStock();
  const cash = useCash(branch.id);
  const transfers = useTransfers(180);
  const accounts = useAccounts();
  const workers = useWorkers();
  const setActive = useSetBranchActive();

  const loading = stock.isLoading || cash.isLoading || transfers.isLoading;
  const blockers = loading
    ? []
    : deactivateBlockers({
        stockUnits: (stock.data ?? []).filter((s) => s.branchId === branch.id).reduce((a, s) => a + s.units, 0),
        cashOpen: !!cash.data?.open,
        pendingTransfers: (transfers.data ?? []).filter((t) => (t.fromBranchId === branch.id || t.toBranchId === branch.id) && (t.status === "solicitado" || t.status === "en_transito")).length,
        activeBranches: activeCount,
      });
  const ownAccounts = (accounts.data ?? []).filter((a) => a.branchId === branch.id && a.active);
  const ownWorkers = (workers.data ?? []).filter((w) => w.branchId === branch.id && w.active);
  const can = !loading && !blockers.length && reason.trim().length >= 5;

  const submit = () =>
    setActive.mutate(
      { id: branch.id, active: false, reason: reason.trim() },
      {
        onSuccess: () => {
          notify(`${branch.name} desactivado. Su historial se conserva.`);
          onClose();
        },
      },
    );

  return (
    <Dialog
      title={`Desactivar ${branch.name}`}
      description="Deja de aparecer para vender, trasladar y marcar asistencia. Las ventas, la caja y el kardex de este local se conservan en los reportes."
      onClose={onClose}
      footer={
        <>
          {setActive.error && <p className="mr-auto text-sm text-rose-600" role="alert">{errorMessage(setActive.error)}</p>}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="danger" loading={setActive.isPending} disabled={!can} onClick={submit}>
            <Power className="h-4 w-4" /> Desactivar
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {loading ? (
          <p className="text-sm text-zinc-500">Revisando stock, caja y traslados…</p>
        ) : blockers.length ? (
          <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800" role="alert">
            <p className="font-semibold">Todavía no se puede desactivar:</p>
            <ul className="mt-1 grid gap-1">
              {blockers.map((b) => (
                <li key={b} className="flex gap-1.5">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {b}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
            <CircleCheck className="h-4 w-4" /> Sin stock, con la caja cerrada y sin traslados pendientes.
          </p>
        )}
        {(ownAccounts.length > 0 || ownWorkers.length > 0) && (
          <p className="text-sm text-zinc-600">
            También se desactivan {[ownAccounts.length && `${ownAccounts.length === 1 ? "1 cuenta" : `${ownAccounts.length} cuentas`} (${ownAccounts.map((a) => a.name).join(", ")})`, ownWorkers.length && `${ownWorkers.length === 1 ? "1 trabajador" : `${ownWorkers.length} trabajadores`}`].filter(Boolean).join(" y ")}. Si alguien pasa a otro local, cámbialo antes en Cuentas o en Asistencia.
          </p>
        )}
        <Field label="Motivo" hint="Queda registrado. Ej.: cierre del local, traspaso, fin de contrato de alquiler">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
