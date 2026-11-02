"use client";

import { create } from "zustand";
import { tenantStore } from "@/lib/api/tenant";
import {
  applyBatchError, applyOutcome, discardFailed, emptyQueue, enqueueSale, forceDue, markSyncing, pruneSynced, restoreQueue, retryFailed,
  type EnqueueInput, type QueuedSale, type QueueState, type SyncOutcome,
} from "@/lib/domain/offline-sales";
import { kvGet, kvSet } from "./storage";

/** Cada botica tiene su propia cola en este equipo: no se mezclan ventas de una con otra. */
const keyFor = () => `sales-queue.${tenantStore.get() ?? "default"}`;

interface QueueStore {
  state: QueueState;
  hydrated: boolean;
  /** Lee la cola guardada. Se puede llamar muchas veces; solo lee una vez por botica. */
  hydrate: () => Promise<void>;
  enqueue: (input: EnqueueInput) => Promise<QueuedSale>;
  markSyncing: (ids: string[]) => void;
  outcome: (id: string, outcome: SyncOutcome) => void;
  batchError: (ids: string[], error: { code?: string; status?: number; message: string }) => void;
  forceDue: () => void;
  retry: (id: string) => void;
  discard: (id: string) => void;
}

let loadedKey: string | null = null;
let loading: Promise<void> | null = null;

export const useQueueStore = create<QueueStore>((set, get) => {
  /** Cambia la cola y la guarda. Lo último en escribirse es lo que queda. */
  const update = (fn: (s: QueueState) => QueueState) => {
    const next = fn(get().state);
    if (next === get().state) return;
    set({ state: next });
    void kvSet(loadedKey ?? keyFor(), next);
  };

  return {
    state: emptyQueue(),
    hydrated: false,
    hydrate: () => {
      const key = keyFor();
      if (loadedKey === key) return loading ?? Promise.resolve();
      if (loadedKey !== null) set({ state: emptyQueue(), hydrated: false }); // otra botica: no arrastrar su cola
      loadedKey = key;
      loading = kvGet<unknown>(key).then((raw) => {
        if (loadedKey !== key) return;
        /* Si ya se encoló algo mientras se leía, se conserva (primero lo guardado, luego lo nuevo). */
        const saved = restoreQueue(raw);
        const current = get().state;
        const merged = current.items.length ? { items: [...saved.items, ...current.items.filter((c) => !saved.items.some((s) => s.clientSaleId === c.clientSaleId))], nextSeq: Math.max(saved.nextSeq, current.nextSeq) } : saved;
        set({ state: pruneSynced(merged, Date.now()), hydrated: true });
      });
      return loading;
    },
    enqueue: async (input) => {
      await get().hydrate();
      const { state, item } = enqueueSale(get().state, input);
      update(() => state);
      return item;
    },
    markSyncing: (ids) => update((s) => markSyncing(s, ids)),
    outcome: (id, outcome) => update((s) => applyOutcome(s, id, outcome, Date.now())),
    batchError: (ids, error) => update((s) => applyBatchError(s, ids, error, Date.now())),
    forceDue: () => update(forceDue),
    retry: (id) => update((s) => retryFailed(s, id)),
    discard: (id) => update((s) => discardFailed(s, id)),
  };
});
