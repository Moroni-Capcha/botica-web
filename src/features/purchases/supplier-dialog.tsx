"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import type { Supplier, SupplierInput } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { isValidRuc } from "@/lib/domain/pharmacy";
import { useSaveSupplier } from "@/lib/queries";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { notify } from "@/components/ui/toast";

const EMPTY: SupplierInput = { name: "", ruc: "", contact: "", phone: "", visitDays: "", active: true };

export function SupplierDialog({ supplier, suppliers, onClose }: { supplier: Supplier | null; suppliers: Supplier[]; onClose: () => void }) {
  const [f, setF] = useState<SupplierInput>(() => {
    if (!supplier) return EMPTY;
    const { id: _id, ...rest } = supplier;
    return rest;
  });
  const [tried, setTried] = useState(false);
  const save = useSaveSupplier();
  const set = <K extends keyof SupplierInput>(k: K, v: SupplierInput[K]) => setF((x) => ({ ...x, [k]: v }));

  const errors = {
    name: f.name.trim().length < 3 ? "Escribe la razón social" : undefined,
    ruc: !isValidRuc(f.ruc) ? "11 dígitos, empieza en 10 o 20" : suppliers.some((s) => s.id !== supplier?.id && s.ruc === f.ruc) ? "Ya hay un proveedor con ese RUC" : undefined,
  };
  const ok = !errors.name && !errors.ruc;

  const submit = () => {
    setTried(true);
    if (!ok) return;
    save.mutate(
      { id: supplier?.id, input: f },
      {
        onSuccess: () => {
          notify(supplier ? "Proveedor actualizado" : "Proveedor registrado");
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      title={supplier ? `Editar ${supplier.name}` : "Nuevo proveedor"}
      onClose={onClose}
      footer={
        <>
          {save.error && <p className="mr-auto text-sm text-rose-600" role="alert">{errorMessage(save.error)}</p>}
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
        <Field label="Razón social" error={tried ? errors.name : undefined} className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Droguería Los Andes S.A.C." aria-invalid={tried && !!errors.name} />
        </Field>
        <Field label="RUC" error={tried ? errors.ruc : undefined}>
          <Input inputMode="numeric" maxLength={11} value={f.ruc} onChange={(e) => set("ruc", e.target.value.replace(/\D/g, ""))} className="tabular-nums" aria-invalid={tried && !!errors.ruc} />
        </Field>
        <Field label="Teléfono">
          <Input inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="984 221 330" />
        </Field>
        <Field label="Contacto o vendedor">
          <Input value={f.contact} onChange={(e) => set("contact", e.target.value)} />
        </Field>
        <Field label="Días de visita o despacho">
          <Input value={f.visitDays} onChange={(e) => set("visitDays", e.target.value)} placeholder="Lun · Jue" />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          Activo (aparece al registrar ingresos)
        </label>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
