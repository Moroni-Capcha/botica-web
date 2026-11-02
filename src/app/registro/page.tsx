import type { Metadata } from "next";
import { SignupScreen } from "@/features/onboarding/signup-screen";

export const metadata: Metadata = { title: "Crear mi botica" };

export default function RegistroPage() {
  return <SignupScreen />;
}
