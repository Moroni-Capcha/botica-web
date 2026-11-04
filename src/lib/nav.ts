import { ArrowLeftRight, CalendarClock, ChartColumn, Clock, FileText, LayoutDashboard, Package, ScrollText, Settings, ShoppingCart, Truck, Users, Wallet, type LucideIcon } from "lucide-react";
import type { User } from "@/lib/api/types";

export interface NavItem {
  id: string;
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { id: "panel", href: "/panel", label: "Panel del día", short: "Panel", icon: LayoutDashboard },
  { id: "pos", href: "/pos", label: "Punto de venta", short: "Vender", icon: ShoppingCart },
  { id: "vencimientos", href: "/vencimientos", label: "Vencimientos", short: "Venc.", icon: CalendarClock },
  { id: "inventario", href: "/inventario", label: "Inventario", short: "Stock", icon: Package },
  { id: "traslados", href: "/traslados", label: "Traslados", short: "Traslados", icon: ArrowLeftRight },
  { id: "compras", href: "/compras", label: "Compras", short: "Compras", icon: Truck },
  { id: "clientes", href: "/clientes", label: "Clientes", short: "Clientes", icon: Users },
  { id: "caja", href: "/caja", label: "Caja", short: "Caja", icon: Wallet },
  { id: "comprobantes", href: "/comprobantes", label: "Comprobantes", short: "SUNAT", icon: FileText },
  { id: "asistencia", href: "/asistencia", label: "Asistencia", short: "Asistencia", icon: Clock },
  { id: "reportes", href: "/reportes", label: "Reportes", short: "Reportes", icon: ChartColumn },
  { id: "auditoria", href: "/auditoria", label: "Auditoría", short: "Auditoría", icon: ScrollText },
  { id: "ajustes", href: "/ajustes", label: "Ajustes", short: "Ajustes", icon: Settings },
];

/** Módulos del rol que además incluye el plan. Sin datos de cuenta (`modules` indefinido) se muestran todos los del rol. */
export const navFor = (user: User, modules?: readonly string[]) => NAV.filter((n) => user.permissions.includes(n.id) && (!modules || modules.includes(n.id)));

/** Primera pantalla al entrar: el administrador ve el panel; las cuentas de local, el punto de venta. */
export const homeFor = (user: User) => {
  const items = navFor(user);
  const preferred = user.role === "admin" ? "panel" : "pos";
  return (items.find((n) => n.id === preferred) ?? items[0])?.href ?? "/pos";
};
