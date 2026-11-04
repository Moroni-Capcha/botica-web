"use client";

import { CircleCheck, Lock, ShieldAlert, Stethoscope, TriangleAlert } from "lucide-react";
import type { Product } from "@/lib/api/types";
import { deadStock, prescriptionBook, type GroupRow } from "@/lib/domain/reports";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Empty } from "@/components/ui/empty";
import { Table, td } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { dateShort, soles, timeShort } from "@/lib/format";

const fmtInt = (n: number) => n.toLocaleString("es-PE");
const fmtPct = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 1 });

type DeadRows = ReturnType<typeof deadStock>;
type BookEntries = ReturnType<typeof prescriptionBook>;
interface Labels {
  multi: boolean;
  branchName: (id: string) => string;
}

/** Margen bajo (menos de 15 %): rojo, con icono y texto oculto para que el color no vaya solo. */
function MarginText({ margin }: { margin: number }) {
  const low = margin < 15;
  return (
    <span className={cn("tabular-nums", low ? "font-semibold text-danger-fg" : "text-fg-2")}>
      {low && (
        <>
          <TriangleAlert className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden />
          <span className="sr-only">Margen bajo: </span>
        </>
      )}
      {fmtPct(margin)} %
    </span>
  );
}

function ShareBar({ share, max }: { share: number; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-28 rounded-full bg-sunken">
        <div className="h-full rounded-full bg-brand" style={{ width: `${(share / max) * 100}%` }} />
      </div>
      <span className="w-12 text-right text-caption tabular-nums text-muted">{fmtPct(share * 100)} %</span>
    </div>
  );
}

/** Ventas agrupadas (producto, laboratorio, tipo, local, vendedor o pago): tabla ancha o tarjetas. */
export function GroupTable({ rows, first, wide }: { rows: GroupRow[]; first: string; wide: boolean }) {
  const max = Math.max(...rows.map((r) => r.share), 0.0001);
  if (!wide) {
    return (
      <ul className="grid gap-2 p-3">
        {rows.map((r) => (
          <li key={r.key}>
            <Card padding="sm">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-semibold text-fg">{r.label}</p>
                <p className="shrink-0 font-semibold tabular-nums text-fg">{soles(r.total)}</p>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-line-soft pt-2 text-caption text-muted">
                <div>
                  <dt>Unidades</dt>
                  <dd className="mt-0.5 text-small tabular-nums text-fg">{fmtInt(r.units)}</dd>
                </div>
                <div>
                  <dt>Comprob.</dt>
                  <dd className="mt-0.5 text-small tabular-nums text-fg-2">{fmtInt(r.tickets)}</dd>
                </div>
                <div>
                  <dt>Devuelto</dt>
                  <dd className="mt-0.5 text-small tabular-nums text-fg-2">{r.returns > 0 ? `−${soles(r.returns)}` : "—"}</dd>
                </div>
                <div>
                  <dt>Utilidad</dt>
                  <dd className="mt-0.5 text-small tabular-nums text-fg">{soles(r.profit)}</dd>
                </div>
                <div>
                  <dt>Margen</dt>
                  <dd className="mt-0.5 text-small">
                    <MarginText margin={r.margin} />
                  </dd>
                </div>
              </dl>
              <div className="mt-2">
                <ShareBar share={r.share} max={max} />
              </div>
            </Card>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="max-h-[560px] overflow-y-auto">
      <Table minWidth={940} head={[first, { label: "Unidades", align: "right" }, { label: "Comprob.", align: "right" }, { label: "Devuelto", align: "right" }, { label: "Venta neta", align: "right" }, { label: "Utilidad", align: "right" }, { label: "Margen", align: "right" }, "Participación"]}>
        {rows.map((r) => (
          <tr key={r.key}>
            <td className={cn(td, "font-medium text-fg")}>{r.label}</td>
            <td className={cn(td, "text-right tabular-nums")}>{fmtInt(r.units)}</td>
            <td className={cn(td, "text-right tabular-nums text-fg-2")}>{fmtInt(r.tickets)}</td>
            <td className={cn(td, "whitespace-nowrap text-right tabular-nums text-fg-2")}>{r.returns > 0 ? `−${soles(r.returns)}` : "—"}</td>
            <td className={cn(td, "whitespace-nowrap text-right font-semibold tabular-nums")}>{soles(r.total)}</td>
            <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{soles(r.profit)}</td>
            <td className={cn(td, "whitespace-nowrap text-right")}>
              <MarginText margin={r.margin} />
            </td>
            <td className={td}>
              <ShareBar share={r.share} max={max} />
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/** Productos con stock que no se vendieron en el periodo. */
export function DeadStockTable({ rows, multi, branchName, wide }: { rows: DeadRows; wide: boolean } & Labels) {
  if (!rows.length) return <Empty icon={CircleCheck} title="Todo lo que hay en stock se vendió en el periodo" />;
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <>
      <p className="flex items-center gap-2 px-4 pt-3 text-caption text-muted sm:px-5">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden /> {soles(total)} a costo inmovilizado en {rows.length} {rows.length === 1 ? "producto" : "productos"} que no se vendieron. Considera trasladarlos, ponerlos en exhibición o no volver a comprarlos.
      </p>
      {wide ? (
        <div className="max-h-[560px] overflow-y-auto">
          <Table minWidth={760} head={["Producto", ...(multi ? ["Local"] : []), "Tipo", { label: "Stock", align: "right" }, { label: "Valor a costo", align: "right" }, { label: "Días en stock", align: "right" }]}>
            {rows.map((r) => (
              <tr key={`${r.branchId}-${r.product.id}`}>
                <td className={td}>
                  <p className="font-medium text-fg">
                    {r.product.name} <span className="text-muted">{r.product.conc}</span>
                  </p>
                  <p className="text-caption text-muted">{r.product.lab}</p>
                </td>
                {multi && <td className={cn(td, "text-caption font-semibold")}>{branchName(r.branchId)}</td>}
                <td className={cn(td, "text-caption text-fg-2")}>{r.product.category}</td>
                <td className={cn(td, "text-right tabular-nums")}>{fmtInt(r.units)}</td>
                <td className={cn(td, "whitespace-nowrap text-right font-semibold tabular-nums")}>{soles(r.value)}</td>
                <td className={cn(td, "text-right tabular-nums text-fg-2")}>{r.daysInStock ?? "—"}</td>
              </tr>
            ))}
          </Table>
        </div>
      ) : (
        <ul className="grid gap-2 p-3">
          {rows.map((r) => (
            <li key={`${r.branchId}-${r.product.id}`}>
              <Card padding="sm">
                <p className="font-semibold text-fg">
                  {r.product.name} <span className="font-normal text-muted">{r.product.conc}</span>
                </p>
                <p className="text-caption text-muted">
                  {r.product.lab} · {r.product.category}
                  {multi && ` · ${branchName(r.branchId)}`}
                </p>
                <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line-soft pt-2 text-caption text-muted">
                  <div>
                    <dt>Stock</dt>
                    <dd className="mt-0.5 text-small tabular-nums text-fg">{fmtInt(r.units)}</dd>
                  </div>
                  <div>
                    <dt>Valor a costo</dt>
                    <dd className="mt-0.5 text-small font-semibold tabular-nums text-fg">{soles(r.value)}</dd>
                  </div>
                  <div className="text-right">
                    <dt>Días en stock</dt>
                    <dd className="mt-0.5 text-small tabular-nums text-fg-2">{r.daysInStock ?? "—"}</dd>
                  </div>
                </dl>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Libro de recetas (DIGEMID): los controlados van marcados con icono y texto. */
export function PrescriptionTable({ entries, pm, multi, branchName, wide }: { entries: BookEntries; pm: Map<number, Product>; wide: boolean } & Labels) {
  if (!entries.length) return <Empty icon={Stethoscope} title="Sin ventas con receta en el periodo" />;
  const itemsText = (e: BookEntries[number]) => e.items.map((i) => `${i.qty} ${i.presentationLabel.toLowerCase()} ${pm.get(i.productId)?.name ?? ""}`).join(" · ");
  const controlled = (
    <Chip tone="special">
      <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden /> Controlado
    </Chip>
  );
  return (
    <>
      <p className="px-4 pt-3 text-caption text-muted sm:px-5">Registro de dispensación con receta para la inspección de DIGEMID. Los controlados van marcados.</p>
      {wide ? (
        <div className="max-h-[560px] overflow-y-auto">
          <Table minWidth={900} head={["Fecha", ...(multi ? ["Local"] : []), "Comprobante", "Receta", "Médico (CMP)", "Productos", "Dispensó"]}>
            {entries.map((e) => (
              <tr key={e.saleId}>
                <td className={cn(td, "whitespace-nowrap text-caption tabular-nums text-fg-2")}>
                  {dateShort(e.at)} {timeShort(e.at)}
                </td>
                {multi && <td className={cn(td, "text-caption font-semibold")}>{branchName(e.branchId)}</td>}
                <td className={cn(td, "whitespace-nowrap tabular-nums")}>{e.number}</td>
                <td className={cn(td, "whitespace-nowrap tabular-nums")}>
                  {e.prescription.number}
                  {e.controlled && <span className="ml-1.5">{controlled}</span>}
                </td>
                <td className={cn(td, "text-caption")}>
                  {e.prescription.doctor} <span className="tabular-nums text-muted">({e.prescription.cmp})</span>
                </td>
                <td className={cn(td, "text-caption text-fg-2")}>{itemsText(e)}</td>
                <td className={cn(td, "text-caption text-fg-2")}>{e.sellerName}</td>
              </tr>
            ))}
          </Table>
        </div>
      ) : (
        <ul className="grid gap-2 p-3">
          {entries.map((e) => (
            <li key={e.saleId}>
              <Card padding="sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold tabular-nums text-fg">{e.number}</p>
                    <p className="text-caption tabular-nums text-muted">
                      {dateShort(e.at)} {timeShort(e.at)}
                      {multi && ` · ${branchName(e.branchId)}`}
                    </p>
                  </div>
                  {e.controlled && controlled}
                </div>
                <dl className="mt-3 grid gap-2 border-t border-line-soft pt-2 text-caption text-muted">
                  <div>
                    <dt>Receta</dt>
                    <dd className="mt-0.5 text-small tabular-nums text-fg">
                      {e.prescription.number} · {e.prescription.doctor} <span className="text-muted">({e.prescription.cmp})</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Productos</dt>
                    <dd className="mt-0.5 text-small text-fg-2">{itemsText(e)}</dd>
                  </div>
                  <div>
                    <dt>Dispensó</dt>
                    <dd className="mt-0.5 text-small text-fg-2">{e.sellerName}</dd>
                  </div>
                </dl>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
