import type { Ref } from "react";
import { cn } from "@/lib/cn";

const fmt = (n: number) => n.toLocaleString("es-PE");

/**
 * Aviso al final de una lista que se pinta por tandas (`useIncrementalList`). Lleva el elemento que, al
 * acercarse a la pantalla, pide la tanda siguiente. `as` adapta la etiqueta al contenedor: fila de tabla,
 * elemento de lista o bloque suelto.
 */
export function ListMore({ as = "block", sentinel, shown, total, noun = "productos", className }: { as?: "row" | "item" | "block"; sentinel: Ref<HTMLElement>; shown: number; total: number; noun?: string; className?: string }) {
  const text = (
    <span ref={sentinel as Ref<HTMLSpanElement>}>
      Mostrando {fmt(shown)} de {fmt(total)} {noun}. Sigue bajando para ver más o afina la búsqueda.
    </span>
  );
  const base = "py-3 text-center text-xs text-muted";
  if (as === "row") {
    return (
      <tr>
        <td colSpan={99} className={cn(base, className)} role="status">
          {text}
        </td>
      </tr>
    );
  }
  if (as === "item") {
    return (
      <li className={cn(base, className)} role="status">
        {text}
      </li>
    );
  }
  return (
    <p className={cn(base, className)} role="status">
      {text}
    </p>
  );
}
