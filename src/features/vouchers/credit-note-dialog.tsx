"use client";

import { useMemo, useState } from "react";
import { FilePlus2 } from "lucide-react";
import type { CreditNote, CreditReasonCode, Product, Voucher } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useCreateCreditNote } from "@/lib/queries";
import { CREDIT_REASONS, creditReasonOf, creditableLines, creditedTotalOf, planCreditNote } from "@/lib/domain/vouchers";
import { round2 } from "@/lib/domain/pharmacy";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { notify } from "@/components/ui/toast";
import { soles } from "@/lib/format";

/** Nota de crédito sobre un comprobante aceptado: total, por producto o solo un importe. */
export function CreditNoteDialog({ voucher, products, onClose, onDone }: { voucher: Voucher; products: Map<number, Product>; onClose: () => void; onDone: (note: CreditNote) => void }) {
  const [code, setCode] = useState<CreditReasonCode>("07");
  const [detail, setDetail] = useState("");
  const [qty, setQty] = useState<Record<number, number>>({});
  const [amount, setAmount] = useState("");
  const [returnStock, setReturnStock] = useState(true);
  const mutation = useCreateCreditNote();

  const reason = creditReasonOf(code)!;
  const lines = useMemo(() => creditableLines(voucher.sale, voucher.creditNotes), [voucher]);
  const remaining = round2(voucher.total - creditedTotalOf(voucher.creditNotes));
  const input = useMemo(
    () => ({
      reasonCode: code,
      note: detail,
      items: Object.entries(qty).map(([lineIndex, q]) => ({ lineIndex: Number(lineIndex), qty: q })),
      amount: Number(amount.replace(",", ".")) || 0,
    }),
    [code, detail, qty, amount],
  );
  const plan = useMemo(() => planCreditNote(voucher.sale, voucher.creditNotes, input), [voucher, input]);

  const submit = () => {
    if (!plan.ok) return;
    mutation.mutate(
      {
        voucherId: voucher.id,
        input: {
          reasonCode: code, note: detail.trim(),
          ...(reason.kind === "items" ? { items: input.items.filter((i) => i.qty > 0) } : {}),
          ...(reason.kind === "amount" ? { amount: input.amount } : {}),
          ...(reason.stock ? { returnStock } : {}),
        },
      },
      {
        onSuccess: (n) => {
          notify(`${n.number} emitida por ${soles(n.total)}${n.returnedToStock ? ": la mercadería volvió al stock" : ""}`);
          onDone(n);
        },
      },
    );
  };

  return (
    <Dialog
      title={`Nota de crédito sobre ${voucher.number}`}
      description={`Corrige el comprobante sin anularlo. Por acreditar quedan ${soles(remaining)} de ${soles(voucher.total)}.`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          {mutation.error ? (
            <p className="mr-auto text-sm text-rose-600" role="alert">{errorMessage(mutation.error)}</p>
          ) : (
            <p className="mr-auto text-sm text-zinc-600">{plan.ok ? <>Se acredita <b className="tabular-nums">{soles(plan.total)}</b></> : plan.error}</p>
          )}
          <Button onClick={onClose}>Volver</Button>
          <Button variant="primary" disabled={!plan.ok} loading={mutation.isPending} onClick={submit}>
            <FilePlus2 className="h-4 w-4" /> Emitir nota
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
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Motivo" hint={reason.hint}>
            <Select value={code} onChange={(e) => setCode(e.target.value as CreditReasonCode)}>
              {CREDIT_REASONS.map((r) => (
                <option key={r.code} value={r.code}>{r.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Detalle" hint="Se imprime en la nota.">
            <Input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Ej.: el cliente devolvió un blíster" maxLength={160} />
          </Field>
        </div>

        {reason.kind === "items" && (
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200" aria-label="Productos a devolver">
            {lines.map((c) => {
              const p = products.get(c.line.productId);
              return (
                <li key={c.lineIndex} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 basis-48">
                    <b className="font-medium">{p ? `${p.name} ${p.conc}` : `Producto ${c.line.productId}`}</b>
                    <span className="block text-xs text-zinc-500">
                      {c.line.presentationLabel} · vendió {c.line.qty}
                      {c.creditedQty > 0 ? ` · ya se devolvió ${c.creditedQty}` : ""} · {soles(c.line.total)}
                    </span>
                  </span>
                  <Input
                    type="number" inputMode="numeric" min={0} max={c.remainingQty} step={1}
                    disabled={c.remainingQty === 0}
                    aria-label={`Cantidad a devolver de ${p?.name ?? c.line.productId}`}
                    className="w-20 text-right tabular-nums"
                    value={qty[c.lineIndex] ?? ""}
                    placeholder="0"
                    onChange={(e) => setQty((prev) => ({ ...prev, [c.lineIndex]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                  />
                  <span className="w-12 text-xs text-zinc-500">de {c.remainingQty}</span>
                </li>
              );
            })}
          </ul>
        )}

        {reason.kind === "total" && (
          <p className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700">
            Se acredita todo el comprobante: {voucher.sale.items.length} {voucher.sale.items.length === 1 ? "producto" : "productos"} por {soles(voucher.total)}.
          </p>
        )}

        {reason.kind === "amount" && (
          <Field label="Importe a acreditar (S/)" hint={`Máximo ${soles(remaining)}, con IGV incluido.`}>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="max-w-40 tabular-nums" />
          </Field>
        )}

        {reason.stock && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={returnStock} onChange={(e) => setReturnStock(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
            <span>
              La mercadería vuelve al stock
              <span className="block text-xs text-zinc-500">Entra al kardex como devolución, en los lotes de la venta. Quita la marca si el producto no se puede volver a vender.</span>
            </span>
          </label>
        )}
        {!reason.stock && <p className="text-xs text-zinc-500">Este motivo no mueve el stock. El reembolso del dinero se registra aparte, como egreso de caja.</p>}
      </form>
    </Dialog>
  );
}
