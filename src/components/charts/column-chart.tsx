"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Table2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ChartSeries {
  key: string;
  label: string;
  /** Color de la marca. El texto nunca usa este color. */
  color: string;
}

export interface ChartDatum {
  key: string;
  /** Etiqueta corta del eje (p. ej. "Mar 27" o "14 h") */
  label: string;
  /** Etiqueta completa para el tooltip y la tabla */
  title: string;
  values: Record<string, number>;
}

interface Props {
  data: ChartDatum[];
  series: ChartSeries[];
  height?: number;
  format: (n: number) => string;
  /** Formato corto para el eje Y */
  formatTick?: (n: number) => string;
  /** Columna destacada (p. ej. hoy o la hora actual); el resto se ve igual. */
  highlightKey?: string;
  /** Cada cuántas columnas se rotula el eje X (las demás quedan en el tooltip). */
  labelEvery?: number;
  ariaLabel: string;
  emptyText?: string;
}

const PAD = { top: 12, right: 8, bottom: 24, left: 44 };
const GAP = 2; // separación entre segmentos apilados
const RADIUS = 4;

/** Escala "bonita" para el eje: 0 y 3 a 4 marcas redondas. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => round(i * step));
}
const round = (n: number) => Math.round(n * 100) / 100;

/** Rectángulo con esquinas redondeadas solo arriba (extremo del dato); la base queda recta sobre el eje. */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/**
 * Columnas (apiladas si hay varias series) con tooltip al pasar el mouse o enfocar con el teclado,
 * leyenda cuando hay 2 o más series y una vista de tabla con los mismos números.
 */
export function ColumnChart({ data, series, height = 220, format, formatTick = format, highlightKey, labelEvery = 1, ariaLabel, emptyText = "Sin datos" }: Props) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const id = useId();

  const totals = useMemo(() => data.map((d) => series.reduce((s, x) => s + (d.values[x.key] ?? 0), 0)), [data, series]);
  const max = Math.max(0, ...totals);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const band = data.length ? innerW / data.length : 0;
  const barW = Math.max(2, Math.min(24, band * 0.62));
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const empty = max === 0;
  const flipTooltip = (i: number) => PAD.left + band * i + band / 2 > width - 180;

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.length > 1 &&
          series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-zinc-600">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
        <button type="button" onClick={() => setAsTable((v) => !v)} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800" aria-pressed={asTable}>
          {asTable ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />} {asTable ? "Ver gráfico" : "Ver tabla"}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-[260px] overflow-auto rounded-xl border border-zinc-200">
          <table className="w-full text-sm">
            <caption className="sr-only">{ariaLabel}</caption>
            <thead>
              <tr className="border-b border-zinc-200 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <th scope="col" className="px-3 py-2 font-semibold"> </th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="px-3 py-2 text-right font-semibold">{s.label}</th>
                ))}
                {series.length > 1 && <th scope="col" className="px-3 py-2 text-right font-semibold">Total</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {data.map((d, i) => (
                <tr key={d.key}>
                  <th scope="row" className="px-3 py-1.5 text-left font-normal text-zinc-600">{d.title}</th>
                  {series.map((s) => (
                    <td key={s.key} className="px-3 py-1.5 text-right tabular-nums">{format(d.values[s.key] ?? 0)}</td>
                  ))}
                  {series.length > 1 && <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{format(totals[i] ?? 0)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrapRef} className="relative w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
          {width > 0 && (
            <svg width={width} height={height} role="img" aria-labelledby={`${id}-t`} className="block overflow-visible">
              <title id={`${id}-t`}>{ariaLabel}</title>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#d4d4d8" : "#f1f1f3"} />
                  <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-zinc-400 text-[10px] tabular-nums">
                    {formatTick(t)}
                  </text>
                </g>
              ))}
              {data.map((d, i) => {
                const cx = PAD.left + band * i + band / 2;
                const x = cx - barW / 2;
                let acc = 0;
                const visible = series.filter((s) => (d.values[s.key] ?? 0) > 0);
                const isHi = hover === i || (hover === null && d.key === highlightKey);
                return (
                  <g key={d.key} opacity={hover !== null && hover !== i ? 0.45 : 1}>
                    {visible.map((s, si) => {
                      const v = d.values[s.key] ?? 0;
                      const y0 = y(acc);
                      acc += v;
                      const y1 = y(acc);
                      const isTop = si === visible.length - 1;
                      const h = Math.max(1, y0 - y1 - (si > 0 ? GAP : 0));
                      const yy = y1;
                      return isTop ? <path key={s.key} d={topRounded(x, yy, barW, h, RADIUS)} fill={s.color} /> : <rect key={s.key} x={x} y={yy} width={barW} height={h} fill={s.color} />;
                    })}
                    {(i % labelEvery === 0 || d.key === highlightKey) && (
                      <text x={cx} y={height - 8} textAnchor="middle" className={cn("text-[10px]", isHi ? "fill-zinc-900 font-semibold" : "fill-zinc-500")}>
                        {d.label}
                      </text>
                    )}
                    {/* Zona de interacción más grande que la columna */}
                    <rect
                      x={PAD.left + band * i}
                      y={PAD.top}
                      width={band}
                      height={innerH}
                      fill="transparent"
                      tabIndex={0}
                      role="button"
                      aria-label={`${d.title}: ${format(totals[i] ?? 0)}`}
                      onMouseEnter={() => setHover(i)}
                      onFocus={() => setHover(i)}
                      onBlur={() => setHover(null)}
                      className="cursor-default outline-none"
                    />
                  </g>
                );
              })}
            </svg>
          )}
          {empty && <p className="absolute inset-0 grid place-items-center text-sm text-zinc-400">{emptyText}</p>}
          {hover !== null && data[hover] && width > 0 && (
            <div
              className={cn("pointer-events-none absolute z-10 min-w-[150px] whitespace-nowrap rounded-xl bg-zinc-900 px-3 py-2 text-xs text-white shadow-lg", flipTooltip(hover) && "-translate-x-full")}
              /* Al costado de la columna (no encima) para no tapar el dato; cerca del borde derecho se pasa al otro lado */
              style={{ left: PAD.left + band * hover + band / 2 + (flipTooltip(hover) ? -(barW / 2 + 8) : barW / 2 + 8), top: Math.min(Math.max(0, y(totals[hover] ?? 0) - 8), height - 110) }}
              role="status"
            >
              <p className="font-semibold">{data[hover].title}</p>
              {series.map((s) => (
                <p key={s.key} className="mt-0.5 flex items-center justify-between gap-3 tabular-nums">
                  <span className="inline-flex items-center gap-1.5 text-white/70">
                    <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                    {s.label}
                  </span>
                  {format(data[hover]!.values[s.key] ?? 0)}
                </p>
              ))}
              {series.length > 1 && <p className="mt-1 flex justify-between border-t border-white/15 pt-1 font-semibold tabular-nums"><span>Total</span>{format(totals[hover] ?? 0)}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
