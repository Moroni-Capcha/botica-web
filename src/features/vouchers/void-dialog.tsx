"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import type { Voucher } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useVoidVoucher } from "@/lib/queries";
import { VOID_WINDOW_DAYS, voidDeadline, voidReasonError } from "@/lib/domain/vouchers";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { notify } from "@/components/ui/toast";
import { dateShort, soles } from "@/lib/format";

/** Anular = comunicación de baja a SUNAT. Solo dentro de los 7 días de la emisión. */
export function VoidDialog({ voucher, onClose, onDone }: { voucher: Voucher; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [returnStock, setReturnStock] = useState(true);
  const mutation = useVoidVoucher();
  const problem = voidReasonError(reason);
  const submit = () => {
    if (problem) return;
    mutation.mutate(
      { id: voucher.id, input: { reason: reason.trim(), returnStock } },
      {
        onSuccess: (v) => {
          notify(`${v.number} anulado${returnStock ? ": la mercadería volvió al stock" : ""}`);
          onDone();
        },
      },
    );
  };

  return (
    <Dialog
      title={`Anular ${voucher.number}`}
      description={`Se avisa a SUNAT que este comprobante queda sin efecto. Puedes hacerlo hasta el ${dateShort(voidDeadline(voucher.issuedAt))} (${VOID_WINDOW_DAYS} días desde la emisión).`}
      onClose={onClose}
      footer={
        <>
          {mutation.error && <p className="mr-auto text-sm text-danger-fg" role="alert">{errorMessage(mutation.error)}</p>}
          <Button onClick={onClose}>Volver</Button>
          <Button variant="danger" disabled={!!problem} loading={mutation.isPending} onClick={submit}>
            <Ban className="h-4 w-4" aria-hidden /> Anular comprobante
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
        <p className="rounded-xl border border-line bg-subtle p-3 text-sm text-fg-2">
          {voucher.type === "factura" ? "Factura" : "Boleta"} {voucher.number} · {soles(voucher.total)}
          {voucher.customerName ? ` · ${voucher.customerName}` : ""}
        </p>
        <Field label="Motivo de la anulación" hint="Quedará registrado junto con quién la hizo.">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: se emitió al cliente equivocado" maxLength={160} data-autofocus />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={returnStock} onChange={(e) => setReturnStock(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-ink" />
          <span>
            La mercadería vuelve al stock
            <span className="block text-caption text-muted">Entra al kardex como devolución, en los mismos lotes de la venta. Quita la marca si el cliente se la llevó.</span>
          </span>
        </label>
        <p className="text-caption text-muted">La venta deja de contar en la caja, el panel y los reportes. Si el cliente ya se llevó el producto y pasó el plazo, usa una nota de crédito.</p>
      </form>
    </Dialog>
  );
}
