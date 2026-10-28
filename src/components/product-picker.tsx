"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import type { Product } from "@/lib/api/types";
import { inputClass } from "@/components/ui/field";
import { cn } from "@/lib/cn";

const label = (p: Product) => `${p.name} ${p.conc}`.trim();

/**
 * Buscador de productos con teclado (flechas, Enter, Escape). Busca por nombre, principio activo,
 * laboratorio o código de barras; si se escanea un código exacto, lo elige directo.
 */
export function ProductPicker({ products, value, onChange, invalid, autoFocus, ariaLabel = "Producto" }: { products: Product[]; value: number | null; onChange: (id: number | null) => void; invalid?: boolean; autoFocus?: boolean; ariaLabel?: string }) {
  const selected = products.find((p) => p.id === value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const s = query.trim().toLowerCase();
    const list = s ? products.filter((p) => [p.name, p.active, p.lab, p.barcode, p.conc].some((f) => f.toLowerCase().includes(s))) : products;
    return [...list].sort((a, b) => label(a).localeCompare(label(b))).slice(0, 8);
  }, [products, query]);

  const choose = (p: Product | undefined) => {
    if (!p) return;
    onChange(p.id);
    setQuery("");
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      if (!open && !query) return;
      e.preventDefault();
      choose(products.find((p) => p.barcode && p.barcode === query.trim()) ?? results[active]);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
      <input
        ref={inputRef}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid}
        aria-activedescendant={open && results[active] ? `${listId}-${results[active].id}` : undefined}
        autoFocus={autoFocus}
        value={open ? query : selected ? `${label(selected)} · ${selected.lab}` : query}
        placeholder="Buscar producto o escanear código"
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
          if (value !== null) onChange(null);
        }}
        onKeyDown={onKey}
        className={cn(inputClass, "w-full pl-9", selected && !open && "font-medium")}
      />
      {open && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-xl">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-zinc-500">Sin resultados. Créalo en Inventario o impórtalo desde Excel.</li>}
          {results.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${p.id}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(p)}
              className={cn("cursor-pointer rounded-lg px-3 py-2 text-sm", i === active ? "bg-zinc-100" : "")}
            >
              <span className="font-medium">{p.name}</span> <span className="text-zinc-500">{p.conc}</span>
              <span className="block text-xs text-zinc-500">
                {p.lab} · {p.form}
                {p.unitsPerBox > 1 ? ` · caja x${p.unitsPerBox}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
