import type { Metadata } from "next";
import { PosScreen } from "@/features/pos/pos-screen";

export const metadata: Metadata = { title: "Punto de venta" };

export default function PosPage() {
  return <PosScreen />;
}
