import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { pageBounds, pageCount, pageWindow } from "@/lib/domain/pagination";
import { Button } from "./button";

export interface PaginationProps {
  /** Página actual, desde 1. */
  page: number;
  pageSize: number;
  /** Total de filas que cumplen los filtros (viene del servidor). */
  total: number;
  onPage: (page: number) => void;
  /** Cómo se llama lo que se lista, en plural: "movimientos", "clientes". */
  noun?: string;
  /** Mientras llega otra página: se bloquean los botones para no pedir dos veces. */
  busy?: boolean;
  className?: string;
}

/** Barra de páginas para listas paginadas en el servidor: "Mostrando 26 a 50 de 187", anterior, números y siguiente. */
export function Pagination({ page, pageSize, total, onPage, noun = "registros", busy, className }: PaginationProps) {
  if (total <= 0) return null;
  const pages = pageCount(total, pageSize);
  const { first, last } = pageBounds(page, pageSize, total);
  return (
    <nav aria-label="Páginas" className={cn("flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500 sm:px-5", className)}>
      <p role="status" aria-live="polite">
        Mostrando <b className="tabular-nums text-zinc-800">{first.toLocaleString("es-PE")} a {last.toLocaleString("es-PE")}</b> de <b className="tabular-nums text-zinc-800">{total.toLocaleString("es-PE")}</b> {noun}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <Button size="sm" disabled={busy || page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior">
            <ChevronLeft className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Anterior</span>
          </Button>
          <span className="hidden items-center gap-1 sm:flex">
            {pageWindow(page, pages).map((n, i) =>
              n === "…" ? (
                <span key={`gap-${i}`} className="px-1" aria-hidden>…</span>
              ) : (
                <Button key={n} size="sm" variant={n === page ? "dark" : "secondary"} disabled={busy} aria-current={n === page ? "page" : undefined} aria-label={`Página ${n}`} onClick={() => onPage(n)} className="min-w-8 px-2 tabular-nums">
                  {n}
                </Button>
              ),
            )}
          </span>
          <span className="px-2 tabular-nums sm:hidden">{page} / {pages}</span>
          <Button size="sm" disabled={busy || page >= pages} onClick={() => onPage(page + 1)} aria-label="Página siguiente">
            <span className="hidden sm:inline">Siguiente</span> <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </nav>
  );
}
