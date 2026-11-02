"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Branch, CreditNote, Pharmacy, Product, Sale, VoidInfo, VoucherStatus } from "@/lib/api/types";
import { dateShort, timeShort } from "@/lib/format";

const PAY: Record<Sale["payment"]["method"], string> = { efectivo: "Efectivo", yape: "Yape / Plin", tarjeta: "Tarjeta" };
const money = (n: number) => n.toFixed(2);

/**
 * Pone su contenido fuera de la pantalla normal, al final del documento. En pantalla no se ve; al imprimir
 * (`window.print()`) es lo único que sale, en el ancho de 80 mm de la ticketera (ver `.print-root` en globals.css).
 */
export function PrintRoot({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? createPortal(<div className="print-root" aria-hidden>{children}</div>, document.body) : null;
}

/** Abre el cuadro de impresión del navegador. En la ticketera térmica se elige su impresora; el papel ya viene en 80 mm. */
export const printTicket = () => window.print();

const Rule = () => <div className="my-1.5 border-t border-dashed border-zinc-400" />;
const Row = ({ left, right, bold }: { left: ReactNode; right: ReactNode; bold?: boolean }) => (
  <p className={`flex justify-between gap-2 ${bold ? "font-bold" : ""}`}>
    <span>{left}</span>
    <span className="tabular-nums">{right}</span>
  </p>
);

function Header({ pharmacy, branch, title, number }: { pharmacy: Pharmacy | undefined; branch: Branch | undefined; title: string; number: string }) {
  return (
    <div className="text-center">
      <p className="text-[13px] font-bold">{(pharmacy?.name ?? "").toUpperCase()}</p>
      {pharmacy?.ruc && <p>RUC {pharmacy.ruc}</p>}
      {branch && <p>{branch.name}{branch.address ? ` · ${branch.address}` : ""}</p>}
      {pharmacy?.phone && <p>Tel. {pharmacy.phone}</p>}
      <p className="mt-2 font-bold">{title}</p>
      <p className="font-bold">{number}</p>
    </div>
  );
}

/** Lo que dice SUNAT del comprobante, en una línea para el pie del ticket. */
function SunatLine({ status, voided }: { status: VoucherStatus | undefined; voided?: VoidInfo | null }) {
  if (voided) return <p className="mt-1 text-center font-bold">*** COMPROBANTE ANULADO ***</p>;
  if (status === "pendiente") return <p className="mt-1 text-center">Pendiente de confirmación en SUNAT</p>;
  if (status === "rechazado") return <p className="mt-1 text-center font-bold">RECHAZADO POR SUNAT: no válido</p>;
  return null;
}

function Footer({ status, voided }: { status: VoucherStatus | undefined; voided?: VoidInfo | null }) {
  return (
    <>
      <SunatLine status={status} voided={voided} />
      <p className="mt-2 text-center text-[10px]">Representación impresa del comprobante electrónico. Puede consultarlo en sunat.gob.pe con su número.</p>
      <p className="mt-1 text-center">¡Gracias por su compra!</p>
    </>
  );
}

interface TicketBase {
  pharmacy: Pharmacy | undefined;
  branch: Branch | undefined;
  products: Map<number, Product>;
}

/** Ticket de una venta (boleta o factura). `electronic` solo se pasa cuando ya se conoce el estado ante SUNAT. */
export function SaleTicket({ sale, electronic, pharmacy, branch, products }: TicketBase & { sale: Sale; electronic?: { status: VoucherStatus; voided: VoidInfo | null } }) {
  const factura = sale.document.type === "factura";
  return (
    <div className="ticket">
      <Header pharmacy={pharmacy} branch={branch} title={factura ? "FACTURA ELECTRÓNICA" : "BOLETA DE VENTA ELECTRÓNICA"} number={sale.number} />
      <p className="mt-2">Fecha: {dateShort(sale.createdAt)} {timeShort(sale.createdAt)}</p>
      <p>Cliente: {sale.document.customerName || "Cliente varios"}</p>
      {sale.document.customerDocId && <p>{factura ? "RUC" : "DNI"}: {sale.document.customerDocId}</p>}
      <Rule />
      {sale.items.map((it, i) => {
        const p = products.get(it.productId);
        return (
          <div key={i} className="mb-1">
            <Row left={`${it.qty} × ${p ? `${p.name} ${p.conc}` : `Producto ${it.productId}`}`} right={money(it.total)} />
            <p className="text-[10px]">
              {it.presentationLabel} · {it.lots.map((l) => `L:${l.code} V:${dateShort(l.expiresOn)}`).join(" · ")}
              {it.discount > 0 ? ` · Dcto ${Math.round(it.discount * 100)}%` : ""}
            </p>
          </div>
        );
      })}
      <Rule />
      <Row left="OP. GRAVADA" right={money(sale.taxBase)} />
      <Row left="IGV 18%" right={money(sale.igv)} />
      <Row left="TOTAL S/" right={money(sale.total)} bold />
      <p className="mt-1">
        Pago: {PAY[sale.payment.method]}
        {sale.payment.method === "efectivo" ? ` · Recibido ${money(sale.payment.received)} · Vuelto ${money(sale.payment.change)}` : ""}
      </p>
      {sale.prescription && <p className="mt-1">Receta {sale.prescription.number} · {sale.prescription.doctor} · CMP {sale.prescription.cmp}</p>}
      {sale.approvedBy && <p>Dispensado por {sale.approvedBy}</p>}
      <p className="mt-1">Atendido por: {sale.sellerName}</p>
      <Footer status={electronic?.status} voided={electronic?.voided} />
    </div>
  );
}

/** Ticket de una nota de crédito. */
export function CreditNoteTicket({ note, pharmacy, branch, products }: TicketBase & { note: CreditNote }) {
  const factura = note.type === "factura";
  return (
    <div className="ticket">
      <Header pharmacy={pharmacy} branch={branch} title="NOTA DE CRÉDITO ELECTRÓNICA" number={note.number} />
      <p className="mt-2">Fecha: {dateShort(note.issuedAt)} {timeShort(note.issuedAt)}</p>
      <p>Cliente: {note.customerName || "Cliente varios"}</p>
      {note.customerDocId && <p>{factura ? "RUC" : "DNI"}: {note.customerDocId}</p>}
      <p>Modifica: {factura ? "Factura" : "Boleta"} {note.voucherNumber}</p>
      <p>Motivo: {note.reasonLabel}</p>
      {note.note && <p>Detalle: {note.note}</p>}
      <Rule />
      {note.items.length > 0 ? (
        note.items.map((it, i) => {
          const p = products.get(it.productId);
          return <Row key={i} left={`${it.qty} × ${p ? `${p.name} ${p.conc}` : `Producto ${it.productId}`}`} right={money(it.total)} />;
        })
      ) : (
        <p>{note.reasonLabel} por importe</p>
      )}
      <Rule />
      <Row left="OP. GRAVADA" right={money(note.taxBase)} />
      <Row left="IGV 18%" right={money(note.igv)} />
      <Row left="TOTAL ACREDITADO S/" right={money(note.total)} bold />
      <p className="mt-1">Emitida por: {note.userName}</p>
      <Footer status={note.status} />
    </div>
  );
}
