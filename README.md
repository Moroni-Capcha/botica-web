# Botica Huánuco · front

Front de producción del sistema de Botica Huánuco, hecho por DigiHME con Next.js 15, React 19, TypeScript y Tailwind CSS 4.

## Arrancar

Necesitas Node.js 20.9 o superior.

```bash
npm install
npm run dev
```

Abre http://localhost:3000. Sin backend, el sistema funciona en **modo de prueba** con datos de ejemplo guardados en el navegador:

| Cuenta | PIN |
| --- | --- |
| Administrador general (Carmen Salazar) | 1234 |
| Cuenta Principal (Q.F. Daniel Rojas) | 1111 |
| Cuenta Sucursal (Q.F. Lucía Ramos) | 2222 |

Para volver a los datos iniciales, borra `bh.mock.v1` en el almacenamiento local del navegador. Cuando cambia la forma de los datos de prueba, se regeneran solos y hay que volver a ingresar con el PIN.

## Conectar con el backend

En `.env.local`:

```
NEXT_PUBLIC_API_MODE=http
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

El contrato está en [docs/API.md](docs/API.md).

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm run typecheck` | Revisión de tipos |
| `npm test` | Pruebas de las reglas de negocio (Vitest) |

## Estructura

```
src/
  app/                  Rutas (App Router)
    login/              Ingreso con usuario y PIN
    (app)/              Zona protegida: barra lateral, barra superior
      pos/              Punto de venta
      vencimientos/     Vencimientos y prioridad de venta
      inventario/       Inventario y kardex
      [module]/         Módulos que aún se están migrando del prototipo
  features/pos/         Pantalla de venta: catálogo, carrito, cobro, comprobante
  features/expiry/      Vencimientos: semáforo, prioridad de venta, baja/canje, Excel
  features/inventory/   Inventario valorizado, ficha del producto, kardex, alta y edición
  features/shared/      Alcance por local (solo un local o ambos) y lotes de varios locales
  components/ui/        Botones, campos, diálogos, insignias, avisos
  components/layout/    Barra lateral, barra superior, navegación móvil
  lib/api/              Tipos, contrato, cliente HTTP y API simulada
  lib/domain/           Reglas de negocio puras: FEFO, presentaciones, IGV, comprobantes, riesgo de vencimiento, inventario, kardex
  lib/excel/            Generador de .xlsx sin dependencias
  lib/auth/             Sesión y local donde se opera
docs/API.md             Contrato con el backend
```

## Avance

- [x] Base del proyecto, marca y diseño
- [x] Ingreso con PIN, roles (administrador y cuenta por local) y selector de local
- [x] Punto de venta: unidad, blíster y caja; FEFO; genéricos; receta; efectivo, Yape y tarjeta; boleta y factura
- [ ] Panel del día
- [x] Vencimientos: semáforo por lote, prioridad de venta con pérdida estimada, descuentos por lote, baja y devolución, sugerencia de traslado, Excel
- [x] Inventario y kardex: stock por local, mínimos por local, agrupado por laboratorio y tipo, ficha con precios y margen, lotes FEFO, kardex de 7/30/90 días, alta y edición de productos, Excel
- [ ] Traslados entre locales
- [ ] Compras
- [ ] Clientes y recompras
- [ ] Caja: egresos y cierre
- [ ] Asistencia del personal
- [ ] Reportes y Excel
- [ ] Ajustes
