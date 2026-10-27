import type { Metadata } from "next";
import { ExpiryScreen } from "@/features/expiry/expiry-screen";

export const metadata: Metadata = { title: "Vencimientos" };

export default function ExpiryPage() {
  return <ExpiryScreen />;
}
