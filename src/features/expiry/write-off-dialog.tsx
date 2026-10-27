"use client";

import { useState } from "react";
import { PackageMinus } from "lucide-react";
import type { WriteOffType } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import type { LotRisk } from "@/lib/domain/expiry";
import { stockLabel } from "@/lib/domain/pharmacy";
import { useWriteOffLot } from "@/lib/queries";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { notify } from "@/components/ui/toast";
import { dateShort, soles } from "@/lib/format";

const DEFAULT_NOTE: Record<WriteOffType, (expired: boolean) => string> = {
  merma: (expired) => (expired ? "Producto vencido retirado de anaquel" : "Producto deteriorado"),
  devolucion: () => "Canje con el proveedor por vencimiento próximo",
};

/** Saca unidades de un lote: baja (merma) o devolución al proveedor. Queda registrado para el kardex. */
export function WriteOffDialog({ row, onClose }: { row: LotRisk; onClose: () => void }) {
  const expired = row.days < 0;
  const [type, setType] = useState<WriteOffType>(expired ? "merma" : "devolucion");
  const [units, setUnits] = useState(String(row.lot.qty));
  const [note, setNote] = useState(DEFAULT_NOTE[type](expired));
  const writeOff = useWriteOffLot();

  const n = Math.min(row.lot.qty, Math.max(0, Number.parseInt(units, 10) || 0));
  const ok = n > 0 && note.trim().length >= 3;

  const switchType = (t: WriteOffType) => {
    if (note === DEFAULT_NOTE[type](expired)) setNote(DEFAULT_NOTE[t](expired));
    setType(t);
  };

  const submit = () => {
    if (!ok) return;
    writeOff.mutate(
      { lotId: row.lot.id, input: { type, units: n, note: note.trim() } },
      {
        onSuccess: () => {
          notify(type === "merma" ? `Baja de ${n} unid. registrada` : `Devolución de ${n} unid. registrada`);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      title={`${row.product.name} ${row.product.conc} · lote ${row.lot.code}`}
      description={`Vence ${dateShort(row.lot.expiresOn)} · ${stockLabel(row.product, row.lot.qty)} en stock`}
      onClose={onClose}
      footer={
        <>
          {writeOff.error && <p className="mr-auto text-sm text-rose-600" role="alert">{errorMessage(writeOff.error)}</p>}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="dark" disabled={!ok} loading={writeOff.isPending} onClick={submit}>
            <PackageMinus className="h-4 w-4" /> Registrar {n} unid.
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
        <Segmented<WriteOffType> full label="Tipo de salida" value={type} onChange={switchType} options={[{ id: "merma", label: "Baja / merma" }, { id: "devolucion", label: "Devolver al proveedor" }]} />
        <p className="rounded-xl bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-600">
          {type === "merma"
            ? "Las unidades salen del stock y quedan registradas con el motivo (vencido, roto o deteriorado). Guarda el producto para la destrucción según la norma de DIGEMID."
            : `Registra el canje con ${row.lot.supplier ?? "el proveedor"}. Las unidades salen del stock y quedan registradas como devolución.`}
        </p>
        <div className="grid grid-cols-[120px_1fr] gap-3">
          <Field label="Unidades" hint={`Máx. ${row.lot.qty}`}>
            <Input inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value.replace(/\D/g, ""))} className="tabular-nums" aria-invalid={n === 0} />
          </Field>
          <Field label="Motivo">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-zinc-500">
          Valor a costo: <b className="tabular-nums text-zinc-800">{soles(n * row.lot.cost)}</b>
        </p>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
