import type { Metadata } from "next";
import { CustomersScreen } from "@/features/customers/customers-screen";

export const metadata: Metadata = { title: "Clientes" };

export default function CustomersPage() {
  return <CustomersScreen />;
}
