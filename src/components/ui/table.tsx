import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface HeadCell {
  label: ReactNode;
  align?: "left" | "right";
  className?: string;
}

/** Tabla con desplazamiento horizontal en pantallas chicas y encabezado fijo dentro de su contenedor. */
export function Table({ head, children, minWidth = 720, className }: { head: (HeadCell | string)[]; children: ReactNode; minWidth?: number; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-zinc-200 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            {head.map((h, i) => {
              const cell = typeof h === "string" ? { label: h } : h;
              return (
                <th key={i} scope="col" className={cn("whitespace-nowrap px-3 py-2.5 font-semibold first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5", cell.align === "right" && "text-right", cell.className)}>
                  {cell.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">{children}</tbody>
      </table>
    </div>
  );
}

/** Clase base de las celdas: mismo relleno que el encabezado. */
export const td = "px-3 py-3 align-middle first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5";
