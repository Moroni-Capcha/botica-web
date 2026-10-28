import type { Metadata } from "next";
import { PanelScreen } from "@/features/dashboard/panel-screen";

export const metadata: Metadata = { title: "Panel del día" };

export default function PanelPage() {
  return <PanelScreen />;
}
