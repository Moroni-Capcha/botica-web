import { describe, expect, it } from "vitest";
import { REDACTED, isSensitiveKey, redactContext, redactText, redactValue } from "./privacy";

describe("privacidad · textos", () => {
  it("oculta DNI, RUC, celular, correo y tokens dentro de un mensaje", () => {
    expect(redactText("Cliente 40125588 no encontrado")).toBe("Cliente [dni] no encontrado");
    expect(redactText("Factura al RUC 20601122334 rechazada")).toBe("Factura al RUC [ruc] rechazada");
    expect(redactText("RUC 10401255889")).toBe("RUC [ruc]");
    expect(redactText("Llamar al 987 654 321 o al 987654321")).toBe("Llamar al [celular] o al [celular]");
    expect(redactText("falló para dueno@botica-huanuco.pe")).toBe("falló para [correo]");
    expect(redactText("Authorization: Bearer abc.DEF-123_x")).toBe(`Authorization: Bearer ${REDACTED}`);
  });

  it("oculta datos personales de las direcciones con parámetros", () => {
    expect(redactText("GET /customers?q=Rosa%20Huam%C3%A1n&page=2")).toBe(`GET /customers?q=${REDACTED}&page=2`);
    expect(redactText("/x?dni=40125588&days=30")).toBe(`/x?dni=${REDACTED}&days=30`);
  });

  it("deja intacto lo que no es un dato personal", () => {
    expect(redactText("Venta B001-000123 por S/ 12.50 en 3 ítems")).toBe("Venta B001-000123 por S/ 12.50 en 3 ítems");
    expect(redactText("lote KD40921 vence 2026-11-30")).toBe("lote KD40921 vence 2026-11-30");
    expect(redactText("123456789012")).toBe("123456789012");
  });
});

describe("privacidad · campos", () => {
  it("reconoce los nombres de campo sensibles", () => {
    for (const k of ["dni", "customerName", "customer_doc_id", "ruc", "phone", "email", "password", "pin", "newPin", "token", "Authorization", "razón", "nombre", "notes", "prescription"]) {
      expect(isSensitiveKey(k), k).toBe(true);
    }
    for (const k of ["tenant", "role", "branchId", "boundary", "digest", "status", "code", "mapping", "spinner"]) expect(isSensitiveKey(k), k).toBe(false);
  });

  it("copia un objeto ocultando los campos sensibles, también dentro de listas y objetos anidados", () => {
    const out = redactValue({
      status: 409,
      customerName: "Rosa Huamán",
      document: { dni: "40125588", type: "boleta" },
      items: [{ productId: 7, note: "para su mamá" }],
      message: "Error con 40125588",
    }) as Record<string, unknown>;
    expect(out).toEqual({
      status: 409,
      customerName: REDACTED,
      document: REDACTED,
      items: [{ productId: 7, note: REDACTED }],
      message: "Error con [dni]",
    });
  });

  it("limita la profundidad y el tamaño de las listas, y descarta funciones", () => {
    const deep = redactValue({ a: { b: { c: { d: { e: 1 } } } } }) as { a: { b: { c: { d: unknown } } } };
    expect(deep.a.b.c.d).toBe("[…]");
    expect((redactValue(Array.from({ length: 100 }, (_, i) => i)) as number[]).length).toBe(20);
    expect(redactValue(() => 1)).toBeUndefined();
    expect(redactValue(10n)).toBe("10");
  });

  it("redactContext acepta un contexto vacío", () => {
    expect(redactContext(undefined)).toEqual({});
    expect(redactContext({ scope: "query", key: "customers", dni: "1" })).toEqual({ scope: "query", key: "customers", dni: REDACTED });
  });
});
