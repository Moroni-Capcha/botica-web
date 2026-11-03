import { ArrowLeftRight, CalendarClock, FileSpreadsheet, Pill, TrendingUp } from "lucide-react";
import { BrandMark, DigiSeal } from "@/components/brand-mark";

const FEATURES = [
  { icon: ArrowLeftRight, text: "Varios locales con stock separado y traslados" },
  { icon: CalendarClock, text: "Lotes con fecha de vencimiento y alertas por semáforo" },
  { icon: TrendingUp, text: "Prioridad de venta: qué vender primero antes de perderlo" },
  { icon: Pill, text: "Venta por unidad, blíster o caja, genéricos y receta" },
  { icon: FileSpreadsheet, text: "Reportes e inventario exportables a Excel" },
];

/**
 * Columna de marca del ingreso, con los colores de la botica. En pantallas chicas queda solo el encabezado
 * (marca y nombre) para que el formulario se vea sin bajar.
 */
export function BrandPanel({ name, tagline }: { name: string; tagline?: string }) {
  return (
    <section className="relative flex flex-col justify-between overflow-hidden bg-brand px-4 py-4 text-white sm:px-10 lg:w-[44%] lg:py-12">
      <svg className="pointer-events-none absolute -bottom-16 -right-16 hidden h-96 w-96 text-white opacity-[0.06] lg:block" viewBox="0 0 48 48" aria-hidden>
        <path d="M19 9h10v10h10v10H29v10H19V29H9V19h10z" fill="currentColor" />
      </svg>
      <div className="flex items-center gap-3">
        <BrandMark size={44} />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-lg font-semibold">{name}</p>
          {tagline && <p className="truncate text-caption text-white/80">{tagline}</p>}
        </div>
      </div>
      <div className="relative max-w-md lg:my-10">
        <p className="hidden text-caption font-semibold uppercase tracking-widest text-accent lg:block">Sistema para boticas</p>
        <h1 className="max-lg:sr-only text-balance text-4xl font-semibold leading-tight tracking-tight lg:mt-3">Ventas, lotes y vencimientos bajo control.</h1>
        <ul className="mt-8 hidden gap-4 lg:grid">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm text-white/90">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10">
                <Icon className="h-4 w-4 text-accent" aria-hidden />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative hidden lg:block">
        <DigiSeal light />
      </div>
    </section>
  );
}
