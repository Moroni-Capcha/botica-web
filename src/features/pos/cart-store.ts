"use client";

import { create } from "zustand";
import type { BranchId, Customer, PresentationId } from "@/lib/api/types";
import type { CartItem } from "@/lib/domain/pharmacy";

interface BranchCart {
  items: CartItem[];
  customer: Customer | null;
}

interface CartState {
  carts: Record<BranchId, BranchCart>;
  add: (branch: BranchId, productId: number, presentation: PresentationId, qty?: number) => void;
  setQty: (branch: BranchId, key: string, qty: number) => void;
  remove: (branch: BranchId, key: string) => void;
  clear: (branch: BranchId) => void;
  setCustomer: (branch: BranchId, customer: Customer | null) => void;
}

const empty: BranchCart = { items: [], customer: null };
let seq = 0;

/** Un carrito por local: el administrador puede cambiar de local sin perder la venta a medias. */
export const useCartStore = create<CartState>((set) => ({
  carts: {},
  add: (branch, productId, presentation, qty = 1) =>
    set((s) => {
      const cart = s.carts[branch] ?? empty;
      const found = cart.items.find((i) => i.productId === productId && i.presentation === presentation);
      const items = found
        ? cart.items.map((i) => (i === found ? { ...i, qty: i.qty + qty } : i))
        : [...cart.items, { key: `${Date.now().toString(36)}-${++seq}`, productId, presentation, qty }];
      return { carts: { ...s.carts, [branch]: { ...cart, items } } };
    }),
  setQty: (branch, key, qty) =>
    set((s) => {
      const cart = s.carts[branch] ?? empty;
      const items = qty <= 0 ? cart.items.filter((i) => i.key !== key) : cart.items.map((i) => (i.key === key ? { ...i, qty } : i));
      return { carts: { ...s.carts, [branch]: { ...cart, items } } };
    }),
  remove: (branch, key) =>
    set((s) => {
      const cart = s.carts[branch] ?? empty;
      return { carts: { ...s.carts, [branch]: { ...cart, items: cart.items.filter((i) => i.key !== key) } } };
    }),
  clear: (branch) => set((s) => ({ carts: { ...s.carts, [branch]: empty } })),
  setCustomer: (branch, customer) => set((s) => ({ carts: { ...s.carts, [branch]: { ...(s.carts[branch] ?? empty), customer } } })),
}));

export const useBranchCart = (branch: BranchId) => useCartStore((s) => s.carts[branch] ?? empty);
