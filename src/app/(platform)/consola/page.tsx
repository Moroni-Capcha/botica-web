import type { Metadata } from "next";
import { ConsoleApp } from "@/features/platform/console-app";

export const metadata: Metadata = { title: "Consola interna", robots: { index: false, follow: false } };

export default function ConsolePage() {
  return <ConsoleApp />;
}
