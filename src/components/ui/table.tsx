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
          <tr className="border-b border-line text-left text-micro font-semibold uppercase tracking-wide text-muted">
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
        <tbody className="divide-y divide-line-soft">{children}</tbody>
      </table>
    </div>
  );
}

/** Clase base de las celdas: mismo relleno que el encabezado. */
export const td = "px-3 py-3 align-middle first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5";

/** Clases de una fila que se abre al hacer clic o con Enter (lleva `tabIndex={0}`): resalta al pasar y muestra el foco por dentro. */
export const rowButtonClass =
  "cursor-pointer transition-colors duration-[var(--dur-fast)] hover:bg-subtle focus-visible:bg-subtle focus-visible:shadow-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand";
