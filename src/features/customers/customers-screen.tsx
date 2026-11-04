"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { CircleCheck, FileSpreadsheet, Search, TriangleAlert, UserPlus, Users, X } from "lucide-react";
import type { CustomerSummary } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useConfig, useCustomers, useCustomersPage, useLogContact, useProducts, useRefills } from "@/lib/queries";
import { refillRows, toNotify, type RefillRow } from "@/lib/domain/customers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { Segmented } from "@/components/ui/segmented";
import { Table } from "@/components/ui/table";
import { notify } from "@/components/ui/toast";
import { useMediaQuery } from "@/lib/use-media-query";
import { useStableCallback } from "@/lib/use-stable-callback";
import { CustomerDialog } from "./customer-dialog";
import { CustomerCard, CustomerRow, RefillItem } from "./customers-rows";
import { exportCustomers } from "./export";

/** Clientes por página de la lista: el servidor entrega solo estos. */
const CUSTOMERS_PAGE_SIZE = 25;

type Tab = "recompras" | "clientes";
type RefillFilter = "avisar" | "todos";

const fmtInt = (n: number) => n.toLocaleString("es-PE");

function Skeleton({ rows, className }: { rows: number; className?: string }) {
  return (
    <div className={className ?? "grid gap-2 p-4 sm:p-5"} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-sunken" />
      ))}
    </div>
  );
}

export function CustomersScreen() {
  const config = useConfig();
  const customers = useCustomers();
  const refills = useRefills();
  const products = useProducts();
  const logContact = useLogContact();
  const wide = useMediaQuery("(min-width: 768px)");
  const [now] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>("recompras");
  const [filter, setFilter] = useState<RefillFilter>("avisar");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const query = useDeferredValue(q.trim());
  const pageData = useCustomersPage(query, page, CUSTOMERS_PAGE_SIZE, tab === "clientes");
  const [editing, setEditing] = useState<CustomerSummary | "new" | null>(null);

  const list = useMemo(() => customers.data ?? [], [customers.data]);
  const productList = useMemo(() => products.data ?? [], [products.data]);
  const productNames = useMemo(() => new Map(productList.map((p) => [p.id, p.name])), [productList]);
  const pharmacyName = config.data?.pharmacy.name ?? "la botica";
  const rows = useMemo(() => refillRows(list, refills.data ?? [], productList, now), [list, refills.data, productList, now]);
  const pending = useMemo(() => toNotify(rows), [rows]);
  const shown = filter === "avisar" ? pending : rows;

  /** La búsqueda, el orden y el recorte por páginas los hace el servidor (ver "Paginación en el servidor" en docs/API.md). */
  const filtered = useMemo(() => pageData.data?.items ?? [], [pageData.data]);

  const onOpen = useStableCallback((c: CustomerSummary) => setEditing(c));
  const onContact = useStableCallback((r: RefillRow, channel: "whatsapp" | "llamada") =>
    logContact.mutate(
      { customerId: r.customer.id, input: { productId: r.product.id, channel, note: "" } },
      { onSuccess: () => notify(channel === "whatsapp" ? `Aviso a ${r.customer.name.split(" ")[0]} registrado` : `Llamada a ${r.customer.name.split(" ")[0]} registrada`), onError: (e) => notify(errorMessage(e), "warn") },
    ),
  );

  const loading = customers.isLoading || refills.isLoading || products.isLoading;

  /* Escalonado de la primera carga de cada lista: solo las primeras 8 filas y una vez. Filtrar, buscar o paginar no lo repite. */
  const refillStag = useRef<Map<string, number> | null>(null);
  if (!loading && refillStag.current === null) refillStag.current = new Map(shown.slice(0, 8).map((r, i) => [`${r.customer.id}-${r.product.id}`, i]));
  const customerStag = useRef<Map<number, number> | null>(null);
  if (!pageData.isLoading && pageData.data && customerStag.current === null) customerStag.current = new Map(filtered.slice(0, 8).map((c, i) => [c.id, i]));

  const error = customers.error ?? refills.error ?? products.error;
  if (error) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <Card padding="none">
          <Empty icon={TriangleAlert} title="No se pudieron cargar los clientes">
            {errorMessage(error)}{" "}
            <button type="button" className="font-semibold underline" onClick={() => void Promise.all([customers.refetch(), refills.refetch(), products.refetch()])}>
              Reintentar
            </button>
          </Empty>
        </Card>
      </div>
    );
  }

  const total = pageData.data?.total ?? 0;
  const refillCount = loading ? "" : `${fmtInt(shown.length)} ${shown.length === 1 ? "tratamiento" : "tratamientos"}`;
  const customerCount = pageData.data ? `${fmtInt(total)} ${total === 1 ? "cliente" : "clientes"}${query ? " con esa búsqueda" : ""}` : "";

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
          <Button
            disabled={loading}
            onClick={() => {
              exportCustomers({ customers: list, refills: rows, products: productList, pharmacy: config.data?.pharmacy });
              notify("Clientes y recompras descargados");
            }}
          >
            <FileSpreadsheet className="h-4 w-4 text-success-fg" aria-hidden /> Excel
          </Button>
          <Button variant="primary" onClick={() => setEditing("new")} disabled={!products.data}>
            <UserPlus className="h-4 w-4" aria-hidden /> Nuevo cliente
          </Button>
        </div>
      </div>

      {tab === "recompras" && (
        <Card as="section" padding="none" className="animate-swap-in overflow-hidden" aria-labelledby="refills-title">
          <div className="flex flex-wrap items-start gap-3 border-b border-line-soft p-4 sm:p-5">
            <div className="min-w-0 flex-1 basis-72">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <h2 id="refills-title" className="font-semibold tracking-tight">
                  Recordatorios de recompra
                </h2>
                <p className="text-caption tabular-nums text-muted" role="status" aria-live="polite">
                  {refillCount}
                </p>
              </div>
              <p className="mt-0.5 text-caption text-muted">
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
            <Skeleton rows={5} />
          ) : shown.length === 0 ? (
            <Empty icon={CircleCheck} title={filter === "avisar" ? "Nadie por avisar hoy" : "Sin tratamientos registrados"}>
              {filter === "avisar" ? "Todos los clientes con tratamiento están al día o ya fueron avisados." : "Abre la ficha de un cliente y agrega sus medicamentos de uso continuo."}
            </Empty>
          ) : (
            <ul className="divide-y divide-line-soft">
              {shown.map((r) => {
                const key = `${r.customer.id}-${r.product.id}`;
                return <RefillItem key={key} row={r} pharmacyName={pharmacyName} stag={refillStag.current?.get(key) ?? -1} onOpen={onOpen} onContact={onContact} />;
              })}
            </ul>
          )}
        </Card>
      )}

      {tab === "clientes" && (
        <Card as="section" padding="none" className="animate-swap-in overflow-hidden" aria-labelledby="customers-title">
          <div className="grid gap-3 border-b border-line-soft p-4 sm:px-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h2 id="customers-title" className="font-semibold tracking-tight">
                Clientes
              </h2>
              <p className="text-caption tabular-nums text-muted" role="status" aria-live="polite">
                {customerCount}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-0 max-w-md flex-1 basis-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                <Input
                  type="search"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Nombre, DNI, RUC o celular"
                  className="pl-9"
                  aria-label="Buscar cliente"
                />
              </div>
              {q !== "" && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setQ("");
                    setPage(1);
                  }}
                >
                  <X className="h-4 w-4" aria-hidden /> Limpiar búsqueda
                </Button>
              )}
            </div>
          </div>
          {pageData.error ? (
            <Empty icon={TriangleAlert} title="No se pudo cargar la lista de clientes">
              {errorMessage(pageData.error)}{" "}
              <button type="button" className="font-semibold underline" onClick={() => void pageData.refetch()}>
                Reintentar
              </button>
            </Empty>
          ) : loading || pageData.isLoading ? (
            <Skeleton rows={6} />
          ) : filtered.length === 0 ? (
            <Empty icon={Users} title={query ? "Sin clientes para esa búsqueda" : "Aún no hay clientes"}>
              {query ? "Prueba con otro nombre, DNI, RUC o celular." : "Registra el primero con “Nuevo cliente”."}
            </Empty>
          ) : wide ? (
            <Table
              maxHeight={640}
              minWidth={920}
              head={["Cliente", "Documento", "Celular", "Avisos", { label: "Compras", align: "right" }, { label: "Total (neto)", align: "right" }, "Última compra", { label: "Puntos", align: "right" }]}
            >
              {filtered.map((c) => (
                <CustomerRow key={c.id} customer={c} productNames={productNames} stag={customerStag.current?.get(c.id) ?? -1} onOpen={onOpen} />
              ))}
            </Table>
          ) : (
            <ul className="grid gap-2 p-3">
              {filtered.map((c) => (
                <CustomerCard key={c.id} customer={c} productNames={productNames} stag={customerStag.current?.get(c.id) ?? -1} onOpen={onOpen} />
              ))}
            </ul>
          )}
          {pageData.data && <Pagination page={pageData.data.page} pageSize={pageData.data.pageSize} total={pageData.data.total} onPage={setPage} busy={pageData.isFetching} noun="clientes" />}
        </Card>
      )}

      {editing && products.data && (
        <CustomerDialog customer={editing === "new" ? null : (list.find((c) => c.id === editing.id) ?? editing)} customers={list} products={productList} branches={config.data?.branches ?? []} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
