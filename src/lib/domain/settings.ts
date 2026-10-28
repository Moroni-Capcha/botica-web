/**
 * Ajustes (reglas puras, se prueban con Vitest): datos de la botica, locales y series, cuentas y reglas de operación.
 * El backend valida lo mismo; aquí se usa para avisar antes de guardar.
 */
import type { AccountInput, AttendanceSettings, Branch, BranchInput, ExpiryThresholds, Pharmacy, PurchasingSettings, StaffAccount } from "@/lib/api/types";
import { expiryTone, isValidRuc } from "./pharmacy";

export type Errors<T> = Partial<Record<keyof T, string>>;
const clean = <T extends object>(e: Errors<T>): Errors<T> => Object.fromEntries(Object.entries(e).filter(([, v]) => v)) as Errors<T>;
export const hasErrors = (e: object) => Object.keys(e).length > 0;

/* ------------------------------ Colores ------------------------------ */

export const isHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s);

/** Luminancia relativa WCAG de un color #rrggbb. */
export function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

/** Contraste WCAG entre dos colores (1 a 21). */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m) as [number, number];
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

/* ------------------------------ Botica ------------------------------ */

export function pharmacyErrors(p: Pharmacy): Errors<Pharmacy> {
  return clean<Pharmacy>({
    name: p.name.trim().length < 3 ? "Escribe el nombre comercial" : p.name.trim().length > 40 ? "Máximo 40 caracteres" : undefined,
    tagline: p.tagline.trim().length > 60 ? "Máximo 60 caracteres" : undefined,
    ruc: !isValidRuc(p.ruc) ? "11 dígitos, empieza en 10 o 20" : undefined,
    phone: p.phone && !/^[\d\s+()-]{6,20}$/.test(p.phone) ? "Solo números, espacios y guiones" : undefined,
    brand: !isHex(p.brand) ? "Color en formato #RRGGBB" : contrast(p.brand, "#ffffff") < 4.5 ? "Muy claro: el texto blanco encima no se lee (contraste menor a 4,5)" : undefined,
    accent: !isHex(p.accent) ? "Color en formato #RRGGBB" : undefined,
  });
}

export const normalizePharmacy = (p: Pharmacy): Pharmacy => ({ ...p, name: p.name.trim(), tagline: p.tagline.trim(), phone: p.phone.trim(), brand: p.brand.toUpperCase(), accent: p.accent.toUpperCase() });

/* ------------------------------ Locales ------------------------------ */

export function branchErrors(input: BranchInput, branches: Branch[], selfId: string): Errors<BranchInput> {
  const name = input.name.trim();
  return clean<BranchInput>({
    name: name.length < 3 ? "Escribe el nombre del local" : name.length > 24 ? "Máximo 24 caracteres" : branches.some((b) => b.id !== selfId && b.name.toLowerCase() === name.toLowerCase()) ? "Ya hay un local con ese nombre" : undefined,
    address: input.address.trim().length < 5 ? "Escribe la dirección" : undefined,
    series: !/^\d{3}$/.test(input.series) || input.series === "000" ? "3 dígitos, de 001 a 999" : branches.some((b) => b.id !== selfId && b.series === input.series) ? "Otro local ya usa esa serie" : undefined,
  });
}

/** Código interno del local a partir del nombre ("Sucursal Norte" → "sucursal-norte"), sin repetir. */
export function branchSlug(name: string, takenIds: string[]): string {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "local";
  let id = base;
  for (let i = 2; takenIds.includes(id); i++) id = `${base}-${i}`;
  return id;
}

/** Siguiente serie libre (001, 002…), contando también las de locales desactivados. */
export function nextSeries(branches: Branch[]): string {
  const used = new Set(branches.map((b) => b.series));
  for (let n = 1; n < 1000; n++) {
    const s = String(n).padStart(3, "0");
    if (!used.has(s)) return s;
  }
  return "";
}

/** Uso del plan: cuántos locales activos hay y si se puede abrir otro. */
export function planUsage(branches: Branch[], maxBranches: number) {
  const active = branches.filter((b) => b.active).length;
  return { active, max: maxBranches, canAdd: active < maxBranches, left: Math.max(0, maxBranches - active) };
}

export interface BranchState {
  /** Unidades vigentes o vencidas que todavía tiene el local */
  stockUnits: number;
  cashOpen: boolean;
  pendingTransfers: number;
  activeBranches: number;
}

/** Lo que impide desactivar un local. Vacío = se puede. */
export function deactivateBlockers(s: BranchState): string[] {
  const out: string[] = [];
  if (s.activeBranches <= 1) out.push("Es el único local activo.");
  if (s.stockUnits > 0) out.push(`Todavía tiene ${s.stockUnits.toLocaleString("es-PE")} unidades en stock: trasládalas a otro local o dalas de baja.`);
  if (s.cashOpen) out.push("Su caja está abierta: ciérrala primero.");
  if (s.pendingTransfers > 0) out.push(s.pendingTransfers === 1 ? "Tiene 1 traslado pendiente: recíbelo o anúlalo." : `Tiene ${s.pendingTransfers} traslados pendientes: recíbelos o anúlalos.`);
  return out;
}

/** Número de comprobante con su serie: B001-003121. */
export const docNumber = (type: "boleta" | "factura", series: string, n: number) => `${type === "boleta" ? "B" : "F"}${series}-${String(n).padStart(6, "0")}`;

/* ------------------------------ Cuentas ------------------------------ */

/** PIN repetido (1111) o seguido (1234, 4321): no se acepta en cuentas nuevas ni al cambiarlo. */
export const isWeakPin = (pin: string) => /^(\d)\1{3}$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin);

/** Errores de una cuenta. Al editar, el PIN vacío significa que no cambia. */
export function accountErrors(input: AccountInput, accounts: StaffAccount[], branches: Branch[], selfId: string | null): Errors<AccountInput> {
  const name = input.name.trim();
  return clean<AccountInput>({
    name: name.length < 3 ? "Escribe el nombre" : accounts.some((a) => a.id !== selfId && a.name.toLowerCase() === name.toLowerCase()) ? "Ya hay una cuenta con ese nombre" : undefined,
    branchId: input.role === "encargado" && !branches.some((b) => b.id === input.branchId) ? "Elige el local de la cuenta" : undefined,
    pin: (selfId === null || input.pin) && !/^\d{4}$/.test(input.pin) ? "4 dígitos" : input.pin && isWeakPin(input.pin) ? "Muy fácil de adivinar (repetido o seguido)" : undefined,
  });
}

/**
 * Por qué no se puede guardar el cambio de una cuenta, mirando a todas: siempre debe quedar un administrador activo
 * y nadie puede desactivarse o quitarse el rol de administrador a sí mismo (se quedaría fuera).
 */
export function accountGuard(accounts: StaffAccount[], selfId: string | null, next: AccountInput, currentUserId: string): string | null {
  if (selfId === currentUserId) {
    if (!next.active) return "No puedes desactivar tu propia cuenta.";
    const me = accounts.find((a) => a.id === selfId);
    if (me?.role === "admin" && next.role !== "admin") return "No puedes quitarte el rol de administrador.";
  }
  const others = accounts.filter((a) => a.id !== selfId);
  if (!others.some((a) => a.role === "admin" && a.active) && !(next.role === "admin" && next.active)) return "Debe quedar al menos un administrador activo.";
  return null;
}

/* ------------------------------ Reglas ------------------------------ */

export interface Rules {
  expiry: ExpiryThresholds;
  purchasing: PurchasingSettings;
  attendance: AttendanceSettings;
}

type RuleKey = `expiry.${keyof ExpiryThresholds}` | `purchasing.${keyof PurchasingSettings}` | `attendance.${keyof AttendanceSettings}`;

/** Rango permitido de cada regla. */
export const RULE_LIMITS: Record<RuleKey, [number, number]> = {
  "expiry.red": [7, 180],
  "expiry.yellow": [15, 365],
  "purchasing.coverDays": [3, 90],
  "purchasing.minShelfDays": [0, 730],
  "attendance.toleranceMinutes": [0, 30],
  "attendance.breakMinutes": [0, 120],
  "attendance.overtimeAfterMinutes": [0, 120],
};

export function rulesErrors(r: Rules): Partial<Record<RuleKey, string>> {
  const out: Partial<Record<RuleKey, string>> = {};
  const value = (k: RuleKey) => {
    const [group, field] = k.split(".") as [keyof Rules, string];
    return (r[group] as unknown as Record<string, number>)[field]!;
  };
  for (const k of Object.keys(RULE_LIMITS) as RuleKey[]) {
    const v = value(k);
    const [min, max] = RULE_LIMITS[k];
    if (!Number.isInteger(v) || v < min || v > max) out[k] = `Entre ${min} y ${max}`;
  }
  if (!out["expiry.red"] && !out["expiry.yellow"] && r.expiry.yellow <= r.expiry.red) out["expiry.yellow"] = "Debe ser mayor que el plazo crítico";
  return out;
}

/** Cuántos lotes cambiarían de color con los nuevos plazos (para avisar antes de guardar). */
export function toneShift(daysLeft: number[], from: ExpiryThresholds, to: ExpiryThresholds) {
  const tone = expiryTone;
  const count = (t: ExpiryThresholds) => {
    const c = { critico: 0, por_vencer: 0 };
    for (const d of daysLeft) {
      const x = tone(d, t);
      if (x === "critico" || x === "por_vencer") c[x]++;
    }
    return c;
  };
  return { before: count(from), after: count(to), changed: daysLeft.filter((d) => tone(d, from) !== tone(d, to)).length };
}
