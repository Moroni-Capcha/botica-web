import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prueba el service worker real (public/sw.js) con un navegador de mentira: caché en memoria, red que se simula y reloj falso.
 * Regla que se cuida: nunca se muestra OTRA pantalla en lugar de la que se pidió, salvo que no haya internet de verdad.
 */
const SOURCE = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
/** La caché de páginas lleva la versión del service worker (cambia al publicar uno nuevo). */
const PAGES_CACHE = `digihme-pages-${SOURCE.match(/const VERSION = "([^"]+)"/)?.[1] ?? "?"}`;

type Listener = (event: unknown) => void;
const html = (name: string) => new Response(`<title>${name}</title>`, { status: 200 });

function makeBrowser(network: (url: string) => Promise<Response>) {
  const store = new Map<string, Map<string, Response>>();
  const caches = {
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      const m = store.get(name)!;
      return { match: async (k: string) => m.get(typeof k === "string" ? k : (k as unknown as Request).url)?.clone(), put: async (k: string, r: Response) => void m.set(k, r.clone()) };
    },
    keys: async () => [...store.keys()],
    delete: async (n: string) => store.delete(n),
  };
  const listeners: Record<string, Listener> = {};
  const self = { location: { origin: "http://app.test" }, addEventListener: (t: string, f: Listener) => (listeners[t] = f), skipWaiting: async () => {}, clients: { claim: async () => {} } };
  const fetchStub = (req: string | Request) => network(typeof req === "string" ? req : req.url);
  const timers = { setTimeout: (...a: Parameters<typeof setTimeout>) => globalThis.setTimeout(...a), clearTimeout: (id: Parameters<typeof clearTimeout>[0]) => globalThis.clearTimeout(id) };
  vm.runInNewContext(SOURCE, { self, caches, fetch: fetchStub, URL, Response, Promise, Set, console, ...timers });

  /** Pide una página como lo haría el navegador y devuelve el título que se mostraría. */
  const navigate = async (path: string) => {
    let answer: Promise<Response> | undefined;
    listeners["fetch"]!({ request: { method: "GET", url: `http://app.test${path}`, mode: "navigate" }, respondWith: (p: Promise<Response>) => (answer = p) });
    const res = await answer!;
    return (await res.text()).replace(/<\/?title>/g, "");
  };
  const seed = async (path: string, name: string) => (await caches.open(PAGES_CACHE)).put(path, html(name));
  return { navigate, seed };
}

const sleep = (ms: number) => new Promise<Response>((ok) => globalThis.setTimeout(() => ok(html("tarde")), ms));

describe("service worker: páginas", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("con la red al día, muestra la página pedida", async () => {
    const b = makeBrowser(async (u) => html(u.endsWith("/caja") ? "Caja" : "Otra"));
    await b.seed("/pos", "Punto de venta");
    expect(await b.navigate("/caja")).toBe("Caja");
  });

  it("si la red tarda y NO hay copia de esa página, espera a la red: no muestra el punto de venta en su lugar", async () => {
    const b = makeBrowser(() => sleep(9000));
    await b.seed("/pos", "Punto de venta");
    const pending = b.navigate("/caja");
    await vi.advanceTimersByTimeAsync(9000);
    expect(await pending).toBe("tarde");
  });

  it("si la red tarda y SÍ hay copia de esa misma página, usa esa copia (no otra pantalla)", async () => {
    const b = makeBrowser(() => sleep(9000));
    await b.seed("/pos", "Punto de venta");
    await b.seed("/caja", "Caja (copia)");
    const pending = b.navigate("/caja");
    await vi.advanceTimersByTimeAsync(4100);
    expect(await pending).toBe("Caja (copia)");
  });

  it("sin internet de verdad y sin copia de esa página, abre el punto de venta (que sí funciona sin conexión)", async () => {
    const b = makeBrowser(async () => {
      throw new TypeError("Failed to fetch");
    });
    await b.seed("/pos", "Punto de venta");
    expect(await b.navigate("/vencimientos")).toBe("Punto de venta");
  });

  it("sin internet y con copia de esa página, usa su copia", async () => {
    const b = makeBrowser(async () => {
      throw new TypeError("Failed to fetch");
    });
    await b.seed("/pos", "Punto de venta");
    await b.seed("/caja", "Caja (copia)");
    expect(await b.navigate("/caja")).toBe("Caja (copia)");
  });
});
