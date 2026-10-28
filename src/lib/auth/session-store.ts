"use client";

import { create } from "zustand";
import type { BranchId, Session } from "@/lib/api/types";
import { tokenStore } from "@/lib/api/token";
import { useConfig } from "@/lib/queries";

interface SessionState {
  session: Session | null;
  hydrated: boolean;
  /** Local donde opera el administrador (los encargados siempre operan en el suyo). */
  adminBranch: BranchId;
  hydrate: () => void;
  signIn: (s: Session) => void;
  signOut: () => void;
  setAdminBranch: (b: BranchId) => void;
}

const readSession = (): Session | null => {
  const raw = tokenStore.getRaw();
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    return new Date(s.expiresAt).getTime() > Date.now() ? s : null;
  } catch {
    return null;
  }
};

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  hydrated: false,
  adminBranch: "principal",
  hydrate: () => set({ session: readSession(), hydrated: true }),
  signIn: (session) => {
    tokenStore.set(session);
    set({ session });
  },
  signOut: () => {
    tokenStore.clear();
    set({ session: null });
  },
  setAdminBranch: (adminBranch) => set({ adminBranch }),
}));

/** Local en el que se vende, cobra y recibe mercadería. Si el que eligió el administrador se desactivó, usa el primero activo. */
export const useOperatingBranch = (): BranchId => {
  const user = useSessionStore((s) => s.session?.user);
  const adminBranch = useSessionStore((s) => s.adminBranch);
  const branches = useConfig().data?.branches;
  if (user?.branchId) return user.branchId;
  if (branches?.length && !branches.some((b) => b.id === adminBranch)) return branches[0]!.id;
  return adminBranch;
};
