"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CircleCheck, Eye, EyeOff } from "lucide-react";
import { api, errorMessage, isApiError, type PlanOffer, type Session } from "@/lib/api";
import { tenantStore } from "@/lib/api/tenant";
import { useSessionStore } from "@/lib/auth/session-store";
import { usePlans } from "@/lib/queries";
import { homeFor, NAV } from "@/lib/nav";
import { isValidBoticaCode, isValidEmail, normalizeBoticaCode, normalizeEmail, passwordError } from "@/lib/domain/auth";
import { suggestBoticaCode } from "@/lib/domain/onboarding";
import { TRIAL_DAYS } from "@/lib/domain/plans";
import { cn } from "@/lib/cn";
import { soles } from "@/lib/format";
import { DigiHmeLogo } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const STEPS = ["Plan", "Tus datos", "Listo"];
type FormErrors = Partial<Record<"boticaName" | "code" | "ownerName" | "email" | "password", string>>;

/** Registro público en 3 pasos: plan, datos de la botica y del dueño, y listo. Va sobre fondo claro (el logo tiene letras oscuras). */
export function SignupScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const signIn = useSessionStore((s) => s.signIn);
  const plans = usePlans();
  const [step, setStep] = useState(0);
  const [planId, setPlanId] = useState("crece");
  const [boticaName, setBoticaName] = useState("");
  const [code, setCode] = useState("");
  const [codeEdited, setCodeEdited] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  const plan = plans.data?.find((p) => p.id === planId);

  const validate = () => {
    const e: FormErrors = {};
    const name = boticaName.trim();
    if (name.length < 3 || name.length > 40) e.boticaName = "Escribe el nombre de tu botica (3 a 40 caracteres).";
    if (!isValidBoticaCode(normalizeBoticaCode(code))) e.code = "Usa letras minúsculas, números y guiones (3 a 40 caracteres).";
    if (ownerName.trim().length < 3) e.ownerName = "Escribe tu nombre completo.";
    if (!isValidEmail(normalizeEmail(email))) e.email = "Escribe un correo válido.";
    const pwd = passwordError(password);
    if (pwd) e.password = pwd;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate() || !plan) return;
    setBusy(true);
    setFormError(null);
    try {
      const s = await api.signUp({ boticaName: boticaName.trim(), code: normalizeBoticaCode(code), ownerName: ownerName.trim(), email: normalizeEmail(email), password, plan: plan.id });
      tenantStore.set(normalizeBoticaCode(code));
      qc.clear(); // nada de la botica anterior se queda en pantalla
      signIn(s);
      setSession(s);
      setStep(2);
    } catch (err) {
      if (isApiError(err) && err.code === "CODIGO_EN_USO") setErrors({ code: "Ese código ya lo usa otra botica. Prueba con otro." });
      else if (isApiError(err) && err.code === "CORREO_EN_USO") setErrors({ email: "Ese correo ya tiene una botica. Ingresa con él." });
      else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-dvh bg-white px-4 py-8 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex items-center justify-between gap-3">
          <DigiHmeLogo height={30} />
          {step < 2 && (
            <Link href="/login" className="text-sm font-semibold text-brand underline underline-offset-2">
              Ya tengo una botica
            </Link>
          )}
        </header>

        <ol className="mt-8 flex items-center gap-2" aria-label="Pasos del registro">
          {STEPS.map((label, i) => (
            <li key={label} className="flex flex-1 items-center gap-2" aria-current={i === step ? "step" : undefined}>
              <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold", i <= step ? "bg-brand text-white" : "bg-zinc-100 text-zinc-500", i === step && "ring-4 ring-brand/15")}>
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cn("text-sm", i === step ? "font-semibold text-zinc-900" : "text-zinc-500")}>{label}</span>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-zinc-200" />}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section className="mt-8">
            <h1 className="text-2xl font-semibold tracking-tight">Elige tu plan</h1>
            <p className="mt-1 text-sm text-zinc-500">{TRIAL_DAYS} días gratis, sin tarjeta. Puedes cambiar de plan cuando quieras.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Plan">
              {plans.isLoading && [0, 1, 2].map((i) => <div key={i} className="h-56 animate-pulse rounded-2xl bg-zinc-100" />)}
              {plans.isError && (
                <button type="button" onClick={() => void plans.refetch()} className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left text-sm text-rose-700 sm:col-span-3">
                  No se pudieron cargar los planes. Toca para reintentar.
                </button>
              )}
              {plans.data?.map((p) => (
                <PlanCard key={p.id} plan={p} selected={p.id === planId} onSelect={() => setPlanId(p.id)} />
              ))}
            </div>
            <Button variant="primary" size="lg" className="mt-6 w-full sm:w-auto" disabled={!plan} onClick={() => setStep(1)}>
              Continuar
            </Button>
          </section>
        )}

        {step === 1 && (
          <form onSubmit={submit} noValidate className="mt-8 grid max-w-xl gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Cuéntanos de tu botica</h1>
              <p className="mt-1 text-sm text-zinc-500">
                Plan elegido: <strong>{plan?.name}</strong>
                {plan && ` · ${soles(plan.priceMonthly)} al mes después de la prueba`}.
              </p>
            </div>
            <Field label="Nombre de la botica" error={errors.boticaName}>
              <Input
                value={boticaName}
                onChange={(e) => {
                  setBoticaName(e.target.value);
                  if (!codeEdited) setCode(suggestBoticaCode(e.target.value));
                }}
                placeholder="Botica San José"
                autoFocus
                aria-invalid={!!errors.boticaName}
              />
            </Field>
            <Field label="Código de la botica" hint="Tu equipo lo escribe para ingresar. Letras minúsculas, números y guiones." error={errors.code}>
              <Input
                value={code}
                onChange={(e) => {
                  setCodeEdited(true);
                  setCode(e.target.value);
                }}
                placeholder="botica-san-jose"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={!!errors.code}
              />
            </Field>
            <Field label="Tu nombre completo" error={errors.ownerName}>
              <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} autoComplete="name" aria-invalid={!!errors.ownerName} />
            </Field>
            <Field label="Correo" error={errors.email}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="tu@correo.pe" aria-invalid={!!errors.email} />
            </Field>
            <Field label="Contraseña" hint="Mínimo 8 caracteres." error={errors.password}>
              <div className="relative">
                <Input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="pr-11" aria-invalid={!!errors.password} />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-zinc-500 hover:text-zinc-800" aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={show}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {formError && (
              <p role="alert" className="text-sm text-rose-600">
                {formError}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button type="button" size="lg" onClick={() => setStep(0)} disabled={busy}>
                <ArrowLeft className="h-4 w-4" /> Atrás
              </Button>
              <Button type="submit" variant="primary" size="lg" loading={busy} className="flex-1 sm:flex-none">
                Crear mi botica
              </Button>
            </div>
          </form>
        )}

        {step === 2 && session && (
          <section className="mt-10 max-w-xl">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <CircleCheck className="h-7 w-7" />
            </span>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">¡Tu botica está lista!</h1>
            <p className="mt-2 text-sm text-zinc-600">
              <strong>{boticaName.trim()}</strong> ya tiene {TRIAL_DAYS} días de prueba gratis. Para ingresar otro día usa el código <strong>{normalizeBoticaCode(code)}</strong> y tu correo.
            </p>
            <p className="mt-2 text-sm text-zinc-600">En el panel te guiamos con lo que falta: tus datos, tu local, tus series, un usuario de mostrador y tus productos.</p>
            <Button variant="primary" size="lg" className="mt-6" onClick={() => router.replace(homeFor(session.user))}>
              Ir a mi panel
            </Button>
          </section>
        )}
      </div>
    </main>
  );
}

function PlanCard({ plan, selected, onSelect }: { plan: PlanOffer; selected: boolean; onSelect: () => void }) {
  const labels = NAV.filter((n) => plan.modules.includes(n.id)).map((n) => n.short);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn("flex flex-col rounded-2xl border p-4 text-left transition active:scale-[0.99]", selected ? "border-brand bg-brand/5 ring-2 ring-brand" : "border-zinc-200 bg-white hover:border-zinc-300")}
    >
      <span className="text-sm font-semibold text-zinc-900">{plan.name}</span>
      <span className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900">{soles(plan.priceMonthly)}</span>
      <span className="text-xs text-zinc-500">al mes, con IGV</span>
      <span className="mt-3 text-sm text-zinc-700">{plan.maxBranches === 1 ? "1 local" : `Hasta ${plan.maxBranches} locales`}</span>
      <span className="mt-2 text-xs leading-relaxed text-zinc-500">{labels.join(" · ")}</span>
    </button>
  );
}
