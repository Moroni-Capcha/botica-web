"use client";

import { useState, type FormEvent } from "react";
import { api, errorMessage, isApiError, type BoticaPublic } from "@/lib/api";
import { isValidBoticaCode, normalizeBoticaCode } from "@/lib/domain/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

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
    <form onSubmit={submit} noValidate>
      <h2 className="text-xl font-semibold tracking-tight">Ingresa a tu botica</h2>
      <p className="mt-1 text-sm text-zinc-500">Escribe el código de tu botica para continuar.</p>
      {mockHint && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{mockHint}</p>}
      <Field label="Código de la botica" error={error ?? undefined} className="mt-6">
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="botica-huanuco" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus aria-invalid={!!error} />
      </Field>
      <Button type="submit" variant="primary" size="lg" className="mt-4 w-full" loading={busy} disabled={!code.trim()}>
        Continuar
      </Button>
    </form>
  );
}
