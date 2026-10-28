import { ArrowLeftRight, CalendarClock, ChartColumn, Clock, LayoutDashboard, Package, Settings, ShoppingCart, Truck, Users, Wallet, type LucideIcon } from "lucide-react";
import type { User } from "@/lib/api/types";

export interface NavItem {
  id: string;
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  /** false = la pantalla aún no está migrada del prototipo */
  ready: boolean;
}

export const NAV: NavItem[] = [
  { id: "panel", href: "/panel", label: "Panel del día", short: "Panel", icon: LayoutDashboard, ready: true },
  { id: "pos", href: "/pos", label: "Punto de venta", short: "Vender", icon: ShoppingCart, ready: true },
  { id: "vencimientos", href: "/vencimientos", label: "Vencimientos", short: "Venc.", icon: CalendarClock, ready: true },
  { id: "inventario", href: "/inventario", label: "Inventario", short: "Stock", icon: Package, ready: true },
  { id: "traslados", href: "/traslados", label: "Traslados", short: "Traslados", icon: ArrowLeftRight, ready: true },
  { id: "compras", href: "/compras", label: "Compras", short: "Compras", icon: Truck, ready: true },
  { id: "clientes", href: "/clientes", label: "Clientes", short: "Clientes", icon: Users, ready: true },
  { id: "caja", href: "/caja", label: "Caja", short: "Caja", icon: Wallet, ready: true },
  { id: "asistencia", href: "/asistencia", label: "Asistencia", short: "Asistencia", icon: Clock, ready: true },
  { id: "reportes", href: "/reportes", label: "Reportes", short: "Reportes", icon: ChartColumn, ready: true },
  { id: "ajustes", href: "/ajustes", label: "Ajustes", short: "Ajustes", icon: Settings, ready: true },
];

export const navFor = (user: User) => NAV.filter((n) => user.permissions.includes(n.id));

/** Primera pantalla al entrar: el administrador ve el panel; las cuentas de local, el punto de venta. */
export const homeFor = (user: User) => {
  const items = navFor(user).filter((n) => n.ready);
  const preferred = user.role === "admin" ? "panel" : "pos";
  return (items.find((n) => n.id === preferred) ?? items[0])?.href ?? "/pos";
};
