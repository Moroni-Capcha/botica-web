"use client";

import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import type { SetupStep } from "@/lib/api";
import { errorMessage } from "@/lib/api";
import { useSessionStore } from "@/lib/auth/session-store";
import { useCompleteSetupStep, useSetup } from "@/lib/queries";
import { isSetupComplete, nextStep, progress, SETUP_HINT, SETUP_STEPS, SETUP_TITLE } from "@/lib/domain/onboarding";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

/** A dónde lleva cada paso: se reusan las pantallas de Ajustes y Compras (no se duplican). */
const LINK: Record<SetupStep, { href: string; label: string }> = {
  botica: { href: "/ajustes?tab=botica", label: "Completar datos" },
  local: { href: "/ajustes?tab=locales", label: "Revisar mi local" },
  series: { href: "/ajustes?tab=locales", label: "Ver series" },
  usuario: { href: "/ajustes?tab=cuentas", label: "Crear usuario" },
  productos: { href: "/compras", label: "Importar productos" },
};

/** Tarjeta del panel con los pasos de la primera configuración. Solo para el administrador, hasta terminar. */
export function SetupChecklist() {
  const isAdmin = useSessionStore((s) => s.session?.user.role === "admin");
  const { data } = useSetup(isAdmin);
  const complete = useCompleteSetupStep();
  if (!isAdmin || !data || isSetupComplete(data.done)) return null;

  const pg = progress(data.done);
  const next = nextStep(data.done);
  const mark = (step: SetupStep) => complete.mutate(step, { onError: (e) => notify(errorMessage(e), "warn") });

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5" aria-label="Primera configuración">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Deja lista tu botica</h3>
          <p className="text-sm text-zinc-500">
            {pg.done} de {pg.total} pasos hechos
          </p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 sm:w-48" role="progressbar" aria-valuenow={pg.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la configuración">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pg.percent}%` }} />
        </div>
      </div>
      <ul className="mt-4 grid gap-2">
        {SETUP_STEPS.map((step) => {
          const done = data.done.includes(step);
          const current = step === next;
          return (
            <li key={step} className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-3", current ? "border-brand/40 bg-brand/5" : "border-zinc-100")}>
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full", done ? "bg-emerald-500 text-white" : "border border-zinc-300 text-transparent")} aria-hidden>
                <Check className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-semibold", done && "text-zinc-400 line-through")}>{SETUP_TITLE[step]}</p>
                {!done && <p className="text-xs text-zinc-500">{SETUP_HINT[step]}</p>}
              </div>
              {!done && (
                <div className="flex items-center gap-2">
                  <Link href={LINK[step].href} className="inline-flex h-8 items-center gap-1 rounded-xl bg-brand px-3 text-xs font-semibold text-white transition hover:brightness-110">
                    {LINK[step].label} <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                  <Button size="sm" onClick={() => mark(step)} loading={complete.isPending && complete.variables === step}>
                    {step === "productos" ? "Saltar" : "Ya lo hice"}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
