# Digi!HME · sistema para boticas · front

Front de producción de **Digi!HME**, el sistema para boticas y farmacias, hecho con Next.js 15, React 19, TypeScript y Tailwind CSS 4. Botica Huánuco es el primer cliente y los datos de prueba son los suyos.

**Dos marcas:** Digi!HME es la plataforma (logo en `public/brand/`, ícono de la pestaña en `src/app/icon.png`, títulos "… · Digi!HME", sello "Desarrollado por" en el ingreso y la barra lateral). La botica pone su nombre y sus colores desde Ajustes; esos vienen de la API y pintan botones, barra lateral y Excel.

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

Marcación de asistencia (modo de prueba): Daniel 4101 · Milagros 4102 · José 4103 · Rocío 4104 · Lucía 4201 · Ana 4202 · Kevin 4203.

Para volver a los datos iniciales, borra `bh.mock.v1` en el almacenamiento local del navegador. Cuando cambia la forma de los datos de prueba, se regeneran solos y hay que volver a ingresar con el PIN.

Los PIN de prueba son sencillos a propósito. En Ajustes, las cuentas nuevas y los PIN que se cambien no aceptan números repetidos ni seguidos.

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
      panel/            Panel del día (inicio del administrador)
      pos/              Punto de venta
      vencimientos/     Vencimientos y prioridad de venta
      inventario/       Inventario y kardex
      compras/          Pedido sugerido, ingresos y proveedores
      traslados/        Traslados entre locales
      caja/             Turno de caja, movimientos, arqueo y cierres
      asistencia/       Asistencia del personal (administrador)
      clientes/         Clientes y recompras
      reportes/         Reportes de venta (administrador)
      ajustes/          Ajustes (administrador)
      [module]/         Aviso de módulo en construcción (hoy no queda ninguno)
  features/pos/         Pantalla de venta: catálogo, carrito, cobro, comprobante
  features/expiry/      Vencimientos: semáforo, prioridad de venta, baja/canje, Excel
  features/inventory/   Inventario valorizado, ficha del producto, kardex, alta y edición
  features/purchases/   Compras: pedido sugerido, ingreso de lotes, importación, proveedores
  features/transfers/   Traslados: en curso, sugeridos, historial, envío y pedido
  features/cash/        Caja: turno, movimientos, arqueo, historial de cierres
  features/attendance/  Asistencia: marcación, hoy, historial, resumen, personal
  features/dashboard/   Panel del día
  features/customers/   Clientes: cartera, ficha, tratamientos, recompras
  features/reports/     Reportes: periodo, cortes, márgenes, sin movimiento, recetas, Excel
  features/settings/    Ajustes: botica, locales y series, cuentas y PIN, reglas
  features/shared/      Alcance por local (solo un local o ambos) y lotes de varios locales
  components/ui/        Botones, campos, diálogos, insignias, avisos
  components/charts/    Gráfico de columnas (tooltip, leyenda y vista de tabla)
  components/layout/    Barra lateral, barra superior, navegación móvil
  lib/api/              Tipos, contrato, cliente HTTP y API simulada
  lib/domain/           Reglas de negocio puras: FEFO, presentaciones, IGV, comprobantes, riesgo de vencimiento, inventario, kardex, compras e importación, traslados, caja, asistencia, panel, clientes, reportes, ajustes
  lib/excel/            Generador y lector de .xlsx sin dependencias
  lib/auth/             Sesión y local donde se opera
docs/API.md             Contrato con el backend
public/brand/           Logo e isotipo de Digi!HME (PNG transparente)
```

## Avance

- [x] Base del proyecto, marca y diseño
- [x] Ingreso con PIN, roles (administrador y cuenta por local) y selector de local
- [x] Punto de venta: unidad, blíster y caja; FEFO; genéricos; receta; efectivo, Yape y tarjeta; boleta y factura
- [x] Panel del día: venta de hoy frente al mismo día de la semana pasada, venta por hora, últimos 14 días por local, efectivo en caja, personal en turno, pendientes (vencimientos, stock, traslados, caja, asistencia) y lo más vendido
- [x] Vencimientos: semáforo por lote, prioridad de venta con pérdida estimada, descuentos por lote, baja y devolución, sugerencia de traslado, Excel
- [x] Inventario y kardex: stock por local, mínimos por local, agrupado por laboratorio y tipo, ficha con precios y margen, lotes FEFO, kardex de 7/30/90 días, alta y edición de productos, Excel
- [x] Traslados entre locales: pedir, enviar con lote o FEFO, despachar, recibir y anular; sugerencias por stock bajo y por vencimiento; historial y Excel
- [x] Compras: pedido sugerido por local, registro de ingreso por lote con validaciones, historial de ingresos, proveedores, importación de productos y lotes desde Excel o CSV, Excel
- [x] Clientes y recompras: cartera con compras y puntos, ficha con tratamientos continuos y consentimiento, recordatorios de recompra con WhatsApp y llamada, historial, Excel
- [x] Caja: apertura, ventas del turno por método de pago, egresos, retiros e ingresos, arqueo por billetes y monedas, cierre con diferencia y motivo, historial y Excel
- [x] Asistencia del personal: marcación con PIN personal (también desde la pantalla de ingreso), estado de hoy con línea del día, historial, resumen por trabajador con tardanzas, faltas, horas y extra, marcas manuales, personal y horarios, Excel
- [x] Reportes: venta por periodo con comparación, por día u hora, por producto, laboratorio, tipo, local, quien atendió y método de pago; utilidad y margen; productos sin movimiento; libro de recetas; libro Excel completo
- [x] Ajustes: datos y colores de la botica con vista previa y control de contraste, locales según el plan contratado (crear con su cuenta, desactivar sin perder historial, reactivar), series de comprobantes con el siguiente correlativo, cuentas y PIN (siempre queda un administrador activo), plazos de vencimiento, reglas de compra y de asistencia
