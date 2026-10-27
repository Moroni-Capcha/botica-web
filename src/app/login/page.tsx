"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowLeftRight, CalendarClock, FileSpreadsheet, Pill, TrendingUp } from "lucide-react";
import { api, apiMode, errorMessage } from "@/lib/api";
import { useSessionStore } from "@/lib/auth/session-store";
import { useConfig, useStaff } from "@/lib/queries";
import { homeFor } from "@/lib/nav";
import { BrandMark, DigiSeal } from "@/components/brand-mark";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

const FEATURES = [
  { icon: ArrowLeftRight, text: "Principal y sucursal con stock separado y traslados" },
  { icon: CalendarClock, text: "Lotes con fecha de vencimiento y alertas por semáforo" },
  { icon: TrendingUp, text: "Prioridad de venta: qué vender primero antes de perderlo" },
  { icon: Pill, text: "Venta por unidad, blíster o caja, genéricos y receta" },
  { icon: FileSpreadsheet, text: "Reportes e inventario exportables a Excel" },
];
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"];

export default function LoginPage() {
  const router = useRouter();
  const { data: config } = useConfig();
  const { data: staff, isLoading, isError, refetch } = useStaff();
  const signIn = useSessionStore((s) => s.signIn);
  const [selId, setSelId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sel = staff?.find((s) => s.id === selId);
  const branchName = (id: string | null) => (id ? config?.branches.find((b) => b.id === id)?.name ?? id : "Ve los dos locales");

  const submit = useCallback(
    async (code: string) => {
      if (!sel) return;
      setBusy(true);
      try {
        const session = await api.login(sel.id, code);
        signIn(session);
        router.replace(homeFor(session.user));
      } catch (e) {
        setError(errorMessage(e));
        setTimeout(() => setPin(""), 500);
      } finally {
        setBusy(false);
      }
    },
    [sel, signIn, router],
  );

  useEffect(() => {
    if (pin.length === 4 && !busy) void submit(pin);
  }, [pin, busy, submit]);

  const press = useCallback(
    (k: string) => {
      if (!sel || busy) return;
      setError(null);
      if (k === "←") setPin((p) => p.slice(0, -1));
      else if (k) setPin((p) => (p.length < 4 ? p + k : p));
    },
    [sel, busy],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      if (e.key === "Backspace") press("←");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  return (
    <main className="flex min-h-dvh w-full flex-col bg-white lg:flex-row">
      <section className="relative flex flex-col justify-between overflow-hidden bg-brand px-6 py-8 text-white sm:px-10 lg:w-[44%] lg:py-12">
        <svg className="pointer-events-none absolute -bottom-16 -right-16 h-[380px] w-[380px] opacity-[0.07]" viewBox="0 0 48 48" aria-hidden>
          <path d="M19 9h10v10h10v10H29v10H19V29H9V19h10z" fill="#fff" />
        </svg>
        <div className="flex items-center gap-3">
          <BrandMark size={46} />
          <div className="leading-tight">
            <p className="text-lg font-semibold">{config?.pharmacy.name ?? "Botica"}</p>
            <p className="text-xs text-white/60">{config?.pharmacy.tagline}</p>
          </div>
        </div>
        <div className="relative mt-10 max-w-md lg:mt-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Sistema de botica</p>
          <h1 className="mt-3 text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">Ventas, lotes y vencimientos bajo control.</h1>
          <ul className="mt-6 grid gap-3">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-white/80">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10">
                  <Icon className="h-4 w-4 text-accent" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mt-10 lg:mt-0">
          <DigiSeal light />
        </div>
      </section>

      <section className="flex flex-1 justify-center px-4 py-10 sm:px-8">
        <div className="my-auto w-full max-w-md">
          <h2 className="text-xl font-semibold tracking-tight">Iniciar turno</h2>
          <p className="mt-1 text-sm text-zinc-500">Elige tu usuario e ingresa tu PIN de 4 dígitos.</p>
          {apiMode === "mock" && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Modo de prueba sin servidor. PIN: administrador 1234 · principal 1111 · sucursal 2222</p>}

          <div className="mt-6 grid gap-2.5" role="radiogroup" aria-label="Usuario">
            {isLoading && [0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-zinc-100" />)}
            {isError && (
              <button type="button" onClick={() => void refetch()} className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left text-sm text-rose-700">
                No se pudo cargar la lista de usuarios. Toca para reintentar.
              </button>
            )}
            {staff?.map((u) => {
              const active = selId === u.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setSelId(u.id);
                    setPin("");
                    setError(null);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.98]",
                    active ? "border-transparent bg-brand text-white shadow-lg" : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
                  )}
                >
                  <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold", active ? "bg-accent text-zinc-900" : "bg-zinc-100 text-zinc-600")}>{initials(u.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{u.role === "admin" ? "Administrador general" : `Cuenta ${branchName(u.branchId)}`}</span>
                    <span className={cn("block truncate text-xs", active ? "text-white/70" : "text-zinc-500")}>
                      {u.name} · {branchName(u.branchId)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className={cn("mt-6 transition", sel ? "opacity-100" : "pointer-events-none opacity-40")}>
            <div className={cn("flex justify-center gap-3", error && "animate-[shake_.4s_ease-in-out]")} aria-live="polite" aria-label={`${pin.length} de 4 dígitos`}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={cn("h-3 w-3 rounded-full transition", i < pin.length ? (error ? "bg-rose-600" : "bg-brand") : "bg-zinc-200")} />
              ))}
            </div>
            <p className="mt-2 h-4 text-center text-xs text-zinc-500">{error ?? (busy ? "Verificando…" : "")}</p>
            <div className="mx-auto mt-3 grid max-w-[260px] grid-cols-3 gap-2">
              {KEYS.map((k, i) =>
                k === "" ? (
                  <span key={i} />
                ) : (
                  <button key={i} type="button" onClick={() => press(k)} className="h-12 rounded-xl bg-zinc-100 text-lg font-medium tabular-nums text-zinc-800 transition hover:bg-zinc-200 active:scale-95" aria-label={k === "←" ? "Borrar" : k}>
                    {k === "←" ? <ArrowLeft className="mx-auto h-5 w-5" /> : k}
                  </button>
                ),
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
