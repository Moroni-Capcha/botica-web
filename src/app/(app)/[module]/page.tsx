import Link from "next/link";
import { notFound } from "next/navigation";
import { Hammer } from "lucide-react";
import { NAV } from "@/lib/nav";

/** Módulos que aún no se migran del prototipo. Se reemplazan uno por uno por su propia carpeta en app/(app)/. */
export default async function PendingModule({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const item = NAV.find((n) => n.id === module);
  if (!item) notFound();
  return (
    <div className="mx-auto grid max-w-xl place-items-center px-6 py-20 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-zinc-100 text-zinc-500">
        <Hammer className="h-7 w-7" />
      </span>
      <h2 className="mt-4 text-xl font-semibold tracking-tight">{item.label}: en construcción</h2>
      <p className="mt-2 text-sm text-zinc-500">Este módulo ya está diseñado en el prototipo y se está pasando a la versión final. Mientras tanto puedes usar el punto de venta.</p>
      <Link href="/pos" className="mt-6 inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white">
        Ir al punto de venta
      </Link>
    </div>
  );
}

export function generateStaticParams() {
  return NAV.filter((n) => !n.ready).map((n) => ({ module: n.id }));
}
