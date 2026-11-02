"use client";

import { create } from "zustand";
import type { PlatformSession } from "@/lib/api/types";
import { platformTokenStore } from "@/lib/api/token";
import { setMonitoringUser } from "@/lib/monitoring";

interface PlatformSessionState {
  session: PlatformSession | null;
  hydrated: boolean;
  hydrate: () => void;
  signIn: (s: PlatformSession) => void;
  signOut: () => void;
}

const readSession = (): PlatformSession | null => {
  const raw = platformTokenStore.getRaw();
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as PlatformSession;
    return new Date(s.expiresAt).getTime() > Date.now() ? s : null;
  } catch {
    return null;
  }
};

/** En el monitoreo el operador no pertenece a ninguna botica: solo su rol y su id interno. */
const trackOperator = (s: PlatformSession | null) => setMonitoringUser(s ? { role: "operador-digihme", userId: s.operator.id } : null);

/** Sesión del operador de Digi!HME. Es independiente de `useSessionStore` (la sesión de una botica). */
export const usePlatformSession = create<PlatformSessionState>((set) => ({
  session: null,
  hydrated: false,
  hydrate: () => {
    const session = readSession();
    trackOperator(session);
    set({ session, hydrated: true });
  },
  signIn: (session) => {
    platformTokenStore.set(session);
    trackOperator(session);
    set({ session });
  },
  signOut: () => {
    platformTokenStore.clear();
    trackOperator(null);
    set({ session: null });
  },
}));
