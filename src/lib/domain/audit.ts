/**
 * Auditoría: etiquetas en español de las acciones y resumen legible de un cambio (antes → después).
 * Reglas puras: el backend usa los mismos códigos y claves (ver "Auditoría" en docs/API.md).
 * Nunca se muestran ni se guardan DNI, nombres de clientes, PIN ni contraseñas.
 */
import type { AuditAction, AuditEntity, AuditEntry, AuditFields, AuditValue } from "@/lib/api/types";
import { soles } from "@/lib/format";

const DAY = 86_400_000;
export const AUDIT_MAX_DAYS = 370;

export const ACTION_GROUPS: { id: string; label: string; actions: { id: AuditAction; label: string }[] }[] = [
  {
    id: "acceso", label: "Acceso",
    actions: [{ id: "sesion_iniciada", label: "Ingresó al sistema" }, { id: "sesion_fallida", label: "Intento de ingreso fallido" }],
  },
  {
    id: "ventas", label: "Ventas y comprobantes",
    actions: [{ id: "venta_registrada", label: "Registró una venta" }, { id: "comprobante_anulado", label: "Anuló un comprobante" }, { id: "nota_credito_emitida", label: "Emitió una nota de crédito" }],
  },
  {
    id: "precios", label: "Productos y precios",
    actions: [
      { id: "producto_creado", label: "Creó un producto" }, { id: "producto_editado", label: "Editó un producto" },
      { id: "precio_cambiado", label: "Cambió un precio" }, { id: "costo_cambiado", label: "Cambió un costo" },
    ],
  },
  {
    id: "stock", label: "Stock",
    actions: [
      { id: "compra_registrada", label: "Registró una compra" }, { id: "baja_registrada", label: "Dio de baja unidades" }, { id: "descuento_lote", label: "Puso descuento a lotes" },
      { id: "traslado_enviado", label: "Envió un traslado" }, { id: "traslado_pedido", label: "Pidió un traslado" }, { id: "traslado_despachado", label: "Despachó un traslado" },
      { id: "traslado_recibido", label: "Recibió un traslado" }, { id: "traslado_anulado", label: "Anuló un traslado" },
    ],
  },
  {
    id: "caja", label: "Caja",
    actions: [{ id: "caja_abierta", label: "Abrió la caja" }, { id: "caja_cerrada", label: "Cerró la caja" }, { id: "movimiento_caja", label: "Registró un movimiento de caja" }],
  },
  {
    id: "cuentas", label: "Cuentas y usuarios",
    actions: [{ id: "cuenta_creada", label: "Creó una cuenta" }, { id: "cuenta_editada", label: "Cambió una cuenta" }],
  },
  {
    id: "ajustes", label: "Ajustes",
    actions: [
      { id: "botica_editada", label: "Cambió los datos de la botica" }, { id: "reglas_editadas", label: "Cambió las reglas" }, { id: "local_creado", label: "Creó un local" },
      { id: "local_editado", label: "Cambió un local" }, { id: "local_desactivado", label: "Desactivó un local" }, { id: "local_activado", label: "Reactivó un local" },
    ],
  },
  {
    id: "plataforma", label: "Digi!HME",
    actions: [
      { id: "plan_cambiado", label: "Cambió el plan" }, { id: "prueba_extendida", label: "Extendió la prueba" },
      { id: "cuenta_suspendida", label: "Suspendió la cuenta" }, { id: "cuenta_reactivada", label: "Reactivó la cuenta" },
    ],
  },
];

export const ACTION_LABEL = Object.fromEntries(ACTION_GROUPS.flatMap((g) => g.actions.map((a) => [a.id, a.label]))) as Record<AuditAction, string>;

export const ENTITY_LABEL: Record<AuditEntity, string> = {
  sesion: "Sesión", venta: "Venta", comprobante: "Comprobante", nota_credito: "Nota de crédito", producto: "Producto", lote: "Lote", compra: "Compra",
  traslado: "Traslado", caja: "Caja", cuenta: "Cuenta", local: "Local", botica: "Botica", reglas: "Reglas", plan: "Plan",
};

const has = (map: object, key: string): boolean => Object.prototype.hasOwnProperty.call(map, key);

/** Etiqueta de una acción. Un código que este front aún no conoce se muestra tal cual (el backend puede agregar acciones). */
export const actionLabel = (code: string): string => (has(ACTION_LABEL, code) ? ACTION_LABEL[code as AuditAction] : code);
export const entityLabelOf = (code: string): string => (has(ENTITY_LABEL, code) ? ENTITY_LABEL[code as AuditEntity] : code);

/** Quién lo hizo, en una palabra: el rol, o Digi!HME cuando no hay cuenta de la botica. */
export function actorRole(e: Pick<AuditEntry, "role" | "userId" | "action">): string {
  if (e.role === "admin") return "Administrador";
  if (e.role === "encargado") return "Encargado";
  return e.action === "sesion_fallida" ? "Sin identificar" : "Digi!HME";
}

type Kind = "money" | "bool" | "pct" | "enum" | "branch";
export const FIELD_LABELS: Record<string, { label: string; kind?: Kind }> = {
  total: { label: "Total", kind: "money" }, method: { label: "Pago", kind: "enum" }, document: { label: "Documento", kind: "enum" }, items: { label: "Productos" },
  offline: { label: "Hecha sin conexión", kind: "bool" }, status: { label: "Estado", kind: "enum" }, reason: { label: "Motivo" }, returnStock: { label: "Devolvió al stock", kind: "bool" },
  voucher: { label: "Comprobante" }, name: { label: "Nombre" }, priceUnit: { label: "Precio unidad", kind: "money" }, priceBlister: { label: "Precio blíster", kind: "money" },
  priceBox: { label: "Precio caja", kind: "money" }, cost: { label: "Costo", kind: "money" }, minStock: { label: "Stock mínimo" }, rx: { label: "Receta", kind: "enum" },
  barcode: { label: "Código de barras" }, category: { label: "Tipo" }, lab: { label: "Laboratorio" }, conc: { label: "Concentración" }, active: { label: "Activa", kind: "bool" },
  role: { label: "Rol", kind: "enum" }, branchId: { label: "Local", kind: "branch" }, pinChanged: { label: "PIN cambiado", kind: "bool" }, qty: { label: "Unidades en el lote" },
  type: { label: "Tipo", kind: "enum" }, units: { label: "Unidades" }, discount: { label: "Descuento", kind: "pct" }, lots: { label: "Lotes" }, supplier: { label: "Proveedor" },
  from: { label: "Origen", kind: "branch" }, to: { label: "Destino", kind: "branch" }, openingAmount: { label: "Fondo inicial", kind: "money" }, expected: { label: "Esperado", kind: "money" },
  counted: { label: "Contado", kind: "money" }, difference: { label: "Diferencia", kind: "money" }, tickets: { label: "Tickets" }, amount: { label: "Monto", kind: "money" },
  note: { label: "Detalle" }, tagline: { label: "Eslogan" }, ruc: { label: "RUC" }, phone: { label: "Teléfono" }, brand: { label: "Color principal" }, accent: { label: "Color de acento" },
  series: { label: "Serie" }, address: { label: "Dirección" }, via: { label: "Forma de ingreso", kind: "enum" }, email: { label: "Correo" }, plan: { label: "Plan" },
  maxBranches: { label: "Locales permitidos" }, trialEndsAt: { label: "Fin de la prueba" }, days: { label: "Días" },
  "expiry.red": { label: "Vencimiento crítico (días)" }, "expiry.yellow": { label: "Vencimiento por vencer (días)" }, "purchasing.coverDays": { label: "Días de cobertura de compra" },
  "purchasing.minShelfDays": { label: "Vida útil mínima al comprar (días)" }, "attendance.toleranceMinutes": { label: "Tolerancia de tardanza (min)" },
  "attendance.breakMinutes": { label: "Refrigerio (min)" }, "attendance.overtimeAfterMinutes": { label: "Horas extra desde (min)" },
};

const ENUM_LABEL: Record<string, string> = {
  admin: "Administrador", encargado: "Encargado", efectivo: "Efectivo", yape: "Yape", tarjeta: "Tarjeta", boleta: "Boleta", factura: "Factura",
  merma: "Merma", devolucion: "Devolución", ingreso: "Ingreso", egreso: "Egreso", retiro: "Retiro", libre: "Venta libre", receta: "Con receta", controlado: "Controlado",
  aceptado: "Aceptado", anulado: "Anulado", pendiente: "Pendiente", rechazado: "Rechazado", solicitado: "Solicitado", en_transito: "En camino", recibido: "Recibido",
  trial: "En prueba", active: "Activa", overdue: "Vencida", suspended: "Suspendida", pin: "PIN", correo: "Correo y contraseña",
};

export interface FormatContext {
  /** Nombre del local a partir de su id. Sin esto se muestra el id. */
  branchName?: (id: string) => string;
}

const kindOf = (key: string): Kind | undefined => (has(FIELD_LABELS, key) ? FIELD_LABELS[key]!.kind : undefined);

/** Un valor listo para leer: soles, porcentaje, Sí/No o el nombre de un local según la clave. */
export function formatValue(key: string, value: AuditValue | undefined, ctx: FormatContext = {}): string {
  if (value === null || value === undefined || value === "") return "—";
  const kind = kindOf(key);
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return kind === "money" ? soles(value) : kind === "pct" ? `${Math.round(value * 100)} %` : value.toLocaleString("es-PE");
  if (kind === "branch") return ctx.branchName ? ctx.branchName(value) : value;
  if (kind === "enum") return has(ENUM_LABEL, value) ? ENUM_LABEL[value]! : value;
  return value;
}

export const fieldLabel = (key: string): string => (has(FIELD_LABELS, key) ? FIELD_LABELS[key]!.label : key);

/** Solo las claves que cambiaron entre dos estados. `null` si no cambió nada. */
export function diffFields(before: AuditFields, after: AuditFields): { before: AuditFields; after: AuditFields } | null {
  const b: AuditFields = {};
  const a: AuditFields = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const x = before[key] ?? null;
    const y = after[key] ?? null;
    if (x === y) continue;
    b[key] = x;
    a[key] = y;
  }
  return Object.keys(a).length ? { before: b, after: a } : null;
}

/**
 * Resumen en una línea: "Precio unidad: S/ 0.50 → S/ 0.60 · Costo: S/ 0.20 → S/ 0.25".
 * Sin estado anterior solo muestra lo nuevo ("Total: S/ 12.50 · Pago: Efectivo").
 */
export function changeSummary(before: AuditFields | null, after: AuditFields | null, ctx: FormatContext = {}, maxItems = Infinity): string {
  const keys = [...new Set([...Object.keys(after ?? {}), ...Object.keys(before ?? {})])];
  const parts: string[] = [];
  for (const key of keys) {
    const hasBefore = !!before && key in before;
    const hasAfter = !!after && key in after;
    if (hasBefore && hasAfter) {
      if (before![key] === after![key]) continue;
      parts.push(`${fieldLabel(key)}: ${formatValue(key, before![key], ctx)} → ${formatValue(key, after![key], ctx)}`);
    } else if (hasBefore) parts.push(`${fieldLabel(key)}: ${formatValue(key, before![key], ctx)} → (quitado)`);
    else parts.push(`${fieldLabel(key)}: ${formatValue(key, after![key], ctx)}`);
  }
  if (parts.length <= maxItems) return parts.join(" · ");
  return `${parts.slice(0, maxItems).join(" · ")} · y ${parts.length - maxItems} más`;
}

/** "d***@botica.pe": para registrar un ingreso fallido sin guardar el correo completo. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1 || at === email.length - 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

/** Error del rango de fechas de la consulta, o null si sirve. */
export function auditRangeError(from: string, to: string): string | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "Elige las fechas del periodo.";
  if (a > b) return "La fecha «Desde» no puede ser posterior a «Hasta».";
  if ((b - a) / DAY + 1 > AUDIT_MAX_DAYS) return "El rango puede ser de hasta un año.";
  return null;
}
