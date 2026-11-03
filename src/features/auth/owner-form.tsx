"use client";

import { useId, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { api, errorMessage, isApiError, type Session } from "@/lib/api";
import { isValidEmail, normalizeEmail, passwordError } from "@/lib/domain/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";

/** Ingreso del dueño con correo y contraseña. */
export function OwnerForm({ onSession }: { onSession: (s: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorId = useId();

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
    <form onSubmit={submit} noValidate aria-busy={busy} className="mt-5 grid gap-4">
      <Field label="Correo">
        <Input
          type="email"
          name="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="tu@correo.pe"
          className="h-12 text-base"
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        />
      </Field>
      <div className="relative">
        <Field label="Contraseña">
          <Input
            type={show ? "text" : "password"}
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="h-12 pr-12 text-base"
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
          />
        </Field>
        <IconButton onClick={() => setShow((v) => !v)} className="absolute bottom-1 right-1" aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={show}>
          {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </IconButton>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-small text-danger-fg">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={!email.trim() || !password}>
        Ingresar
      </Button>
    </form>
  );
}
