"use client";

import { useMemo, useState } from "react";
import { BellOff, CircleCheck, FileSpreadsheet, MessageCircle, Phone, Search, TriangleAlert, UserPlus, Users } from "lucide-react";
import type { CustomerSummary } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useConfig, useCustomers, useLogContact, useProducts, useRefills } from "@/lib/queries";
import { peruMobile, refillMessage, refillRows, toNotify, whatsappLink, type RefillRow, type RefillStatus } from "@/lib/domain/customers";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Table, td } from "@/components/ui/table";
import { notify } from "@/components/ui/toast";
import { dateShort, initials, soles } from "@/lib/format";
import { cn } from "@/lib/cn";
import { CustomerDialog } from "./customer-dialog";
import { exportCustomers } from "./export";

type Tab = "recompras" | "clientes";
type RefillFilter = "avisar" | "todos";

const STATUS_UI: Record<RefillStatus, { label: (due: number | null) => string; className: string }> = {
  atrasado: { label: (d) => `Atrasado ${-(d ?? 0)} d`, className: "bg-rose-100 text-rose-700" },
  hoy: { label: () => "Le toca hoy", className: "bg-rose-100 text-rose-700" },
  pronto: { label: (d) => (d === 1 ? "Mañana" : `En ${d} días`), className: "bg-amber-100 text-amber-800" },
  al_dia: { label: (d) => `En ${d} días`, className: "bg-zinc-100 text-zinc-600" },
  sin_compra: { label: () => "Sin compra aún", className: "bg-zinc-100 text-zinc-500" },
};

export function CustomersScreen() {
  const config = useConfig();
  const customers = useCustomers();
  const refills = useRefills();
  const products = useProducts();
  const logContact = useLogContact();
  const [now] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>("recompras");
  const [filter, setFilter] = useState<RefillFilter>("avisar");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<CustomerSummary | "new" | null>(null);

  const list = customers.data ?? [];
  const productList = products.data ?? [];
  const pharmacyName = config.data?.pharmacy.name ?? "la botica";
  const rows = useMemo(() => refillRows(list, refills.data ?? [], productList, now), [list, refills.data, productList, now]);
  const pending = useMemo(() => toNotify(rows), [rows]);
  const shown = filter === "avisar" ? pending : rows;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    return list
      .filter((c) => !s || c.name.toLowerCase().includes(s) || (digits !== "" && (c.dni.includes(digits) || c.ruc.includes(digits) || c.phone.replace(/\D/g, "").includes(digits))))
      .sort((a, b) => (b.lastPurchaseAt ?? "").localeCompare(a.lastPurchaseAt ?? ""));
  }, [list, q]);

  const register = (r: RefillRow, channel: "whatsapp" | "llamada") =>
    logContact.mutate(
      { customerId: r.customer.id, input: { productId: r.product.id, channel, note: "" } },
      { onSuccess: () => notify(channel === "whatsapp" ? `Aviso a ${r.customer.name.split(" ")[0]} registrado` : `Llamada a ${r.customer.name.split(" ")[0]} registrada`), onError: (e) => notify(errorMessage(e), "warn") },
    );

  const error = customers.error ?? refills.error ?? products.error;
  if (error) {
    return (
      <Empty icon={TriangleAlert} title="No se pudieron cargar los clientes">
        {errorMessage(error)}{" "}
        <button type="button" className="font-semibold underline" onClick={() => void Promise.all([customers.refetch(), refills.refetch(), products.refetch()])}>
          Reintentar
        </button>
      </Empty>
    );
  }
  const loading = customers.isLoading || refills.isLoading || products.isLoading;

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Tab>
          label="Vista"
          value={tab}
          onChange={setTab}
          options={[
            { id: "recompras", label: "Recompras", count: loading ? undefined : pending.length },
            { id: "clientes", label: "Clientes", count: loading ? undefined : list.length },
          ]}
        />
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button onClick={() => setEditing("new")} disabled={!products.data}>
            <UserPlus className="h-4 w-4" /> Nuevo cliente
          </Button>
          <Button
            disabled={loading}
            onClick={() => {
              exportCustomers({ customers: list, refills: rows, products: productList, pharmacy: config.data?.pharmacy });
              notify("Clientes y recompras descargados");
            }}
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
          </Button>
        </div>
      </div>

      {tab === "recompras" && (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white" aria-labelledby="refills-title">
          <div className="flex flex-wrap items-start gap-3 border-b border-zinc-100 p-4 sm:p-5">
            <div className="min-w-0 flex-1 basis-72">
              <h2 id="refills-title" className="font-semibold tracking-tight">Recordatorios de recompra</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Clientes con tratamiento continuo. Con su última compra y su ciclo se calcula cuándo se les termina. «WhatsApp» abre el mensaje listo para enviar y lo registra para no repetirlo.
              </p>
            </div>
            <Segmented<RefillFilter>
              label="Filtro"
              value={filter}
              onChange={setFilter}
              options={[
                { id: "avisar", label: "Por avisar", count: loading ? undefined : pending.length },
                { id: "todos", label: "Todos los tratamientos", count: loading ? undefined : rows.length },
              ]}
            />
          </div>
          {loading ? (
            <div className="grid gap-2 p-4">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-zinc-100" />)}</div>
          ) : shown.length === 0 ? (
            <Empty icon={CircleCheck} title={filter === "avisar" ? "Nadie por avisar hoy" : "Sin tratamientos registrados"}>
              {filter === "avisar" ? "Todos los clientes con tratamiento están al día o ya fueron avisados." : "Abre la ficha de un cliente y agrega sus medicamentos de uso continuo."}
            </Empty>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {shown.map((r) => {
                const st = STATUS_UI[r.status];
                const link = r.customer.contactConsent ? whatsappLink(r.customer.phone, refillMessage(r, pharmacyName)) : null;
                const mobile = peruMobile(r.customer.phone);
                return (
                  <li key={`${r.customer.id}-${r.product.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-600">{initials(r.customer.name)}</span>
                    <button type="button" onClick={() => setEditing(r.customer as CustomerSummary)} className="min-w-0 flex-1 basis-56 text-left">
                      <span className="block text-sm font-semibold hover:underline">{r.customer.name}</span>
                      <span className="block text-xs text-zinc-500">
                        {r.product.name} {r.product.conc} · cada {r.treatment.everyDays} días · {r.lastPurchaseAt ? `última compra ${dateShort(r.lastPurchaseAt)}` : "aún no lo compra aquí"}
                        {r.customer.phone && <span className="tabular-nums"> · {r.customer.phone}</span>}
                      </span>
                    </button>
                    <span className={cn("whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", st.className)}>{st.label(r.due)}</span>
                    {r.recentlyContacted && r.lastContactAt && <span className="text-[11px] text-zinc-500">Avisado {dateShort(r.lastContactAt)}</span>}
                    <div className="flex gap-1.5">
                      {!r.customer.contactConsent ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-500" title="El cliente no aceptó recibir avisos">
                          <BellOff className="h-3.5 w-3.5" /> No desea avisos
                        </span>
                      ) : (
                        <>
                          {link ? (
                            <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => register(r, "whatsapp")} className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#25D366] px-3 text-xs font-semibold text-zinc-900 transition hover:brightness-95">
                              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                            </a>
                          ) : (
                            <span className="text-[11px] text-zinc-500">Sin celular</span>
                          )}
                          {mobile && (
                            <a href={`tel:+${mobile}`} onClick={() => register(r, "llamada")} className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-zinc-100 px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200" aria-label={`Llamar a ${r.customer.name}`}>
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === "clientes" && (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white" aria-label="Clientes">
          <div className="border-b border-zinc-100 p-4 sm:px-5">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, DNI, RUC o celular" className="pl-9" aria-label="Buscar cliente" />
            </div>
          </div>
          {loading ? (
            <div className="grid gap-2 p-4">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-zinc-100" />)}</div>
          ) : filtered.length === 0 ? (
            <Empty icon={Users} title="Sin clientes para esa búsqueda" />
          ) : (
            <Table minWidth={820} head={["Cliente", "Documento", "Celular", { label: "Compras", align: "right" }, { label: "Total", align: "right" }, "Última compra", { label: "Puntos", align: "right" }]}>
              {filtered.map((c) => (
                <tr key={c.id} tabIndex={0} onClick={() => setEditing(c)} onKeyDown={(e) => e.key === "Enter" && setEditing(c)} className="cursor-pointer outline-none transition-colors hover:bg-zinc-50 focus-visible:bg-zinc-50" aria-label={`Abrir ficha de ${c.name}`}>
                  <td className={td}>
                    <p className="flex items-center gap-1.5 font-medium">
                      {c.name}
                      {!c.contactConsent && <BellOff className="h-3.5 w-3.5 text-zinc-400" aria-label="No desea avisos" />}
                    </p>
                    {c.treatments.length > 0 && <p className="text-xs text-zinc-500">Tratamiento: {c.treatments.map((t) => productList.find((p) => p.id === t.productId)?.name).filter(Boolean).join(", ")}</p>}
                  </td>
                  <td className={cn(td, "whitespace-nowrap tabular-nums text-zinc-600")}>{c.ruc ? `RUC ${c.ruc}` : c.dni ? `DNI ${c.dni}` : "—"}</td>
                  <td className={cn(td, "whitespace-nowrap tabular-nums text-zinc-600")}>{c.phone || "—"}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{c.purchases}</td>
                  <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{soles(c.totalSpent)}</td>
                  <td className={cn(td, "whitespace-nowrap tabular-nums text-zinc-600")}>{c.lastPurchaseAt ? dateShort(c.lastPurchaseAt) : "—"}</td>
                  <td className={cn(td, "text-right font-semibold tabular-nums")}>{c.points}</td>
                </tr>
              ))}
            </Table>
          )}
        </section>
      )}

      {editing && products.data && (
        <CustomerDialog customer={editing === "new" ? null : (list.find((c) => c.id === editing.id) ?? editing)} customers={list} products={productList} branches={config.data?.branches ?? []} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
