"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { api, errorMessage, isApiError, type BoticaPublic } from "@/lib/api";
import { isValidBoticaCode, normalizeBoticaCode } from "@/lib/domain/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { TestHint } from "./test-hint";

/** Resuelve el código de una botica. Devuelve sus datos públicos o un mensaje de error listo para mostrar. */
export async function lookupBotica(raw: string): Promise<{ botica: BoticaPublic } | { error: string }> {
  const code = normalizeBoticaCode(raw);
  if (!isValidBoticaCode(code)) return { error: "El código usa letras minúsculas, números y guiones (por ejemplo botica-huanuco)." };
  try {
    return { botica: await api.resolveBotica(code) };
  } catch (e) {
    if (isApiError(e) && e.code === "BOTICA_NO_ENCONTRADA") return { error: "No encontramos una botica con ese código. Revísalo o pídeselo a quien administra tu botica." };
    return { error: errorMessage(e) };
  }
}

/** Paso 1 del ingreso: el código de la botica. */
export function BoticaStep({ initialCode, onFound, mockHint }: { initialCode: string; onFound: (b: BoticaPublic) => void; mockHint?: string }) {
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  // El foco inicial solo con mouse o lápiz: en una tablet o un celular abriría el teclado de pantalla sin que lo pidan.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await lookupBotica(code);
    setBusy(false);
    if ("error" in res) setError(res.error);
    else onFound(res.botica);
  };

  return (
    <form onSubmit={submit} noValidate aria-busy={busy}>
      <h2 className="text-2xl font-semibold tracking-tight text-fg">Ingresa a tu botica</h2>
      <p className="mt-1 text-small text-fg-2">Escribe el código de tu botica para continuar.</p>
      {mockHint && <TestHint>{mockHint}</TestHint>}
      <Field label="Código de la botica" hint="Si no lo recuerdas, pídelo a quien administra tu botica." className="mt-6">
        <Input
          ref={inputRef}
          name="botica"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="botica-huanuco"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className="h-12 text-base"
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        />
      </Field>
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-small text-danger-fg">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" className="mt-4 w-full" loading={busy} disabled={!code.trim()}>
        Continuar
      </Button>
    </form>
  );
}
