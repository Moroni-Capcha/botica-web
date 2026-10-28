/**
 * Planes que se pueden contratar. Reglas puras: el backend debería ofrecer los mismos casos.
 * El precio de lista va sin IGV; al cliente se le muestra con IGV (18 %), con 2 decimales.
 */
import type { PlanOffer } from "@/lib/api/types";
import { ALL_MODULES } from "./account";
import { IGV, round2 } from "./pharmacy";

export const TRIAL_DAYS = 14;

interface PlanDef {
  id: string;
  name: string;
  /** Soles por mes, sin IGV. */
  basePrice: number;
  maxBranches: number;
  modules: readonly string[];
}

const INICIO = ["panel", "pos", "vencimientos", "inventario", "compras", "clientes", "caja", "ajustes"];

export const PLAN_CATALOG: readonly PlanDef[] = [
  { id: "inicio", name: "Plan Inicio", basePrice: 50, maxBranches: 1, modules: INICIO },
  { id: "crece", name: "Plan Crece", basePrice: 110, maxBranches: 3, modules: [...INICIO, "traslados", "reportes"] },
  { id: "cadena", name: "Plan Cadena", basePrice: 210, maxBranches: 10, modules: ALL_MODULES },
];

/** Precio mensual con IGV, redondeado a 2 decimales. */
export const priceWithIgv = (basePrice: number): number => round2(basePrice * (1 + IGV));

export const listPlanOffers = (): PlanOffer[] =>
  PLAN_CATALOG.map((p) => ({ id: p.id, name: p.name, priceMonthly: priceWithIgv(p.basePrice), maxBranches: p.maxBranches, modules: [...p.modules] }));

export const findPlan = (id: string): PlanDef | undefined => PLAN_CATALOG.find((p) => p.id === id);
