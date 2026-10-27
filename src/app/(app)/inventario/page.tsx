import type { Metadata } from "next";
import { InventoryScreen } from "@/features/inventory/inventory-screen";

export const metadata: Metadata = { title: "Inventario" };

export default function InventoryPage() {
  return <InventoryScreen />;
}
