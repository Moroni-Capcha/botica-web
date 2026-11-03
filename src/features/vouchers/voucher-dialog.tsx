"use client";

import type { ReactNode } from "react";
import { Ban, FilePlus2, Printer, Send } from "lucide-react";
import type { Branch, Pharmacy, Product } from "@/lib/api/types";
import { KIND_LABEL, canResend, creditedTotalOf, voidBlocker, type VoucherRow } from "@/lib/domain/vouchers";
import { round2 } from "@/lib/domain/pharmacy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { SectionLabel } from "@/components/ui/section-label";
import { dateShort, soles, timeShort } from "@/lib/format";
import { StatusBadge } from "./status-badge";
import { CreditNoteTicket, PrintRoot, SaleTicket, printTicket } from "./ticket";

interface Props {
  row: VoucherRow;
  now: number;
  pharmacy: Pharmacy | undefined;
  branch: Branch | undefined;
  products: Map<number, Product>;
  /** false con la cuenta suspendida (solo lectura) */
  writable: boolean;
  resending: boolean;
  onResend: () => void;
  onVoid: () => void;
  onCredit: () => void;
  onClose: () => void;
}

const Item = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-micro font-semibold uppercase tracking-wide text-muted">{label}</dt>
    <dd className="mt-0.5 text-sm">{children}</dd>
  </div>
);

/** Todo lo de un comprobante: respuesta de SUNAT, notas, ticket de 80 mm y las acciones que le corresponden. */
export function VoucherDialog({ row, now, pharmacy, branch, products, writable, resending, onResend, onVoid, onCredit, onClose }: Props) {
  const { voucher, note } = row;
  const blocker = voucher ? voidBlocker(voucher, now) : null;
  const remaining = voucher ? round2(voucher.total - creditedTotalOf(voucher.creditNotes)) : 0;
  const canCredit = !!voucher && voucher.status === "aceptado" && remaining > 0;
  const readOnlyTip = writable ? undefined : "Tu cuenta está en solo lectura";

  return (
    <Dialog
      title={`${KIND_LABEL[row.kind]} ${row.number}`}
      description={`${dateShort(row.issuedAt)} ${timeShort(row.issuedAt)}${branch ? ` · ${branch.name}` : ""}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={printTicket}>
            <Printer className="h-4 w-4" aria-hidden /> Imprimir ticket 80 mm
          </Button>
          {canResend(row.status) && (
            <Button variant="primary" loading={resending} disabled={!writable} title={readOnlyTip} onClick={onResend}>
              <Send className="h-4 w-4" aria-hidden /> Reenviar a SUNAT
            </Button>
          )}
          {canCredit && (
            <Button disabled={!writable} title={readOnlyTip} onClick={onCredit}>
              <FilePlus2 className="h-4 w-4" aria-hidden /> Nota de crédito
            </Button>
          )}
          {voucher && voucher.status === "aceptado" && (
            <Button variant="danger" disabled={!writable || !!blocker} title={readOnlyTip ?? blocker ?? undefined} onClick={onVoid}>
              <Ban className="h-4 w-4" aria-hidden /> Anular
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[1fr_auto]">
        <div className="grid min-w-0 content-start gap-4">
          <Card as="section" padding="sm" className="rounded-xl" aria-label="Respuesta de SUNAT">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={row.status} />
              <span className="text-caption text-muted">{row.attempts === 1 ? "1 envío" : `${row.attempts} envíos`}</span>
            </div>
            {row.sunat ? (
              <p className="mt-2 text-sm">
                <b className="tabular-nums">{row.sunat.code}</b> · {row.sunat.message}
                <span className="block text-caption text-muted">{dateShort(row.sunat.at)} {timeShort(row.sunat.at)}</span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-fg-2">SUNAT todavía no responde. Puedes reenviarlo.</p>
            )}
            {voucher?.voided && (
              <p className="mt-2 text-sm text-fg-2">
                Anulado por {voucher.voided.by} el {dateShort(voucher.voided.at)}: “{voucher.voided.reason}”
                <span className="block text-caption text-muted">Ticket de baja {voucher.voided.ticket}</span>
              </p>
            )}
          </Card>

          <dl className="grid grid-cols-2 gap-3">
            <Item label="Cliente">{row.customerName || "Cliente varios"}</Item>
            <Item label={row.kind === "factura" || (note && note.type === "factura") ? "RUC" : "DNI"}>{row.customerDocId || "—"}</Item>
            <Item label="Importe">{soles(row.total)}</Item>
            <Item label="IGV (18 %)">{soles(voucher?.igv ?? note?.igv ?? 0)}</Item>
            {note && (
              <>
                <Item label="Modifica a">{note.voucherNumber}</Item>
                <Item label="Motivo">{note.reasonLabel}</Item>
                <Item label="Detalle">{note.note}</Item>
                <Item label="Stock">{note.returnedToStock ? "La mercadería volvió al stock" : "No movió el stock"}</Item>
              </>
            )}
          </dl>

          {voucher && voucher.creditNotes.length > 0 && (
            <section aria-label="Notas de crédito">
              <SectionLabel as="h3">Notas de crédito</SectionLabel>
              <ul className="mt-1.5 divide-y divide-line-soft rounded-xl border border-line text-sm">
                {voucher.creditNotes.map((n) => (
                  <li key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <b className="tabular-nums">{n.number}</b>
                    <span className="min-w-0 flex-1 text-caption text-fg-2">{n.reasonLabel}</span>
                    <span className="tabular-nums">{soles(n.total)}</span>
                    <StatusBadge status={n.status} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {voucher && voucher.status === "aceptado" && blocker && <p className="text-caption text-muted">No se puede anular: {blocker}</p>}
        </div>

        <div className="max-h-[60dvh] overflow-auto rounded-xl bg-sunken p-2" role="region" aria-label="Vista del ticket" tabIndex={0}>
          <div className="mx-auto w-fit shadow-subtle">
            {voucher ? (
              <SaleTicket sale={voucher.sale} electronic={{ status: voucher.status, voided: voucher.voided }} pharmacy={pharmacy} branch={branch} products={products} />
            ) : (
              note && <CreditNoteTicket note={note} pharmacy={pharmacy} branch={branch} products={products} />
            )}
          </div>
        </div>
      </div>

      <PrintRoot>
        {voucher ? (
          <SaleTicket sale={voucher.sale} electronic={{ status: voucher.status, voided: voucher.voided }} pharmacy={pharmacy} branch={branch} products={products} />
        ) : (
          note && <CreditNoteTicket note={note} pharmacy={pharmacy} branch={branch} products={products} />
        )}
      </PrintRoot>
    </Dialog>
  );
}
