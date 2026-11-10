"use client";

import { useMemo, useRef, type ReactNode } from "react";
import type { LotRisk } from "@/lib/domain/expiry";
import { round2 } from "@/lib/domain/pharmacy";
import { Chip } from "@/components/ui/chip";
import { SectionLabel } from "@/components/ui/section-label";
import { Table, td } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { soles } from "@/lib/format";
import { useAnimatedList, orderAnimatedRows, type AnimatedRow } from "@/lib/use-animated-list";
import { useFlipList } from "@/lib/use-flip-list";
import { TONE } from "@/components/ui/badges";
import { LotCard, LotRow, PriorityCard, PriorityRow, TONE_ICON, type ExpShared } from "./expiry-rows";
import { groupByTone } from "./expiry-view";
import { useIncrementalList } from "@/lib/use-incremental-list";
import { ListMore } from "@/components/ui/list-more";

interface Item {
  key: string;
  row: LotRisk;
}

/**
 * Filas con salida animada: cuando un lote deja la lista tras una acción (baja total) se desvanece con opacidad + translate3d
 * y las de abajo suben con FLIP. Quien lo usa se monta con una `key` que cambia al filtrar, así filtrar no anima.
 */
function useExitingRows(rows: LotRisk[]) {
  const items = useMemo<Item[]>(() => rows.map((row) => ({ key: String(row.lot.id), row })), [rows]);
  const animated = useAnimatedList(items);
  const ordered = useMemo(() => orderAnimatedRows(animated, items), [animated, items]);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useFlipList(bodyRef, ordered);
  useFlipList(listRef, ordered);
  return { ordered, bodyRef, listRef };
}

/** Identifica el conjunto mostrado: al filtrar o cambiar de vista, la lista vuelve a la primera tanda (no al refrescar los mismos datos). */
const listKey = (rows: LotRisk[], wide: boolean) => `${wide}|${rows.length}|${rows[0]?.lot.id}|${rows[rows.length - 1]?.lot.id}`;

interface ListProps {
  rows: LotRisk[];
  wide: boolean;
  shared: ExpShared;
  stagIds: Map<number, number>;
}

/** Lista de "Prioridad de venta": de mayor a menor pérdida, con casilla para aplicar descuento a varios lotes. */
export function PriorityList({ rows, wide, shared, stagIds, selected, allSelected, onToggleAll }: ListProps & { selected: ReadonlySet<number>; allSelected: boolean; onToggleAll: () => void }) {
  const { ordered, bodyRef, listRef } = useExitingRows(rows);
  const list = useIncrementalList(ordered.length, listKey(rows, wide));
  const render = ({ key, item, exiting }: AnimatedRow<Item>) => {
    const props = { row: item.row, exiting, stag: exiting ? -1 : (stagIds.get(item.row.lot.id) ?? -1), checked: selected.has(item.row.lot.id), ...shared };
    return wide ? <PriorityRow key={key} {...props} /> : <PriorityCard key={key} {...props} />;
  };
  const shown = ordered.slice(0, list.limit);
  if (!wide) {
    return (
      <ul ref={listRef} className="grid gap-2 p-3">
        {shown.map(render)}
        {list.more && <ListMore as="item" sentinel={list.sentinel} shown={list.limit} total={ordered.length} noun="lotes" />}
      </ul>
    );
  }
  return (
    <Table
      bodyRef={bodyRef}
      maxHeight={640}
      minWidth={1100}
      head={[
        { label: <input type="checkbox" checked={allSelected} onChange={onToggleAll} className="h-4 w-4 accent-brand-ink" aria-label="Elegir todos los lotes" /> },
        "Producto",
        "Lote",
        "Vence",
        { label: "Stock lote", align: "right" },
        { label: "Venta actual", align: "right" },
        { label: "Necesaria", align: "right" },
        { label: "En riesgo", align: "right" },
        { label: "Pérdida", align: "right" },
        { label: <span className="sr-only">Acciones</span> },
      ]}
    >
      {shown.map(render)}
      {list.more && <ListMore as="row" sentinel={list.sentinel} shown={list.limit} total={ordered.length} noun="lotes" />}
    </Table>
  );
}

function GroupHeader({ tone, rows, as }: { tone: LotRisk["tone"]; rows: LotRisk[]; as: "row" | "item" }) {
  const Icon = TONE_ICON[tone];
  const value = round2(rows.reduce((s, r) => s + r.value, 0));
  const content = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      <SectionLabel as="h3">{TONE[tone].label}</SectionLabel>
      <Chip>
        {rows.length} {rows.length === 1 ? "lote" : "lotes"}
      </Chip>
      <span className="text-caption tabular-nums text-muted">{soles(value)} a costo</span>
    </div>
  );
  if (as === "item") return <li className="px-1 pt-2">{content}</li>;
  return (
    <tr className="bg-subtle">
      <td colSpan={8} className={cn(td, "py-2")}>
        {content}
      </td>
    </tr>
  );
}

/** "Todos los lotes", del que vence antes al que vence después, con un encabezado por grupo del semáforo. */
export function LotList({ rows, wide, shared, stagIds }: ListProps) {
  const { ordered, bodyRef, listRef } = useExitingRows(rows);
  const list = useIncrementalList(ordered.length, listKey(rows, wide));
  /* Los encabezados de grupo salen de las filas que siguen en la lista (no de las que se están yendo). */
  const live = useMemo(() => ordered.filter((r) => !r.exiting).map((r) => r.item.row), [ordered]);
  const groupRows = useMemo(() => new Map(groupByTone(live).map((g) => [g.tone, g.rows])), [live]);
  const out: ReactNode[] = [];
  let prev: string | null = null;
  let count = 0;
  for (const { key, item, exiting } of ordered) {
    if (count++ >= list.limit) break;
    const r = item.row;
    if (r.tone !== prev) {
      prev = r.tone;
      const g = groupRows.get(r.tone);
      if (g) out.push(<GroupHeader key={`g-${r.tone}`} tone={r.tone} rows={g} as={wide ? "row" : "item"} />);
    }
    const props = { row: r, exiting, stag: exiting ? -1 : (stagIds.get(r.lot.id) ?? -1), checked: false, ...shared };
    out.push(wide ? <LotRow key={key} {...props} /> : <LotCard key={key} {...props} />);
  }
  if (list.more) out.push(<ListMore key="more" as={wide ? "row" : "item"} sentinel={list.sentinel} shown={list.limit} total={ordered.length} noun="lotes" />);
  if (!wide) return <ul ref={listRef} className="grid gap-2 p-3">{out}</ul>;
  return (
    <Table bodyRef={bodyRef} maxHeight={640} minWidth={1060} head={["Producto", "Lote", "Vencimiento", { label: "Cantidad", align: "right" }, { label: "Valor costo", align: "right" }, "Proveedor", "Ingreso", { label: <span className="sr-only">Acciones</span> }]}>
      {out}
    </Table>
  );
}
