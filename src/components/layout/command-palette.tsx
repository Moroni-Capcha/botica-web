"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { User } from "@/lib/api/types";
import { navFor } from "@/lib/nav";
import { searchNav } from "@/lib/domain/nav-search";
import { useAccount } from "@/lib/queries";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

/** Evento que abre la paleta desde cualquier botón (la barra superior lo usa). */
export const OPEN_PALETTE_EVENT = "bh:open-palette";

/** Atajo y botón "Ir a…": Ctrl+K (o ⌘K) abre una búsqueda de pantallas, flechas para elegir y Enter para ir. */
export function CommandPalette({ user }: { user: User }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  return open ? <PaletteDialog user={user} onClose={() => setOpen(false)} /> : null;
}

function PaletteDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const router = useRouter();
  const modules = useAccount().data?.modules;
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const items = useMemo(() => navFor(user, modules), [user, modules]);
  const results = useMemo(() => searchNav(items, query), [items, query]);
  const current = Math.min(active, Math.max(results.length - 1, 0));

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(results.length ? (current + 1) % results.length : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(results.length ? (current - 1 + results.length) % results.length : 0);
    } else if (e.key === "Enter" && results[current]) {
      e.preventDefault();
      go(results[current].href);
    }
  };

  return (
    <Dialog title="Ir a…" description="Escribe el nombre de la pantalla. Flechas para elegir, Enter para entrar." onClose={onClose}>
      <div className="flex items-center gap-2 rounded-xl bg-sunken px-3 focus-within:outline-2 focus-within:outline-offset-0 focus-within:outline-brand-ink">
        <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <input
          data-autofocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={results[current] ? `${listId}-${results[current].id}` : undefined}
          aria-label="Buscar pantalla"
          placeholder="Vencimientos, caja, clientes…"
          className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </div>
      <ul id={listId} role="listbox" aria-label="Pantallas" className="mt-3 flex flex-col gap-1">
        {results.map((n, i) => (
          <li
            key={n.id}
            id={`${listId}-${n.id}`}
            role="option"
            aria-selected={i === current}
            onMouseMove={() => setActive(i)}
            onClick={() => go(n.href)}
            className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm", i === current ? "bg-brand text-white" : "text-fg-2")}
          >
            <n.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
            <span className="flex-1 truncate font-medium">{n.label}</span>
            <span className={cn("text-xs", i === current ? "text-white/70" : "text-muted")}>{n.group}</span>
          </li>
        ))}
        {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No hay una pantalla con ese nombre.</li>}
      </ul>
    </Dialog>
  );
}
