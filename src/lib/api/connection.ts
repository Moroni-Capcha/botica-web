/**
 * Estado de la conexión con el servidor. Une dos señales:
 *  - el navegador (`navigator.onLine` y los eventos online/offline), y
 *  - lo que vio la última llamada a la API (http.ts avisa si falló la red o si volvió).
 * Así también se detecta el wifi "conectado" pero sin internet, que el navegador no avisa.
 */
const listeners = new Set<() => void>();
let reachable = true;
let bound = false;

const browserOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);
const emit = () => listeners.forEach((fn) => fn());

function bind() {
  if (bound || typeof window === "undefined") return;
  bound = true;
  window.addEventListener("online", () => {
    // Al volver el internet se vuelve a intentar: la próxima llamada confirma o corrige.
    reachable = true;
    emit();
  });
  window.addEventListener("offline", emit);
}

export const connection = {
  /** true si hay red y el servidor respondió la última vez. */
  isOnline: (): boolean => browserOnline() && reachable,
  subscribe: (fn: () => void) => {
    bind();
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
  /** La API respondió (con éxito o con un error de negocio): hay conexión. */
  reportReachable: () => {
    if (reachable) return;
    reachable = true;
    emit();
  },
  /** Falló la red al llamar a la API. */
  reportUnreachable: () => {
    if (!reachable) return;
    reachable = false;
    emit();
  },
};
