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

**Consola interna de Digi!HME** (para el equipo de la plataforma, no para las boticas): http://localhost:3000/consola. Ingreso de prueba: `soporte@digi-hme.pe` · `Consola2026!` (solo existe en el modo de prueba). Es otra sesión: una cuenta de botica no entra ahí y el operador no entra a ninguna botica. Desde ahí se ven todas las boticas (plan, estado, creada, última actividad, locales y usuarios) y se cambia de plan, se extiende la prueba, se suspende o se reactiva, siempre con un motivo que queda en la auditoría de la botica.

Marcación de asistencia (modo de prueba): Daniel 4101 · Milagros 4102 · José 4103 · Rocío 4104 · Lucía 4201 · Ana 4202 · Kevin 4203.

Para volver a los datos iniciales, borra `bh.mock.v1` en el almacenamiento local del navegador. Cuando cambia la forma de los datos de prueba, se regeneran solos y hay que volver a ingresar con el PIN.

Los PIN de prueba son sencillos a propósito. En Ajustes, las cuentas nuevas y los PIN que se cambien no aceptan números repetidos ni seguidos.

## Conectar con el backend

En `.env.local`:

```
NEXT_PUBLIC_API_MODE=http
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

El contrato está en [docs/API.md](docs/API.md). Si vas a construir el backend, empieza por la [guía para el backend](docs/BACKEND.md).

## Monitoreo de errores (Sentry)

El front trae el enlace listo, **sin el SDK de Sentry** (no se agregó ninguna dependencia). Mientras no haya `NEXT_PUBLIC_SENTRY_DSN` y un SDK conectado, `src/lib/monitoring.ts` no hace nada.

Qué ya está conectado:

- `captureException`, `captureMessage`, `setMonitoringUser` y `setMonitoringReporter` en `src/lib/monitoring.ts`.
- Pantallas de error: `src/app/error.tsx` (cualquier ruta) y `src/app/global-error.tsx` (si se rompe el diseño raíz) avisan al monitoreo y muestran un mensaje claro en español.
- El manejador global de TanStack Query (consultas y escrituras en `src/app/providers.tsx`) y los errores sin atrapar de la ventana (`error` y `unhandledrejection`). Solo se reportan los 5xx y los errores de código: las reglas del negocio (4xx: stock insuficiente, PIN incorrecto…) y "sin conexión" no.
- Cada reporte lleva las etiquetas `tenant` (código de la botica), `role` y `branch`, y como usuario solo el id interno de la cuenta.
- **Nunca** sale un DNI, RUC, celular, correo, nombre de cliente, PIN ni token: todo texto y contexto pasa antes por `src/lib/domain/privacy.ts` (con pruebas).

Cómo conecta el SDK real el equipo de backend / DevOps (unos 10 minutos):

1. `npm i @sentry/browser` (o `@sentry/nextjs` si también quieren el servidor).
2. En el entorno de despliegue: `NEXT_PUBLIC_SENTRY_DSN=https://…@….ingest.sentry.io/…`.
3. Crear un módulo cliente de arranque y montarlo una vez en `src/app/providers.tsx`:

```tsx
"use client";
import * as Sentry from "@sentry/browser";
import { setMonitoringReporter } from "@/lib/monitoring";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV, // "produccion" | "pruebas"
  sendDefaultPii: false, // no enviar IP ni datos del usuario
  tracesSampleRate: 0.1,
});
setMonitoringReporter(Sentry); // el SDK ya cumple la interfaz MonitoringReporter
```

   Alternativa sin código: cargar el script "loader" de Sentry, que deja `window.Sentry`; el front lo toma solo.
4. Opcional: subir los mapas de código fuente en el despliegue (`sentry-cli`) para ver las trazas legibles.

Para probarlo, definir el DSN y provocar un error en una pantalla (por ejemplo lanzar una excepción desde un componente en desarrollo): debe aparecer en Sentry con las etiquetas `tenant` y `role`, sin datos personales.

## Movimiento

El movimiento se siente, no se mira: rápido, con un propósito y sin estorbar a quien atiende con apuro. Las acciones que se repiten todo el día (agregar al carrito, atajos) no llevan animación extra. Todo vive en `src/app/globals.css` (tokens y animaciones), `src/lib/motion.ts` (para JavaScript) y `src/components/ui/presence.ts` (salidas).

| Token | Valor | Dónde se usa |
| --- | --- | --- |
| `--dur-fast` | 140 ms | Salidas (diálogo, aviso, hoja), cambios de color, cambio de contenido (`animate-swap-in`) |
| `--dur-base` | 200 ms | Entradas (`animate-pop`, `animate-fade`, `animate-line-in`, `animate-stagger-in`) |
| `--dur-slow` | 320 ms | Solo el temblor de error (`animate-shake`). Nunca en la interfaz normal |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Todo. En JavaScript, `EASE_OUT` |

Reglas:

- Menos de 300 ms. Las salidas son más rápidas y suaves que las entradas.
- Solo `transform` y `opacity`; nunca `transition: all`. Nada nace de `scale(0)`: se parte de 0,95 o más y con opacidad 0.
- "Reducir movimiento" se respeta en CSS (queda solo el cambio de opacidad) y en JavaScript: usa `animateIn`, `stagger` y `usePresence` de `src/lib/motion.ts` y `ui/presence.ts`, nunca `.animate()` directo.
- El `Dialog` hace su salida solo, aunque quien lo usa lo desmonte. Un aviso o una hoja propios usan `usePresence(open, ms)`.
- El escalonado (`stagger`) es solo para listas cortas que aparecen tras cargar datos, una vez; nunca en lo que cambia seguido.
- Los montos que cambian usan `Pulse` / `useValuePulse` (120 ms, sin contar números).

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
    registro/           Registro público de una botica nueva (3 pasos)
    (platform)/consola/ Consola interna de Digi!HME (otra sesión, aparte de las boticas)
    (app)/              Zona protegida: barra lateral, barra superior
      panel/            Panel del día (inicio del administrador)
      pos/              Punto de venta
      vencimientos/     Vencimientos y prioridad de venta
      inventario/       Inventario y kardex
      compras/          Pedido sugerido, ingresos y proveedores
      traslados/        Traslados entre locales
      caja/             Turno de caja, movimientos, arqueo y cierres
      comprobantes/     Comprobantes SUNAT: estado, reenvío, anulación y notas de crédito
      asistencia/       Asistencia del personal (administrador)
      auditoria/        Auditoría: quién hizo qué y cuándo (administrador)
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
  features/vouchers/    Comprobantes: lista y filtros, detalle, anular, nota de crédito, ticket de 80 mm, Excel
  features/platform/    Consola interna de Digi!HME: ingreso del operador, boticas, plan y estado
  features/audit/       Auditoría: filtros, páginas en el servidor y Excel
  features/attendance/  Asistencia: marcación, hoy, historial, resumen, personal
  features/dashboard/   Panel del día
  features/customers/   Clientes: cartera, ficha, tratamientos, recompras
  features/reports/     Reportes: periodo, cortes, márgenes, sin movimiento, recetas, Excel
  features/settings/    Ajustes: botica, locales y series, cuentas y PIN, reglas
  features/shared/      Alcance por local (solo un local o ambos) y lotes de varios locales
  components/ui/        Botones, campos, diálogos, insignias, avisos, paginación
  components/charts/    Gráfico de columnas (tooltip, leyenda y vista de tabla)
  components/layout/    Barra lateral, barra superior, navegación móvil
  lib/api/              Tipos, contrato, cliente HTTP y API simulada
  lib/monitoring.ts     Enlace con Sentry (apagado hasta conectar el SDK; ver "Monitoreo de errores")
  lib/domain/           Reglas de negocio puras (incluye auditoría, paginación y privacidad de los reportes de error): FEFO, presentaciones, IGV, comprobantes, riesgo de vencimiento, inventario, kardex, compras e importación, traslados, caja, asistencia, panel, clientes, reportes, ajustes, comprobantes electrónicos (plazo de baja, notas de crédito), devoluciones en la venta neta
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
- [x] Comprobantes SUNAT: pantalla `/comprobantes` con filtros por fecha, tipo y estado (pendiente, aceptado, rechazado, anulado) y la respuesta de SUNAT; reenvío de pendientes y rechazados; anulación (comunicación de baja) dentro de 7 días con motivo y devolución opcional al stock; notas de crédito (catálogo 09: anulación, devolución total o por ítem, descuento, disminución) que devuelven la mercadería al kardex; ticket de 80 mm para imprimir (también desde la venta en el punto de venta); Excel. Pendiente del lado del backend: envío real a SUNAT, QR y hash del ticket; las notas de crédito restan en la caja, el panel, los reportes, las compras del cliente y sus Excel (venta bruta − devoluciones = venta neta)
- [x] Punto de venta sin internet (T6): app instalable (manifiesto + service worker propio, solo en producción) que abre sin conexión; cola persistente de ventas con clave de idempotencia (`clientSaleId`) y ticket provisional `OFF-0001`; envío FIFO automático al volver la conexión y con "Sincronizar ahora"; indicador de conexión en la barra superior y lista "Ventas por enviar" (reintentar y, solo el administrador, descartar las que fallaron); stock reservado localmente para no vender dos veces el mismo lote. Contrato: `clientSaleId`, `soldAt`, `offlineTicket` en `POST /sales` y `POST /sales/sync` (`docs/API.md`)
- [x] SaaS: contrato y mock de botica por código (`X-Botica`), ingreso del dueño con correo y contraseña, estado de la cuenta (prueba, activa, vencida, suspendida) con módulos del plan y modo solo lectura
- [x] Registro y primera configuración: `/registro` en 3 pasos (plan, datos, listo) crea la botica en prueba de 14 días; tarjeta de pasos pendientes en el panel (datos, local, series, usuario de mostrador, productos). El mock guarda cada botica nueva en `bh.mock.v1.<código>`
- [x] Auditoría (T7): pantalla `/auditoria` (solo administrador, desde el Plan Crece) con filtros por fecha, persona, acción y tipo, paginación en el servidor (`GET /audit`) y Excel. El mock registra en un solo lugar (`src/lib/api/mock/audit.ts`) los ingresos (también los fallidos), ventas, anulaciones y notas de crédito, cambios de precio y costo, bajas de stock, compras, traslados, caja, cuentas y roles, ajustes y locales; nunca guarda DNI, nombres de clientes ni PIN. Contrato y códigos de acción en `docs/API.md`
- [x] Consola interna de Digi!HME (T7): `/consola` con ingreso propio del operador (`POST /platform/login`), lista de boticas por páginas con plan, estado de cuenta (prueba, activa, vencida, suspendida), fecha de creación, última actividad y conteo de locales y usuarios (`GET /platform/tenants`), y acciones con motivo: cambiar de plan (respeta el límite de locales), extender la prueba, suspender y reactivar (`PATCH /platform/tenants/:code`). Reutiliza las reglas de cuenta de `src/lib/domain/account.ts`; nueva lógica en `src/lib/domain/platform.ts` con pruebas
- [x] Monitoreo y paginación (T7): enlace con Sentry sin agregar el SDK (`src/lib/monitoring.ts`, `app/error.tsx`, `app/global-error.tsx`, manejador global de TanStack Query; sin datos personales), con la guía para que DevOps conecte el SDK real. Paginación en el servidor con la convención `Page<T>` (`page`, `pageSize`) en `docs/API.md`: obligatoria en `GET /audit` y `GET /platform/tenants`, opcional y compatible hacia atrás en `GET /kardex` (ficha del producto) y `GET /customers/all` (lista de clientes); componente `Pagination` en `src/components/ui/`. Comprobantes y reportes siguen sin paginar a propósito (ver `docs/API.md`)

## Hoja de ruta SaaS · estado

El front de los seis puntos está terminado contra el contrato (`docs/API.md`) y el modo de prueba. Lo que falta es del backend y de la puesta en producción:

| # | Punto | Front | Falta del lado del backend / DevOps |
| --- | --- | --- | --- |
| 1 | Varias boticas, ingreso del dueño con correo y contraseña | Hecho (`X-Botica`, `/login`) | Resolver la botica por `X-Botica` o subdominio; cuentas del dueño con hash de contraseña |
| 2 | Plan, facturación y estado de la cuenta | Hecho (Ajustes, aviso, solo lectura, módulos) y consola de Digi!HME | Cobro real y renovación; rechazar endpoints de módulos fuera del plan |
| 3 | Registro y configuración inicial | Hecho (`/registro`, pasos en el panel) | `POST /public/signup` y envío de correos |
| 4 | Comprobantes con SUNAT | Hecho (estado, reenvío, baja, nota de crédito, ticket de 80 mm) | Envío real a SUNAT con el proveedor de facturación, QR y hash del ticket |
| 5 | Punto de venta sin internet | Hecho (PWA, cola, `clientSaleId`) | `POST /sales/sync` idempotente |
| 6 | Auditoría, consola interna, monitoreo, paginación | Hecho (`/auditoria`, `/consola`, `monitoring.ts`, `Page<T>`) | Registrar la auditoría en un solo punto del servidor, cuentas de operador y `/platform/*`, conectar el SDK de Sentry (ver arriba) |

Sin probar en navegador real: instalación de la PWA y cola sin conexión, impresión en ticketera de 80 mm y el envío real a Sentry.

