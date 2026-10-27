"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, UserPlus } from "lucide-react";
import type { Customer } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useCreateCustomer, useCustomerSearch } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { notify } from "@/components/ui/toast";
import { initials } from "@/lib/format";

const useDebounced = (value: string, ms = 250) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
};

export function CustomerPicker({ customer, onChange }: { customer: Customer | null; onChange: (c: Customer | null) => void }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ name: "", dni: "", phone: "" });
  const query = useDebounced(q);
  const { data: results = [], isFetching } = useCustomerSearch(query, open && !creating);
  const create = useCreateCustomer();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (customer) {
    return (
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-zinc-100 text-[11px] font-bold text-zinc-600">{initials(customer.name)}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{customer.name}</span>
        <button type="button" onClick={() => onChange(null)} className="text-xs font-medium text-zinc-500 hover:text-zinc-800">
          Quitar
        </button>
      </div>
    );
  }

  const save = async () => {
    try {
      const c = await create.mutateAsync({ name: form.name.trim(), dni: form.dni, phone: form.phone });
      onChange(c);
      notify("Cliente registrado");
      setOpen(false);
      setCreating(false);
      setForm({ name: "", dni: "", phone: "" });
    } catch (e) {
      notify(errorMessage(e), "warn");
    }
  };

  return (
    <div className="relative" ref={boxRef}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left text-sm text-zinc-500 hover:text-zinc-800" aria-expanded={open}>
        <UserPlus className="h-4 w-4" /> Asignar cliente (puntos e historial)
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-8 z-20 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl">
          {!creating ? (
            <>
              <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, DNI o RUC" aria-label="Buscar cliente" />
              <ul className="mt-1 max-h-60 overflow-y-auto">
                {results.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(c);
                        setOpen(false);
                        setQ("");
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-zinc-50"
                    >
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      <span className="text-xs tabular-nums text-zinc-400">{c.dni || c.ruc}</span>
                    </button>
                  </li>
                ))}
                {!isFetching && results.length === 0 && <li className="px-2 py-3 text-xs text-zinc-500">Sin coincidencias.</li>}
              </ul>
              <button type="button" onClick={() => setCreating(true)} className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                <Plus className="h-4 w-4" /> Nuevo cliente
              </button>
            </>
          ) : (
            <div className="grid gap-2 p-1">
              <Input autoFocus placeholder="Nombre completo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Nombre completo" />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="DNI" inputMode="numeric" maxLength={8} value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value.replace(/\D/g, "") })} aria-label="DNI" />
                <Input placeholder="Celular" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} aria-label="Celular" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                  Volver
                </Button>
                <Button size="sm" variant="primary" className="flex-1" loading={create.isPending} disabled={form.name.trim().length < 3 || (form.dni !== "" && form.dni.length !== 8)} onClick={save}>
                  Guardar cliente
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
