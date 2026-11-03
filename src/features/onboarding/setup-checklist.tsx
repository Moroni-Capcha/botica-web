"use client";

import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import type { SetupStep } from "@/lib/api";
import { errorMessage } from "@/lib/api";
import { useSessionStore } from "@/lib/auth/session-store";
import { useCompleteSetupStep, useSetup } from "@/lib/queries";
import { isSetupComplete, nextStep, progress, SETUP_HINT, SETUP_STEPS, SETUP_TITLE } from "@/lib/domain/onboarding";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    <Card as="section" aria-labelledby="setup-title">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 id="setup-title" className="text-base font-semibold tracking-tight text-fg">
            Deja lista tu botica
          </h2>
          <p className="text-small text-muted">
            {pg.done} de {pg.total} pasos hechos
          </p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-sunken sm:w-56" role="progressbar" aria-valuenow={pg.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la configuración">
          <div className="h-full origin-left rounded-full bg-brand transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)]" style={{ transform: `scaleX(${pg.percent / 100})` }} />
        </div>
      </div>
      <ul className="mt-4 grid gap-2">
        {SETUP_STEPS.map((step) => {
          const done = data.done.includes(step);
          const current = step === next;
          return (
            <li key={step} className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-3", current ? "border-brand/40 bg-brand/5" : "border-line-soft")}>
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full", done ? "bg-success text-white" : "border border-line-strong text-transparent")} aria-hidden>
                <Check className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-small font-semibold", done ? "text-muted line-through" : "text-fg")}>
                  <span className="sr-only">{done ? "Hecho: " : "Pendiente: "}</span>
                  {SETUP_TITLE[step]}
                </p>
                {!done && <p className="text-caption text-muted">{SETUP_HINT[step]}</p>}
              </div>
              {!done && (
                <div className="flex items-center gap-2">
                  <Link href={LINK[step].href} className={buttonClass("primary", "sm")}>
                    {LINK[step].label} <ChevronRight className="h-3.5 w-3.5" aria-hidden />
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
    </Card>
  );
}
