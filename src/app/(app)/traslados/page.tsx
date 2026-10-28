import type { Metadata } from "next";
import { TransfersScreen } from "@/features/transfers/transfers-screen";

export const metadata: Metadata = { title: "Traslados" };

export default function TransfersPage() {
  return <TransfersScreen />;
}
