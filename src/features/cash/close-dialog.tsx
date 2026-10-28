"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import type { CashClosing, CashSummary, Denominations } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { closeDifference, countDenominations, DENOMINATIONS, denominationLabel } from "@/lib/domain/cash";
import { useCloseCash } from "@/lib/queries";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { soles } from "@/lib/format";
import { cn } from "@/lib/cn";

export const TONE_TEXT = { cuadra: "text-emerald-700", faltante: "text-rose-600", sobrante: "text-amber-700" } as const;
export const TONE_LABEL = { cuadra: "Cuadra", faltante: "Faltante", sobrante: "Sobrante" } as const;

/** Arqueo por billetes y monedas. Si la diferencia es de S/ 1 o más, pide el motivo. */
export function CloseDialog({ summary, branchName, onClose, onClosed }: { summary: CashSummary; branchName: string; onClose: () => void; onClosed: (c: CashClosing) => void }) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const close = useCloseCash(summary.session.branchId);

  const denominations: Denominations = Object.fromEntries(
    Object.entries(qty)
      .map(([k, v]) => [k, Number(v) || 0] as const)
      .filter(([, v]) => v > 0),
  );
  const counted = countDenominations(denominations);
  const { difference, tone, needsNote } = closeDifference(counted, summary.expected);
  const ok = !needsNote || note.trim().length >= 5;

  const submit = () => {
    if (!ok) return;
    close.mutate({ counted, denominations, note: note.trim() }, { onSuccess: onClosed });
  };

  const group = (kind: "billete" | "moneda") => (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{kind === "billete" ? "Billetes" : "Monedas"}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {DENOMINATIONS.filter((d) => d.kind === kind).map((d) => {
          const k = String(d.value);
          const sub = (Number(qty[k]) || 0) * d.value;
          return (
            <label key={k} className="flex items-center gap-2 rounded-xl bg-zinc-50 px-2.5 py-2 text-xs">
              <span className="w-12 shrink-0 font-semibold tabular-nums">{denominationLabel(d.value)}</span>
              <span className="text-zinc-400">×</span>
              <input
                aria-label={`Cantidad de ${denominationLabel(d.value)}`}
                inputMode="numeric"
                value={qty[k] ?? ""}
                onChange={(e) => setQty((x) => ({ ...x, [k]: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
                className="h-8 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-2 text-right text-sm tabular-nums outline-none focus:border-zinc-400"
              />
              <span className="hidden w-16 shrink-0 text-right tabular-nums text-zinc-500 sm:block">{sub ? sub.toFixed(2) : ""}</span>
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <Dialog
      title={`Arqueo y cierre · ${branchName}`}
      description="Cuenta el efectivo de la caja por billete y moneda. Yape, Plin y tarjeta no se cuentan: ya están en la cuenta."
      onClose={onClose}
      size="lg"
      footer={
        <>
          {close.error && <p className="mr-auto text-sm text-rose-600" role="alert">{errorMessage(close.error)}</p>}
          <Button onClick={onClose}>Volver</Button>
          <Button variant="dark" disabled={!ok} loading={close.isPending} onClick={submit}>
            <Lock className="h-4 w-4" /> Cerrar caja
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
        {group("billete")}
        {group("moneda")}
        <dl className="grid gap-1.5 rounded-2xl border border-zinc-200 p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-600">Contado</dt>
            <dd className="text-lg font-semibold tabular-nums">{soles(counted)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-600">Debe haber</dt>
            <dd className="tabular-nums">{soles(summary.expected)}</dd>
          </div>
          <div className="flex justify-between border-t border-zinc-100 pt-1.5" aria-live="polite">
            <dt className="text-zinc-600">Diferencia</dt>
            <dd className={cn("font-semibold tabular-nums", TONE_TEXT[tone])}>
              {difference > 0 ? "+" : ""}
              {soles(difference)} · {TONE_LABEL[tone]}
            </dd>
          </div>
        </dl>
        <Field label={needsNote ? "Motivo de la diferencia (obligatorio)" : "Observación (opcional)"} error={needsNote && note.trim().length < 5 ? "Explica la diferencia para poder cerrar" : undefined}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={needsNote ? "Ej.: vuelto mal dado, billete falso, venta sin registrar" : ""} aria-invalid={needsNote && note.trim().length < 5} />
        </Field>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
