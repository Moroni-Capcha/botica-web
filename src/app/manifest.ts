import type { MetadataRoute } from "next";

/**
 * Manifiesto de la app instalable. Se genera al compilar, cuando todavía no se sabe qué botica la usará:
 * por eso lleva solo la marca de la plataforma (Digi!HME). El nombre y los colores de cada botica se aplican dentro de la app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Digi!HME · Sistema para boticas",
    short_name: "Digi!HME",
    description: "Ventas, lotes, vencimientos, caja e inventario para boticas y farmacias. Funciona sin internet en el punto de venta.",
    lang: "es-PE",
    start_url: "/pos",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#0b4f45",
    icons: [
      { src: "/brand/digihme-icon.png", sizes: "256x256", type: "image/png", purpose: "any" },
      { src: "/brand/digihme-icon.png", sizes: "256x256", type: "image/png", purpose: "maskable" },
    ],
  };
}
