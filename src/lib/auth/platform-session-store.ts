"use client";

import { create } from "zustand";
import type { PlatformSession } from "@/lib/api/types";
import { platformTokenStore } from "@/lib/api/token";

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

/** Sesión del operador de Digi!HME. Es independiente de `useSessionStore` (la sesión de una botica). */
export const usePlatformSession = create<PlatformSessionState>((set) => ({
  session: null,
  hydrated: false,
  hydrate: () => set({ session: readSession(), hydrated: true }),
  signIn: (session) => {
    platformTokenStore.set(session);
    set({ session });
  },
  signOut: () => {
    platformTokenStore.clear();
    set({ session: null });
  },
}));
