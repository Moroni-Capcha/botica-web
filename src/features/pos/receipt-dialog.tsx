"use client";

import { Plus, Printer } from "lucide-react";
import type { Branch, Pharmacy, Product, Sale } from "@/lib/api/types";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { dateShort, timeShort } from "@/lib/format";
import { PrintRoot, SaleTicket, printTicket } from "@/features/vouchers/ticket";

const PAY: Record<Sale["payment"]["method"], string> = { efectivo: "Efectivo", yape: "Yape / Plin", tarjeta: "Tarjeta" };

/** Vista del comprobante emitido. El ticket de 80 mm se imprime desde aquí; el QR y el hash los agrega el proveedor de facturación electrónica. */
export function ReceiptDialog({ sale, pharmacy, branch, products, provisional = false, onClose }: { sale: Sale; pharmacy: Pharmacy; branch: Branch | undefined; products: Map<number, Product>; provisional?: boolean; onClose: () => void }) {
  const title = sale.document.type === "factura" ? "Factura" : "Boleta";
  return (
    <Dialog
      title={provisional ? "Venta guardada sin conexión" : "Venta registrada"}
      description={provisional ? `Ticket provisional ${sale.number} · se enviará al volver el internet` : `${title} ${sale.number} · stock descontado por lote`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={printTicket}>
            <Printer className="h-4 w-4" aria-hidden /> Imprimir ticket 80 mm
          </Button>
          <Button variant="primary" onClick={onClose}>
            <Plus className="h-4 w-4" aria-hidden /> Nueva venta
          </Button>
        </>
      }
    >
      <div className="mx-auto max-w-sm rounded-2xl border border-dashed border-line-strong bg-subtle p-5 font-mono text-caption leading-relaxed text-fg">
        <div className="text-center">
          <p className="text-sm font-bold">{pharmacy.name.toUpperCase()}</p>
          <p>RUC {pharmacy.ruc}</p>
          {branch && <p>{branch.name} · {branch.address}</p>}
          <p className="mt-2 font-bold">{provisional ? "TICKET PROVISIONAL" : `${title.toUpperCase()} ${sale.document.type === "boleta" ? "DE VENTA " : ""}ELECTRÓNICA`}</p>
          {provisional && <p className="text-micro">Sin valor tributario: la {title.toLowerCase()} electrónica oficial se emite al enviar la venta.</p>}
          <p className="font-bold">{sale.number}</p>
        </div>
        <p className="mt-2">Fecha: {dateShort(sale.createdAt)} {timeShort(sale.createdAt)}</p>
        <p>Cliente: {sale.document.customerName || "Cliente varios"}</p>
        {sale.document.customerDocId && <p>{sale.document.type === "factura" ? "RUC" : "DNI"}: {sale.document.customerDocId}</p>}
        <div className="my-2 border-t border-dashed border-line-strong" />
        {sale.items.map((it, i) => {
          const p = products.get(it.productId);
          return (
            <div key={i} className="mb-1.5">
              <p className="flex justify-between gap-2">
                <span className="min-w-0 truncate">{it.qty} × {p ? `${p.name} ${p.conc}` : `Producto ${it.productId}`}</span>
                <span className="tabular-nums">{it.total.toFixed(2)}</span>
              </p>
              <p className="text-micro text-muted">
                {it.presentationLabel} · {it.lots.map((l) => `L:${l.code} V:${dateShort(l.expiresOn)}`).join(" · ")}
                {it.discount > 0 ? ` · Dcto ${Math.round(it.discount * 100)}%` : ""}
              </p>
            </div>
          );
        })}
        <div className="my-2 border-t border-dashed border-line-strong" />
        <p className="flex justify-between"><span>OP. GRAVADA</span><span>{sale.taxBase.toFixed(2)}</span></p>
        <p className="flex justify-between"><span>IGV 18%</span><span>{sale.igv.toFixed(2)}</span></p>
        <p className="flex justify-between text-sm font-bold"><span>TOTAL S/</span><span>{sale.total.toFixed(2)}</span></p>
        <p className="mt-1">
          Pago: {PAY[sale.payment.method]}
          {sale.payment.method === "efectivo" ? ` · Recibido ${sale.payment.received.toFixed(2)} · Vuelto ${sale.payment.change.toFixed(2)}` : ""}
        </p>
        {sale.prescription && <p className="mt-1">Receta {sale.prescription.number} · {sale.prescription.doctor} · CMP {sale.prescription.cmp}</p>}
        {sale.approvedBy && <p>Dispensado por {sale.approvedBy}</p>}
        <p className="mt-1">Atendido por: {sale.sellerName}</p>
      </div>
      <PrintRoot>
        <SaleTicket sale={sale} pharmacy={pharmacy} branch={branch} products={products} provisional={provisional} />
      </PrintRoot>
    </Dialog>
  );
}
