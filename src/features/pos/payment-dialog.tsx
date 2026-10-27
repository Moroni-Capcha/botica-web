"use client";

import { useState } from "react";
import { Banknote, Check, CreditCard, Smartphone, Stethoscope } from "lucide-react";
import type { Customer, DocType, PaymentMethod, Prescription, SaleRequest } from "@/lib/api/types";
import { documentIsValid, isValidCmp, quickCashAmounts, round2, type Totals } from "@/lib/domain/pharmacy";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { soles } from "@/lib/format";
import { cn } from "@/lib/cn";

type Draft = Omit<SaleRequest, "branchId" | "items">;

interface Props {
  totals: Totals;
  itemsCount: number;
  customer: Customer | null;
  yapeNumber: string;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (draft: Draft) => void;
}

const METHODS: { id: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { id: "efectivo", label: "Efectivo", icon: Banknote },
  { id: "yape", label: "Yape / Plin", icon: Smartphone },
  { id: "tarjeta", label: "Tarjeta", icon: CreditCard },
];

export function PaymentDialog({ totals, itemsCount, customer, yapeNumber, submitting, error, onClose, onConfirm }: Props) {
  const total = totals.total;
  const [doc, setDoc] = useState<DocType>(customer?.ruc ? "factura" : "boleta");
  const [docId, setDocId] = useState(customer?.ruc || customer?.dni || "");
  const [docName, setDocName] = useState(customer?.name ?? "");
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [received, setReceived] = useState("");
  const [reference, setReference] = useState("");
  const [rx, setRx] = useState<Prescription>({ number: "", doctor: "", cmp: "" });

  const rec = Number(received) || 0;
  const change = round2(rec - total);
  const docOk = documentIsValid(doc, docId, docName, total);
  const rxOk = !totals.needsRx || (rx.number.trim() !== "" && rx.doctor.trim() !== "" && isValidCmp(rx.cmp));
  const payOk = method !== "efectivo" || rec >= total;
  const ok = docOk && rxOk && payOk && !submitting;

  const switchDoc = (v: DocType) => {
    setDoc(v);
    setDocId(v === "factura" ? customer?.ruc ?? "" : customer?.dni ?? "");
    setDocName(v === "factura" && !customer?.ruc ? "" : customer?.name ?? "");
  };

  const confirm = () => {
    if (!ok) return;
    onConfirm({
      payment: { method, received: method === "efectivo" ? rec : undefined, reference: reference.trim() || undefined },
      document: { type: doc, customerDocId: docId || undefined, customerName: docName.trim() || undefined },
      customerId: customer?.id ?? null,
      prescription: totals.needsRx ? { number: rx.number.trim(), doctor: rx.doctor.trim(), cmp: rx.cmp } : null,
    });
  };

  return (
    <Dialog
      title={`Cobrar ${soles(total)}`}
      description={`${itemsCount} ${itemsCount === 1 ? "producto" : "productos"} · ${customer ? customer.name : "Cliente varios"}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          {error && <p className="mr-auto text-sm text-rose-600" role="alert">{error}</p>}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!ok} loading={submitting} onClick={confirm}>
            <Check className="h-4 w-4" /> Confirmar y emitir {doc}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-5 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          confirm();
        }}
      >
        <div className="grid content-start gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Comprobante</p>
            <Segmented full label="Tipo de comprobante" value={doc} onChange={switchDoc} options={[{ id: "boleta", label: "Boleta" }, { id: "factura", label: "Factura" }]} />
            <div className="mt-3 grid grid-cols-[1fr_1.4fr] gap-2">
              <Field label={doc === "factura" ? "RUC (11 dígitos)" : `DNI ${total > 700 ? "(obligatorio > S/ 700)" : "(opcional)"}`}>
                <Input inputMode="numeric" maxLength={doc === "factura" ? 11 : 8} value={docId} aria-invalid={docId !== "" && !docOk} onChange={(e) => setDocId(e.target.value.replace(/\D/g, ""))} className="tabular-nums" />
              </Field>
              <Field label={doc === "factura" ? "Razón social" : "Nombre"}>
                <Input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder={doc === "factura" ? "Empresa S.A.C." : "Cliente varios"} />
              </Field>
            </div>
          </div>

          {totals.needsRx && (
            <fieldset className="rounded-2xl border border-sky-200 bg-sky-50/60 p-3">
              <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold text-sky-800">
                <Stethoscope className="h-4 w-4" /> Receta médica {totals.needsControlled ? "especial (controlados)" : ""}
              </legend>
              <div className="grid grid-cols-2 gap-2">
                <Field label="N.º de receta">
                  <Input value={rx.number} onChange={(e) => setRx({ ...rx, number: e.target.value })} placeholder="R-000123" />
                </Field>
                <Field label="CMP del médico" error={rx.cmp && !isValidCmp(rx.cmp) ? "De 4 a 6 dígitos" : undefined}>
                  <Input inputMode="numeric" value={rx.cmp} onChange={(e) => setRx({ ...rx, cmp: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="45123" />
                </Field>
                <Field label="Médico que prescribe" className="col-span-2">
                  <Input value={rx.doctor} onChange={(e) => setRx({ ...rx, doctor: e.target.value })} placeholder="Dr(a). Nombre Apellido" />
                </Field>
              </div>
            </fieldset>
          )}
        </div>

        <div className="grid content-start gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Método de pago</p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Método de pago">
            {METHODS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={method === id}
                onClick={() => setMethod(id)}
                className={cn("flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-xs font-semibold transition", method === id ? "border-transparent bg-brand text-white" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50")}
              >
                <Icon className="h-5 w-5" /> {label}
              </button>
            ))}
          </div>
          {method === "efectivo" && (
            <div className="rounded-2xl bg-zinc-50 p-3">
              <Field label="Monto recibido">
                <Input inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value.replace(/[^\d.]/g, ""))} className="text-lg font-semibold tabular-nums" placeholder={total.toFixed(2)} />
              </Field>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {quickCashAmounts(total).map((v) => (
                  <button key={v} type="button" onClick={() => setReceived(String(v))} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold tabular-nums ring-1 ring-zinc-200 hover:bg-zinc-100">
                    {v - total < 1 && v === Math.ceil(total) ? `Exacto ${soles(total)}` : `S/ ${v}`}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm text-zinc-600">Vuelto</span>
                <span className={cn("text-2xl font-semibold tabular-nums", change < 0 ? "text-zinc-300" : "text-emerald-700")} aria-live="polite">
                  {soles(Math.max(0, change))}
                </span>
              </div>
            </div>
          )}
          {method === "yape" && (
            <div className="rounded-2xl bg-zinc-50 p-3 text-sm">
              <p className="text-zinc-600">El cliente yapea o plinea al número de la botica:</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{yapeNumber}</p>
              <Field label="Código de operación (opcional)" className="mt-3">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            </div>
          )}
          {method === "tarjeta" && (
            <div className="rounded-2xl bg-zinc-50 p-3 text-sm text-zinc-600">
              Pasa la tarjeta por el POS del banco y confirma cuando el voucher salga aprobado.
              <Field label="N.º de voucher (opcional)" className="mt-3">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            </div>
          )}
          <dl className="rounded-2xl border border-zinc-200 p-3 text-xs text-zinc-500">
            <div className="flex justify-between">
              <dt>Op. gravada</dt>
              <dd className="tabular-nums">{soles(totals.taxBase)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>IGV (18 %)</dt>
              <dd className="tabular-nums">{soles(totals.igv)}</dd>
            </div>
            <div className="mt-1 flex justify-between text-sm font-semibold text-zinc-900">
              <dt>Total</dt>
              <dd className="tabular-nums">{soles(total)}</dd>
            </div>
          </dl>
        </div>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
