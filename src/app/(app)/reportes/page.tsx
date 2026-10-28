import type { Metadata } from "next";
import { ReportsScreen } from "@/features/reports/reports-screen";

export const metadata: Metadata = { title: "Reportes" };

export default function ReportsPage() {
  return <ReportsScreen />;
}
