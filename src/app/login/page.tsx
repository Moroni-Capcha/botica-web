"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fingerprint, WifiOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api, apiMode, errorMessage, type BoticaPublic, type Session } from "@/lib/api";
import { tenantStore } from "@/lib/api/tenant";
import { useSessionStore } from "@/lib/auth/session-store";
import { useConfig, useStaff } from "@/lib/queries";
import { homeFor } from "@/lib/nav";
import { DigiHmeLogo } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { applyPinKey } from "@/lib/domain/pin";
import { useOnline } from "@/lib/offline/use-online";
import { KioskDialog } from "@/features/attendance/kiosk-dialog";
import { BoticaStep, lookupBotica } from "@/features/auth/botica-step";
import { BrandPanel } from "@/features/auth/brand-panel";
import { OwnerForm } from "@/features/auth/owner-form";
import { PinPad } from "@/features/auth/pin-pad";
import { TestHint } from "@/features/auth/test-hint";
import { UserList } from "@/features/auth/user-list";

type Mode = "mostrador" | "dueno";

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: config } = useConfig();
  const [botica, setBotica] = useState<BoticaPublic | null>(null);
  const [booting, setBooting] = useState(true);
  const [lastCode, setLastCode] = useState("");
  const [mode, setMode] = useState<Mode>("mostrador");
  const { data: staff, isLoading, isError, refetch } = useStaff(!!botica && mode === "mostrador");
  const signIn = useSessionStore((s) => s.signIn);
  const [selId, setSelId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kiosk, setKiosk] = useState(false);
  const online = useOnline();

  /** Recuerda la botica elegida y recarga lo que depende de ella (marca y lista de usuarios). */
  const choose = useCallback(
    (b: BoticaPublic) => {
      tenantStore.set(b.code);
      setLastCode(b.code);
      setBotica(b);
      void qc.invalidateQueries({ queryKey: ["config"] });
      void qc.invalidateQueries({ queryKey: ["staff"] });
    },
    [qc],
  );

  // Si ya había una botica guardada, se vuelve a reconocer sola.
  useEffect(() => {
    const saved = tenantStore.get();
    if (!saved) return setBooting(false);
    setLastCode(saved);
    void lookupBotica(saved).then((res) => {
      if ("botica" in res) choose(res.botica);
      setBooting(false);
    });
  }, [choose]);

  // Los colores de la botica elegida se ven desde el primer paso.
  useEffect(() => {
    if (!botica) return;
    document.documentElement.style.setProperty("--brand", botica.brand);
    document.documentElement.style.setProperty("--accent", botica.accent);
  }, [botica]);

  const changeBotica = () => {
    tenantStore.clear();
    setBotica(null);
    setSelId(null);
    setPin("");
    setError(null);
  };

  const enterOwner = (session: Session) => {
    signIn(session);
    router.replace(homeFor(session.user));
  };

  const sel = staff?.find((s) => s.id === selId);
  const branchName = (id: string | null) => (id ? config?.branches.find((b) => b.id === id)?.name ?? id : "Ve todos los locales");

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

  // Un PIN completo se envía una sola vez: tras entrar, el PIN sigue lleno mientras navega.
  const sentPin = useRef("");
  useEffect(() => {
    if (pin.length < 4) sentPin.current = "";
    else if (!busy && sentPin.current !== pin) {
      sentPin.current = pin;
      void submit(pin);
    }
  }, [pin, busy, submit]);

  const press = useCallback(
    (k: string) => {
      if (!sel || busy || mode !== "mostrador") return;
      setError(null);
      setPin((p) => applyPinKey(p, k));
    },
    [sel, busy, mode],
  );

  useEffect(() => {
    if (kiosk) return; // el teclado lo usa la marcación de asistencia
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      if (e.key === "Backspace") press("←");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, kiosk]);


  return (
    <main className="flex min-h-dvh w-full flex-col bg-surface lg:flex-row">
      <BrandPanel name={botica?.name ?? config?.pharmacy.name ?? "Botica"} tagline={botica?.tagline ?? config?.pharmacy.tagline} />

      <section className="flex flex-1 justify-center px-4 py-6 sm:px-8 sm:py-10">
        <div className="my-auto w-full max-w-md">
          {!online && (
            <Card padding="sm" className="mb-4 flex items-start gap-2.5 border-warning-border bg-warning-bg" role="status">
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-warning-fg" aria-hidden />
              <p className="text-small text-warning-fg">Sin conexión a internet. Revisa tu conexión para poder ingresar.</p>
            </Card>
          )}

          {booting ? (
            <div className="h-40 animate-pulse rounded-2xl bg-sunken" aria-hidden />
          ) : !botica ? (
            <div className="animate-line-in">
              <BoticaStep initialCode={lastCode} onFound={choose} mockHint={apiMode === "mock" ? "Modo de prueba sin servidor. Código de botica: botica-huanuco" : undefined} />
            </div>
          ) : (
            <div className="animate-line-in">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-semibold tracking-tight text-fg">{botica.name}</h2>
                  <p className="mt-1 text-small text-fg-2">Elige cómo quieres ingresar.</p>
                </div>
                <button
                  type="button"
                  onClick={changeBotica}
                  className="-mr-2 inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-small font-semibold text-brand underline underline-offset-2 transition-opacity duration-[var(--dur-fast)] hover:opacity-80"
                >
                  Cambiar botica
                </button>
              </div>
              <div className="mt-4">
                <Segmented<Mode>
                  label="Tipo de ingreso"
                  full
                  size="lg"
                  value={mode}
                  onChange={(m) => {
                    setMode(m);
                    setError(null);
                  }}
                  options={[
                    { id: "mostrador", label: "Mostrador" },
                    { id: "dueno", label: "Dueño" },
                  ]}
                />
              </div>
              {mode === "dueno" ? (
                <div key="dueno" className="animate-line-in">
                  <p className="mt-4 text-small text-fg-2">Ingresa con tu correo y contraseña.</p>
                  {apiMode === "mock" && <TestHint>Modo de prueba sin servidor. Correo: dueno@botica-huanuco.pe · Contraseña: Clave2026!</TestHint>}
                  <OwnerForm onSession={enterOwner} />
                </div>
              ) : (
                <div key="mostrador" className="animate-line-in">
                  <p className="mt-4 text-small text-fg-2">Elige tu usuario e ingresa tu PIN de 4 dígitos.</p>
                  {apiMode === "mock" && <TestHint>Modo de prueba sin servidor. PIN: administrador 1234 · principal 1111 · sucursal 2222</TestHint>}
                  <div className="mt-5">
                    <UserList
                      staff={staff}
                      loading={isLoading}
                      failed={isError}
                      onRetry={() => void refetch()}
                      selectedId={selId}
                      onSelect={(id) => {
                        setSelId(id);
                        setPin("");
                        setError(null);
                      }}
                      branchName={branchName}
                    />
                  </div>
                  <div className="mt-6">
                    <PinPad pin={pin} error={error} busy={busy} disabled={!sel} onKey={press} />
                  </div>
                </div>
              )}
            </div>
          )}

          <p className="mt-8 text-center text-small text-fg-2">
            ¿Aún no tienes botica?{" "}
            <Link href="/registro" className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-2">
              Crear mi botica
            </Link>
          </p>

          <Button onClick={() => setKiosk(true)} className="mt-2 w-full">
            <Fingerprint className="h-4 w-4 text-brand" aria-hidden /> Marcar asistencia del personal
          </Button>

          <div className="mt-8 flex flex-col items-center gap-1.5 border-t border-line-soft pt-6">
            <DigiHmeLogo height={36} />
            <p className="text-micro text-muted">Plataforma para boticas y farmacias</p>
          </div>
        </div>
      </section>
      {kiosk && config && <KioskDialog branches={config.branches} fixedBranch={null} onClose={() => setKiosk(false)} />}
    </main>
  );
}
