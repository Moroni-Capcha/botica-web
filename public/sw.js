/*
 * Service worker de Digi!HME (escrito a mano, sin dependencias).
 * Objetivo: que el punto de venta abra sin internet.
 *  - Páginas: primero la red; si la red tarda, la copia de ESA misma página; sin internet, ver networkFirstPage.
 *  - Archivos de la app (/_next/static, /brand, íconos): se guardan al usarse y se sirven desde el equipo.
 *  - Nunca toca la API ni nada que no sea GET del mismo sitio: las ventas sin conexión las maneja la app (cola local).
 * Para publicar una versión nueva de este archivo, cambiar VERSION.
 */
const VERSION = "v2";
const PAGES = `digihme-pages-${VERSION}`;
const ASSETS = `digihme-assets-${VERSION}`;
const PRECACHE = ["/", "/login", "/pos", "/manifest.webmanifest", "/brand/digihme-icon.png", "/brand/digihme-icon-72.png", "/brand/digihme-logo.png", "/brand/digihme-logo-480.png"];
const NAV_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGES);
      // Si alguna no se puede bajar (p. ej. sin red al instalar), no se cancela la instalación.
      await Promise.allSettled(
        PRECACHE.map(async (url) => {
          const res = await fetch(url, { cache: "reload" });
          if (res.ok && !res.redirected) await cache.put(url, res);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGES, ASSETS]);
      for (const key of await caches.keys()) if (key.startsWith("digihme-") && !keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

const isAsset = (url) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/") || /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname);

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

/*
 * Regla: nunca se muestra OTRA pantalla en lugar de la pedida porque el servidor tarde.
 *  - Con la red al día: la página pedida.
 *  - Red lenta y hay copia de ESA página: su copia (así abre rápido); si no hay copia, se espera a la red.
 *  - Sin internet de verdad (la petición falla): la copia de esa página; si no la hay, el punto de venta,
 *    que es la pantalla que funciona sin conexión.
 * Antes, una espera de más de 4 s servía el punto de venta para cualquier ruta; con un servidor lento
 * (p. ej. `npm run dev` compilando una pantalla) parecía que el menú solo abría el punto de venta.
 */
async function networkFirstPage(request) {
  const cache = await caches.open(PAGES);
  const url = new URL(request.url);
  const network = fetch(request).then((res) => {
    // Una respuesta con redirección no se puede servir después como página; se guarda solo la directa.
    if (res.ok && !res.redirected) cache.put(url.pathname, res.clone());
    return res;
  });
  network.catch(() => undefined); // si la copia gana la carrera y la red falla después, no es un error pendiente
  const own = await cache.match(url.pathname);
  try {
    if (!own) return await network;
    return await Promise.race([network, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NAV_TIMEOUT_MS))]);
  } catch {
    return own || (await cache.match("/pos")) || (await cache.match("/")) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // la API del backend queda fuera
  if (url.pathname === "/sw.js" || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
  } else if (isAsset(url)) {
    event.respondWith(cacheFirst(request).catch(() => Response.error()));
  }
});
