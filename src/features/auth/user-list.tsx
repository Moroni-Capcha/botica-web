"use client";

import { useRef, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import type { StaffSummary } from "@/lib/api";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface UserListProps {
  staff: StaffSummary[] | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  branchName: (id: string | null) => string;
}

/** Usuarios de la botica como tarjetas grandes. Es un grupo de opciones: flechas para moverse, solo la elegida entra con Tab. */
export function UserList({ staff, loading, failed, onRetry, selectedId, onSelect, branchName }: UserListProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  if (loading) {
    return (
      <div className="grid gap-2.5" aria-busy="true" aria-label="Cargando usuarios">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-sunken" />
        ))}
      </div>
    );
  }

  if (failed) {
    return (
      <Card padding="sm" className="flex items-center justify-between gap-3 border-danger-border bg-danger-bg" role="alert">
        <p className="text-small text-danger-fg">No se pudo cargar la lista de usuarios.</p>
        <Button size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      </Card>
    );
  }

  const list = staff ?? [];
  // Sin nadie elegido, el primero recibe el foco con Tab.
  const tabbable = list.some((u) => u.id === selectedId) ? selectedId : list[0]?.id;

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + list.length) % list.length;
    const target = list[next];
    if (!target) return;
    onSelect(target.id);
    refs.current[next]?.focus();
  };

  return (
    <div className="grid gap-2.5" role="radiogroup" aria-label="Usuario">
      {list.map((u, i) => {
        const active = selectedId === u.id;
        return (
          <button
            key={u.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={u.id === tabbable ? 0 : -1}
            onClick={() => onSelect(u.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "flex min-h-16 items-center gap-3 rounded-2xl border p-3 text-left transition-[transform,background-color,border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out)] active:scale-[0.98]",
              active ? "border-brand bg-surface ring-2 ring-brand" : "border-line bg-surface hover:border-line-strong hover:bg-subtle",
            )}
          >
            <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full text-small font-semibold", active ? "bg-accent text-fg" : "bg-sunken text-fg-2")}>{initials(u.name)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-fg">{u.name}</span>
              <span className="block truncate text-caption text-fg-2">{u.role === "admin" ? `Administrador general · ${branchName(u.branchId)}` : `Cuenta ${branchName(u.branchId)}`}</span>
            </span>
            <span
              className={cn(
                "grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-white transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out)]",
                active ? "opacity-100" : "opacity-0",
              )}
              aria-hidden
            >
              <Check className="h-4 w-4" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
