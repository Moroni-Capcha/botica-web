"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import type { AccountInput, Branch, Role, StaffAccount } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { accountErrors, accountGuard } from "@/lib/domain/settings";
import { useSaveAccount } from "@/lib/queries";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { notify } from "@/components/ui/toast";

export function AccountDialog({ account, accounts, branches, currentUserId, onClose }: { account: StaffAccount | null; accounts: StaffAccount[]; branches: Branch[]; currentUserId: string; onClose: () => void }) {
  const [f, setF] = useState<AccountInput>(() =>
    account ? { name: account.name, role: account.role, branchId: account.branchId, pin: "", active: account.active } : { name: "", role: "encargado", branchId: branches[0]?.id ?? null, pin: "", active: true },
  );
  const [tried, setTried] = useState(false);
  const save = useSaveAccount();
  const set = <K extends keyof AccountInput>(k: K, v: AccountInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const input: AccountInput = { ...f, branchId: f.role === "admin" ? null : f.branchId };
  const errors = accountErrors(input, accounts, branches, account?.id ?? null);
  const guard = accountGuard(accounts, account?.id ?? null, input, currentUserId);
  const isMe = account?.id === currentUserId;

  const submit = () => {
    setTried(true);
    if (Object.keys(errors).length || guard) return;
    save.mutate(
      { id: account?.id, input },
      {
        onSuccess: () => {
          notify(account ? "Cuenta actualizada" : "Cuenta creada. Ya aparece en la pantalla de ingreso.");
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      title={account ? `Editar ${account.name}` : "Nueva cuenta"}
      onClose={onClose}
      footer={
        <>
          {(save.error || (tried && guard)) && <p className="mr-auto text-sm text-rose-600" role="alert">{save.error ? errorMessage(save.error) : guard}</p>}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            <Save className="h-4 w-4" /> Guardar
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Nombre que aparece al ingresar" error={tried ? errors.name : undefined} className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Q.F. Ana Paz" aria-invalid={tried && !!errors.name} />
        </Field>
        <div className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-zinc-600">Rol</span>
          <Segmented<Role>
            label="Rol"
            full
            value={f.role}
            onChange={(r) => set("role", r)}
            options={[
              { id: "encargado", label: "Cuenta de local" },
              { id: "admin", label: "Administrador" },
            ]}
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            {f.role === "admin" ? "Ve y opera todos los locales, reportes, asistencia y ajustes." : "Vende, cobra, recibe y traslada solo en su local. La usa el químico farmacéutico a cargo."}
          </p>
        </div>
        {f.role === "encargado" && (
          <Field label="Local" error={tried ? errors.branchId : undefined}>
            <Select value={f.branchId ?? ""} onChange={(e) => set("branchId", e.target.value || null)}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={account ? "Nuevo PIN (vacío = no cambia)" : "PIN para ingresar"} error={tried || f.pin.length === 4 ? errors.pin : undefined} hint="4 dígitos, ni repetidos ni seguidos">
          <Input inputMode="numeric" maxLength={4} value={f.pin} onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))} className="tabular-nums tracking-[0.3em]" autoComplete="new-password" aria-invalid={tried && !!errors.pin} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={f.active} disabled={isMe} onChange={(e) => set("active", e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          Activa (aparece en la pantalla de ingreso){isMe && <span className="text-xs text-zinc-400"> · no puedes desactivar tu propia cuenta</span>}
        </label>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
