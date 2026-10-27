"use client";

import { Plus } from "lucide-react";
import type { Branch, Pharmacy, Product, Sale } from "@/lib/api/types";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { dateShort, timeShort } from "@/lib/format";

const PAY: Record<Sale["payment"]["method"], string> = { efectivo: "Efectivo", yape: "Yape / Plin", tarjeta: "Tarjeta" };

/** Vista del comprobante emitido. La representación impresa oficial la genera el proveedor de facturación electrónica. */
export function ReceiptDialog({ sale, pharmacy, branch, products, onClose }: { sale: Sale; pharmacy: Pharmacy; branch: Branch | undefined; products: Map<number, Product>; onClose: () => void }) {
  const title = sale.document.type === "factura" ? "Factura" : "Boleta";
  return (
    <Dialog
      title="Venta registrada"
      description={`${title} ${sale.number} · stock descontado por lote`}
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          <Plus className="h-4 w-4" /> Nueva venta
        </Button>
      }
    >
      <div className="mx-auto max-w-sm rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-5 font-mono text-[12px] leading-relaxed text-zinc-800">
        <div className="text-center">
          <p className="text-sm font-bold">{pharmacy.name.toUpperCase()}</p>
          <p>RUC {pharmacy.ruc}</p>
          {branch && <p>{branch.name} · {branch.address}</p>}
          <p className="mt-2 font-bold">{title.toUpperCase()} {sale.document.type === "boleta" ? "DE VENTA " : ""}ELECTRÓNICA</p>
          <p className="font-bold">{sale.number}</p>
        </div>
        <p className="mt-2">Fecha: {dateShort(sale.createdAt)} {timeShort(sale.createdAt)}</p>
        <p>Cliente: {sale.document.customerName || "Cliente varios"}</p>
        {sale.document.customerDocId && <p>{sale.document.type === "factura" ? "RUC" : "DNI"}: {sale.document.customerDocId}</p>}
        <div className="my-2 border-t border-dashed border-zinc-300" />
        {sale.items.map((it, i) => {
          const p = products.get(it.productId);
          return (
            <div key={i} className="mb-1.5">
              <p className="flex justify-between gap-2">
                <span className="min-w-0 truncate">{it.qty} × {p ? `${p.name} ${p.conc}` : `Producto ${it.productId}`}</span>
                <span className="tabular-nums">{it.total.toFixed(2)}</span>
              </p>
              <p className="text-[11px] text-zinc-500">
                {it.presentationLabel} · {it.lots.map((l) => `L:${l.code} V:${dateShort(l.expiresOn)}`).join(" · ")}
                {it.discount > 0 ? ` · Dcto ${Math.round(it.discount * 100)}%` : ""}
              </p>
            </div>
          );
        })}
        <div className="my-2 border-t border-dashed border-zinc-300" />
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
    </Dialog>
  );
}
