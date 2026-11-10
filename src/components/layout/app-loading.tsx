import { DigiHmeIcon } from "@/components/brand-mark";

/** Pantalla de arranque mientras se recupera la sesión: el ícono de la plataforma, sin nombre de ninguna botica. */
export function AppLoading() {
  return (
    <div role="status" aria-live="polite" className="grid min-h-dvh place-items-center bg-canvas">
      <div className="flex flex-col items-center gap-3">
        <DigiHmeIcon size={48} className="animate-pulse" />
        <span className="text-sm text-muted">Cargando…</span>
      </div>
    </div>
  );
}
