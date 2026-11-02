import { describe, expect, it } from "vitest";
import { ACTION_GROUPS, ACTION_LABEL, actionLabel, actorRole, auditRangeError, changeSummary, diffFields, entityLabelOf, fieldLabel, formatValue, maskEmail } from "./audit";

describe("auditoría · etiquetas", () => {
  it("cada acción tiene su etiqueta y ninguna se repite", () => {
    const ids = ACTION_GROUPS.flatMap((g) => g.actions.map((a) => a.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(ACTION_LABEL).sort()).toEqual([...ids].sort());
    expect(actionLabel("precio_cambiado")).toBe("Cambió un precio");
  });

  it("un código desconocido se muestra tal cual, también si coincide con una propiedad de objeto", () => {
    expect(actionLabel("accion_nueva")).toBe("accion_nueva");
    expect(actionLabel("constructor")).toBe("constructor");
    expect(entityLabelOf("toString")).toBe("toString");
    expect(entityLabelOf("producto")).toBe("Producto");
    expect(fieldLabel("campoNuevo")).toBe("campoNuevo");
  });

  it("dice quién lo hizo según el rol", () => {
    expect(actorRole({ role: "admin", userId: "u1", action: "venta_registrada" })).toBe("Administrador");
    expect(actorRole({ role: "encargado", userId: "u2", action: "venta_registrada" })).toBe("Encargado");
    expect(actorRole({ role: null, userId: null, action: "cuenta_suspendida" })).toBe("Digi!HME");
    expect(actorRole({ role: null, userId: null, action: "sesion_fallida" })).toBe("Sin identificar");
  });
});

describe("auditoría · valores y resumen", () => {
  it("da formato según el tipo de campo", () => {
    expect(formatValue("priceUnit", 0.5)).toBe("S/ 0.50");
    expect(formatValue("discount", 0.25)).toBe("25 %");
    expect(formatValue("active", false)).toBe("No");
    expect(formatValue("role", "encargado")).toBe("Encargado");
    expect(formatValue("method", "yape")).toBe("Yape");
    expect(formatValue("note", null)).toBe("—");
    expect(formatValue("branchId", "sucursal")).toBe("sucursal");
    expect(formatValue("branchId", "sucursal", { branchName: () => "Sucursal Norte" })).toBe("Sucursal Norte");
    expect(formatValue("units", 1500)).toBe((1500).toLocaleString("es-PE"));
  });

  it("resume un cambio de antes a después y omite lo que no cambió", () => {
    const s = changeSummary({ priceUnit: 0.5, priceBox: 12, name: "Losartán" }, { priceUnit: 0.6, priceBox: 12, name: "Losartán" });
    expect(s).toBe("Precio unidad: S/ 0.50 → S/ 0.60");
  });

  it("sin estado anterior muestra solo lo nuevo", () => {
    expect(changeSummary(null, { total: 12.5, method: "efectivo" })).toBe("Total: S/ 12.50 · Pago: Efectivo");
    expect(changeSummary(null, null)).toBe("");
  });

  it("marca lo que se quitó y recorta cuando son muchos cambios", () => {
    expect(changeSummary({ note: "a" }, {})).toBe("Detalle: a → (quitado)");
    const many = changeSummary(null, { total: 1, items: 2, units: 3, lots: 4 }, {}, 2);
    expect(many).toBe("Total: S/ 1.00 · Productos: 2 · y 2 más");
  });

  it("encuentra solo las claves que cambiaron", () => {
    expect(diffFields({ a: 1, b: "x" }, { a: 1, b: "y" })).toEqual({ before: { b: "x" }, after: { b: "y" } });
    expect(diffFields({ a: 1 }, { a: 1 })).toBeNull();
    expect(diffFields({}, { c: true })).toEqual({ before: { c: null }, after: { c: true } });
  });
});

describe("auditoría · privacidad y rango", () => {
  it("oculta el correo de un ingreso fallido", () => {
    expect(maskEmail("dueno@botica.pe")).toBe("d***@botica.pe");
    expect(maskEmail("sinarroba")).toBe("***");
    expect(maskEmail("@x.pe")).toBe("***");
  });

  it("valida el rango de fechas", () => {
    expect(auditRangeError("2026-10-01", "2026-10-27")).toBeNull();
    expect(auditRangeError("2026-10-28", "2026-10-27")).toMatch(/posterior/);
    expect(auditRangeError("2025-01-01", "2026-10-27")).toMatch(/un año/);
    expect(auditRangeError("2025-10-23", "2026-10-27")).toBeNull();
    expect(auditRangeError("", "2026-10-27")).toMatch(/fechas/);
  });
});
