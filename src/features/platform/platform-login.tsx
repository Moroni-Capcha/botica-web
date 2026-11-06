"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { errorMessage, isApiError, platformApi } from "@/lib/api";
import { usePlatformSession } from "@/lib/auth/platform-session-store";
import { isValidEmail, normalizeEmail } from "@/lib/domain/auth";
import { DIGIHME, DigiHmeLogo } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

/** Ingreso del operador de Digi!HME (correo y contraseña). No tiene PIN ni elige botica. */
export function PlatformLogin() {
  const signIn = usePlatformSession((s) => s.signIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const mail = normalizeEmail(email);
    if (!isValidEmail(mail)) return setError("Escribe un correo válido.");
    if (!password) return setError("Escribe tu contraseña.");
    setBusy(true);
    setError(null);
    try {
      signIn(await platformApi.login(mail, password));
    } catch (err) {
      setError(isApiError(err) && err.code === "CREDENCIALES_INVALIDAS" ? "Correo o contraseña incorrectos." : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-subtle px-4 py-10" style={{ ["--brand" as string]: DIGIHME.navy, ["--accent" as string]: DIGIHME.cyan }}>
      <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <DigiHmeLogo height={34} />
        <p className="mt-5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white" style={{ background: DIGIHME.navy }}>
          <ShieldCheck className="h-3.5 w-3.5" /> Consola interna
        </p>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">Ingreso del equipo de Digi!HME</h1>
        <p className="mt-1 text-sm text-muted">Solo para quienes administran la plataforma. Las boticas ingresan desde su propia pantalla.</p>
        <form onSubmit={submit} noValidate className="mt-6 grid gap-4">
          <Field label="Correo">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="nombre@digi-hme.pe" />
          </Field>
          <Field label="Contraseña">
            <div className="relative">
              <Input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="pr-11" />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted hover:text-fg" aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={show}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          {error && (
            <p role="alert" className="text-sm text-danger-fg">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={!email.trim() || !password}>
            Ingresar
          </Button>
        </form>
      </div>
    </main>
  );
}
