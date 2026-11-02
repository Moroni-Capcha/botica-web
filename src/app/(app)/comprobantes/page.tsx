import type { Metadata } from "next";
import { VouchersScreen } from "@/features/vouchers/vouchers-screen";

export const metadata: Metadata = { title: "Comprobantes" };

export default function VouchersPage() {
  return <VouchersScreen />;
}
