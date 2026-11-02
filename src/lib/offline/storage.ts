/**
 * Almacenamiento local que sobrevive a cerrar el navegador. Usa IndexedDB y, si no está disponible
 * (modo privado, navegador antiguo), localStorage. Si tampoco hay, queda en memoria (se pierde al recargar).
 * Todo es asíncrono y nunca lanza: un fallo de almacenamiento no debe frenar una venta.
 */
const DB_NAME = "digihme-offline";
const STORE = "kv";

const memory = new Map<string, unknown>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

const lsKey = (key: string) => `bh.offline.${key}`;

function idbGet(db: IDBDatabase, key: string): Promise<{ value: unknown } | null> {
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result === undefined ? null : { value: req.result });
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbSet(db: IDBDatabase, key: string, value: unknown): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (db) {
    const hit = await idbGet(db, key);
    if (hit) return hit.value as T;
  }
  try {
    const raw = localStorage.getItem(lsKey(key));
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* sin localStorage o dato dañado */
  }
  return (memory.get(key) as T | undefined) ?? null;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  memory.set(key, value);
  const db = await openDb();
  if (db && (await idbSet(db, key, value))) {
    try {
      localStorage.removeItem(lsKey(key)); // ya está en IndexedDB: no dejar una copia vieja
    } catch {
      /* nada */
    }
    return;
  }
  try {
    localStorage.setItem(lsKey(key), JSON.stringify(value));
  } catch {
    /* sin espacio o sin acceso: queda en memoria */
  }
}
