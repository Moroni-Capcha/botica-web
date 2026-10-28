"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Coffee, Fingerprint, LogIn, LogOut, type LucideIcon } from "lucide-react";
import type { AttendanceMark, Branch, BranchId, MarkType } from "@/lib/api/types";
import { apiMode, errorMessage, isApiError } from "@/lib/api";
import { allowedMarks, hm, MARK_LABEL } from "@/lib/domain/attendance";
import { useClock, useConfig, useKioskWorkers } from "@/lib/queries";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { initials, timeShort } from "@/lib/format";
import { cn } from "@/lib/cn";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"];
const MARK_UI: Record<MarkType, { icon: LucideIcon; tone: string }> = {
  entrada: { icon: LogIn, tone: "bg-emerald-600" },
  ref_ini: { icon: Coffee, tone: "bg-amber-500" },
  ref_fin: { icon: Coffee, tone: "bg-amber-600" },
  salida: { icon: LogOut, tone: "bg-zinc-900" },
};
const MOCK_PINS: Record<string, string> = { w1: "4101", w2: "4102", w3: "4103", w4: "4104", w5: "4201", w6: "4202", w7: "4203" };

/**
 * Marcación en el equipo del local: el trabajador elige su nombre, ingresa su PIN personal y marca.
 * No necesita sesión. La hora la pone el servidor.
 */
export function KioskDialog({ branches, fixedBranch, onClose }: { branches: Branch[]; fixedBranch: BranchId | null; onClose: () => void }) {
  const config = useConfig();
  const [branchId, setBranchId] = useState<BranchId>(fixedBranch ?? branches[0]?.id ?? "principal");
  const workers = useKioskWorkers(branchId);
  const clock = useClock();
  const [selId, setSelId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinOk, setPinOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<(AttendanceMark & { name: string; late: number }) | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const tolerance = config.data?.attendance.toleranceMinutes ?? 10;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const sel = workers.data?.find((w) => w.id === selId);
  const allowed = sel ? allowedMarks(sel.today) : [];

  const reset = useCallback(() => {
    setSelId(null);
    setPin("");
    setPinOk(false);
    setError(null);
    setDone(null);
  }, []);

  /* Tras marcar, vuelve a la lista para el siguiente trabajador */
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(reset, 3500);
    return () => clearTimeout(id);
  }, [done, reset]);

  /* El PIN se valida al marcar (el servidor lo comprueba); aquí solo se pide completo */
  useEffect(() => {
    if (pin.length === 4) setPinOk(true);
  }, [pin]);

  const press = useCallback(
    (k: string) => {
      if (!sel || pinOk) return;
      setError(null);
      if (k === "←") setPin((p) => p.slice(0, -1));
      else if (k) setPin((p) => (p.length < 4 ? p + k : p));
    },
    [sel, pinOk],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      if (e.key === "Backspace") press("←");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const mark = (type: MarkType) => {
    if (!sel) return;
    clock.mutate(
      { workerId: sel.id, pin, type },
      {
        onSuccess: (m) => {
          const day = new Date(m.at);
          day.setHours(0, 0, 0, 0);
          const late = type === "entrada" ? Math.round((new Date(m.at).getTime() - (day.getTime() + hm(sel.schedule.start) * 60_000)) / 60_000) : 0;
          setDone({ ...m, name: sel.name, late });
        },
        onError: (e) => {
          setError(errorMessage(e));
          if (isApiError(e) && e.code === "PIN_INVALIDO") {
            setPinOk(false);
            setTimeout(() => setPin(""), 450);
          }
        },
      },
    );
  };

  return (
    <Dialog title="Marcar asistencia" description={done ? undefined : sel ? `${sel.name} · horario ${sel.schedule.start} a ${sel.schedule.end}` : "Elige tu nombre e ingresa tu PIN personal."} onClose={onClose}>
      {done ? (
        <div className="grid place-items-center py-6 text-center" aria-live="polite">
          <span className={cn("grid h-16 w-16 animate-[pop_.3s_cubic-bezier(.32,.72,0,1)] place-items-center rounded-full text-white", MARK_UI[done.type].tone)}>
            {(() => {
              const Icon = MARK_UI[done.type].icon;
              return <Icon className="h-8 w-8" />;
            })()}
          </span>
          <p className="mt-4 text-sm font-medium text-zinc-500">{MARK_LABEL[done.type]} registrada</p>
          <p className="mt-1 text-5xl font-semibold tracking-tight tabular-nums">{timeShort(done.at)}</p>
          <p className="mt-2 text-sm font-semibold">{done.name}</p>
          {done.type === "entrada" && (
            <p className={cn("mt-2 rounded-full px-3 py-1 text-xs font-semibold", done.late > tolerance ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700")}>
              {done.late > tolerance ? `Tardanza de ${done.late} min` : "A tiempo"}
            </p>
          )}
        </div>
      ) : !sel ? (
        <div className="grid gap-4">
          {!fixedBranch && branches.length > 1 && (
            <Segmented
              full
              label="Local"
              value={branchId}
              onChange={(b) => {
                setBranchId(b);
                reset();
              }}
              options={branches.map((b) => ({ id: b.id, label: b.name }))}
            />
          )}
          {workers.isLoading ? (
            <div className="grid grid-cols-2 gap-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-zinc-100" />)}</div>
          ) : workers.error ? (
            <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{errorMessage(workers.error)}</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="list">
              {workers.data?.map((w) => {
                const last = w.today[w.today.length - 1];
                const state = !last ? "Sin marcar hoy" : last.type === "salida" ? `Salió ${timeShort(last.at)}` : last.type === "ref_ini" ? "En refrigerio" : `En turno desde ${timeShort(w.today[0]!.at)}`;
                return (
                  <button
                    key={w.id}
                    type="button"
                    role="listitem"
                    onClick={() => {
                      setSelId(w.id);
                      setPin("");
                      setPinOk(false);
                      setError(null);
                    }}
                    className="flex items-center gap-2.5 rounded-2xl border border-zinc-200 p-3 text-left transition hover:border-zinc-400 active:scale-[0.98]"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-600">{initials(w.name)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{w.name}</span>
                      <span className={cn("block truncate text-[11px]", !last ? "text-zinc-400" : last.type === "salida" ? "text-zinc-500" : "font-semibold text-emerald-700")}>{state}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <Fingerprint className="h-3.5 w-3.5" /> Cada trabajador tiene su PIN personal. El administrador ve las marcas en Asistencia.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-sm font-bold text-zinc-900">{initials(sel.name)}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{sel.name}</p>
              <p className="truncate text-xs text-zinc-500">{sel.role} · hoy: {sel.today.length ? sel.today.map((m) => `${MARK_LABEL[m.type].split(" ")[0]} ${timeShort(m.at)}`).join(" · ") : "sin marcas"}</p>
            </div>
            <button type="button" onClick={reset} className="text-xs font-medium text-zinc-500 hover:text-zinc-800">
              Cambiar
            </button>
          </div>
          {!pinOk ? (
            <div>
              <div className={cn("flex justify-center gap-3", error && "animate-[shake_.4s_ease-in-out]")} aria-label={`${pin.length} de 4 dígitos`}>
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={cn("h-3 w-3 rounded-full", i < pin.length ? (error ? "bg-rose-600" : "bg-brand") : "bg-zinc-200")} />
                ))}
              </div>
              <p className="mt-2 h-4 text-center text-xs text-zinc-500" role={error ? "alert" : undefined}>
                {error ?? (apiMode === "mock" && MOCK_PINS[sel.id] ? `PIN de prueba: ${MOCK_PINS[sel.id]}` : "Ingresa tu PIN personal")}
              </p>
              <div className="mx-auto mt-3 grid max-w-[240px] grid-cols-3 gap-2">
                {KEYS.map((k, i) =>
                  k === "" ? (
                    <span key={i} />
                  ) : (
                    <button key={i} type="button" onClick={() => press(k)} className="h-11 rounded-xl bg-zinc-100 text-lg font-medium tabular-nums transition hover:bg-zinc-200 active:scale-95" aria-label={k === "←" ? "Borrar" : k}>
                      {k === "←" ? <ArrowLeft className="mx-auto h-5 w-5" /> : k}
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-2">
              <p className="text-center text-xs text-zinc-500">
                Son las <b className="tabular-nums text-zinc-900">{timeShort(now)}</b>. ¿Qué vas a marcar?
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(MARK_LABEL) as MarkType[]).map((type) => {
                  const ok = allowed.includes(type);
                  const Icon = MARK_UI[type].icon;
                  return (
                    <button
                      key={type}
                      type="button"
                      disabled={!ok || clock.isPending}
                      onClick={() => mark(type)}
                      className={cn("flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed", ok ? `${MARK_UI[type].tone} text-white` : "bg-zinc-100 text-zinc-300")}
                    >
                      <Icon className="h-5 w-5" /> {MARK_LABEL[type]}
                    </button>
                  );
                })}
              </div>
              {error && <p className="text-center text-xs font-medium text-rose-600" role="alert">{error}</p>}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
