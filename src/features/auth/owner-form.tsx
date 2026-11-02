"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { api, errorMessage, isApiError, type Session } from "@/lib/api";
import { isValidEmail, normalizeEmail, passwordError } from "@/lib/domain/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

/** Ingreso del dueño con correo y contraseña. */
export function OwnerForm({ onSession }: { onSession: (s: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const mail = normalizeEmail(email);
    if (!isValidEmail(mail)) return setError("Escribe un correo válido.");
    const pwd = passwordError(password);
    if (pwd) return setError(pwd);
    setBusy(true);
    setError(null);
    try {
      onSession(await api.loginOwner(mail, password));
    } catch (err) {
      setError(isApiError(err) && err.code === "CREDENCIALES_INVALIDAS" ? "Correo o contraseña incorrectos." : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mt-6 grid gap-4">
      <Field label="Correo">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="tu@correo.pe" />
      </Field>
      <Field label="Contraseña">
        <div className="relative">
          <Input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="pr-11" />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-zinc-500 hover:text-zinc-800" aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={show}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>
      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={!email.trim() || !password}>
        Ingresar
      </Button>
    </form>
  );
}
