# Guía para el backend · Digi!HME

Para quien construye el backend (Node, Nest o Express). No necesitas haber visto este repositorio. Esta guía **no repite** [`API.md`](API.md): te dice por dónde empezar, en qué orden, qué reglas copiar y dónde están las trampas.

> **El contrato manda.** [`docs/API.md`](API.md) es la fuente de verdad. Si el front y el documento no coinciden, vale el documento y se corrige el front. Si falta algo, no lo inventes: anótalo en la sección 10 y coordina con el front.

## Índice

1. [Qué es esto](#1-qué-es-esto)
2. [Arranque rápido (15 minutos)](#2-arranque-rápido-15-minutos)
3. [Reglas transversales](#3-reglas-transversales)
4. [Reglas de negocio que el backend debe repetir](#4-reglas-de-negocio-que-el-backend-debe-repetir)
5. [Mapa de endpoints por módulo](#5-mapa-de-endpoints-por-módulo)
6. [Orden sugerido de implementación](#6-orden-sugerido-de-implementación)
7. [Lo que el mock simula y el backend debe hacer de verdad](#7-lo-que-el-mock-simula-y-el-backend-debe-hacer-de-verdad)
8. [Riesgos y trampas conocidas](#8-riesgos-y-trampas-conocidas)
9. [Cómo probar que cumples el contrato](#9-cómo-probar-que-cumples-el-contrato)
10. [Dudas para resolver con el front](#10-dudas-para-resolver-con-el-front)

---

## 1. Qué es esto

- **Digi!HME** es un SaaS para boticas y farmacias del Perú. Varias boticas (clientes) comparten una instalación: **multi-tenant**.
- Cada botica tiene uno o más **locales** (según su plan), un dueño (`admin`) y cuentas de mostrador (`encargado`, un local cada una).
- El primer cliente es Botica Huánuco; sus datos son los de prueba.
- El **front ya está terminado** (Next.js 15 + React 19). Hoy corre contra una API simulada en el navegador (el *mock*) que cumple el mismo contrato.
- Tu trabajo: implementar el contrato de [`API.md`](API.md). Cuando un endpoint real esté listo, el front lo usa **sin cambios**.
- Son **77 endpoints** (sección 5), agrupados en 14 bloques. No hay que hacerlos todos a la vez: la sección 6 dice el orden.
- Stack del front, por si lo necesitas: TanStack Query, Zustand, Tailwind. Todo el texto de la interfaz va en español del Perú.
- Reglas de negocio puras (FEFO, IGV, notas de crédito, caja…) están escritas **y probadas** en `src/lib/domain/`. Tradúcelas tal cual.

## 2. Arranque rápido (15 minutos)

Necesitas Node.js 20.9 o superior.

```bash
git clone <repo> && cd botica-huanuco-web
npm install
npm run dev          # http://localhost:3000 con el mock (sin backend)
npm test             # reglas de negocio (Vitest)
npm run typecheck    # tsc --noEmit
npm run build
```

**Cuentas de prueba del mock:**

| Qué | Dato |
| --- | --- |
| Código de botica | `botica-huanuco` |
| Dueño (correo y contraseña) | `dueno@botica-huanuco.pe` · `Clave2026!` |
| PIN administrador (Carmen Salazar) | `1234` |
| PIN cuenta Principal (Q.F. Daniel Rojas) | `1111` |
| PIN cuenta Sucursal (Q.F. Lucía Ramos) | `2222` |
| Marcación de asistencia | `4101`–`4104` (Principal) · `4201`–`4203` (Sucursal) |
| Consola de la plataforma (`/consola`) | `soporte@digi-hme.pe` · `Consola2026!` |

**Conectar el front a tu backend** (archivo `.env.local` en la raíz del front):

```
NEXT_PUBLIC_API_MODE=http
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

- Sin `NEXT_PUBLIC_API_MODE=http` el front usa el mock (`mock` es el valor por defecto).
- `NEXT_PUBLIC_API_URL` es la base: el front le suma rutas como `/auth/login`. Con la de ejemplo, `POST http://localhost:4000/api/auth/login`.
- Permite CORS para `http://localhost:3000` y los headers `Authorization`, `Content-Type` y `X-Botica`.
- Reinicia `npm run dev` al cambiar `.env.local`.

**Usar el mock como referencia ejecutable:**

- Los datos del mock viven en `localStorage` bajo `bh.mock.v1` (la botica de ejemplo) y `bh.mock.v1.<código>` (las registradas en `/registro`). Para volver a empezar, bórralos desde las herramientas del navegador.
- El código del mock está en `src/lib/api/mock/client.ts`. Busca el método por su nombre del contrato, por ejemplo `async createSale(` o `async closeCash(`. Ahí ves el orden exacto de validaciones y los mensajes de error.
- El mapa método del contrato → ruta HTTP está en `src/lib/api/http.ts` (164 líneas, se lee en 5 minutos). Es la lista real de lo que el front llama.
- Los tipos de cada cuerpo y respuesta están en `src/lib/api/types.ts`.
- Para ver la cuenta en solo lectura: edita `account.status` dentro de `bh.mock.v1` a `"suspended"`.

**Archivos que debes conocer:**

| Archivo | Para qué |
| --- | --- |
| `docs/API.md` | Contrato (fuente de verdad) |
| `src/lib/api/types.ts` | Tipos exactos de cada cuerpo y respuesta |
| `src/lib/api/contract.ts` | Interfaz `ApiClient` y `PlatformClient` |
| `src/lib/api/http.ts` | Cliente real: método, ruta, headers, qué hace con 401 |
| `src/lib/api/mock/client.ts` | Backend simulado: orden de validaciones y mensajes |
| `src/lib/domain/*.ts` + `*.test.ts` | Reglas de negocio puras y sus pruebas |
| `src/lib/nav.ts` | Ids de módulo (`panel`, `pos`, `caja`…) |
| `src/lib/domain/plans.ts` | Catálogo de planes y módulos de cada uno |

## 3. Reglas transversales

### 3.1 Formato

- JSON en todo, `camelCase`. Base: `NEXT_PUBLIC_API_URL`.
- Un `204` no lleva cuerpo (`/auth/logout`, `POST /customers/:id/contacts`, `/platform/logout`).
- Los `POST` de creación responden `201`, salvo donde `API.md` dice otra cosa (`POST /sales` repetido con la misma clave responde `200`).

### 3.2 Errores

Todo 4xx/5xx responde `{ "code", "message", "details"? }`. El front muestra `message` **tal cual**: en español, claro, para el personal de la botica. Si falta el cuerpo, el front usa `HTTP_<status>` y un mensaje genérico.

Códigos de la tabla de `API.md` (el HTTP status importa):

| HTTP | Códigos |
| --- | --- |
| 400 | `DATOS_INVALIDOS`, `CAJA_CERRADA`, `RECETA_REQUERIDA`, `DOCUMENTO_INVALIDO`, `PAGO_INSUFICIENTE`, `FECHA_VENCIDA`, `CAJA_SIN_EFECTIVO`, `DIFERENCIA_SIN_MOTIVO` |
| 401 | `PIN_INVALIDO`, `CREDENCIALES_INVALIDAS`, `NO_AUTORIZADO` |
| 403 | `SIN_PERMISO`, `CUENTA_SUSPENDIDA`, `SIN_CONSENTIMIENTO` |
| 404 | `BOTICA_NO_ENCONTRADA`, `PRODUCTO_NO_EXISTE`, `LOTE_NO_EXISTE`, `PROVEEDOR_NO_EXISTE`, `TRASLADO_NO_EXISTE`, `TRABAJADOR_NO_EXISTE`, `CLIENTE_NO_EXISTE`, `COMPROBANTE_NO_EXISTE` |
| 409 | `STOCK_INSUFICIENTE`, `CLAVE_REPETIDA`, `CODIGO_DUPLICADO`, `DOCUMENTO_DUPLICADO`, `LOTE_CONFLICTO`, `RUC_DUPLICADO`, `MARCA_FUERA_DE_ORDEN`, `CAJA_ABIERTA`, `ESTADO_INVALIDO`, `PLAZO_VENCIDO` |
| 5xx | `ERROR_INTERNO` |

Códigos que **aparecen en el texto de `API.md` o en el mock pero no en la tabla** (HTTP status tomado del texto o del mock; confírmalos, sección 10):

| HTTP | Código | Dónde |
| --- | --- | --- |
| 409 | `CODIGO_EN_USO` | `POST /public/signup`, código de botica repetido |
| 409 | `CORREO_EN_USO` | `POST /public/signup`, correo ya usado por otra botica (el front lo maneja) |
| 409 | `LIMITE_DEL_PLAN` | crear o reactivar local sin cupo; cambio de plan con más locales de los permitidos |
| 409 | `LOCAL_NO_SE_PUEDE_CERRAR` | desactivar local con stock, caja abierta, traslados pendientes o siendo el único |
| 409 | `LOCAL_INACTIVO` | cualquier operación sobre un local desactivado |
| 409 | `SERIE_NO_AUTORIZADA` | `PUT /settings/branches/:id`, serie no autorizada en SUNAT |
| 409 | `CUENTA_PROTEGIDA` | cambio que dejaría sin administrador activo |
| 404 | `LOCAL_NO_EXISTE`, `CUENTA_NO_EXISTE` | local o cuenta inexistente |
| 400 | `VENTA_VACIA` | `POST /sales` sin ítems (solo en el mock) |

Cuando una regla falla, devuelve **el primer problema** en `message` (así lo hace el mock).

### 3.3 Autenticación y botica

- `Authorization: Bearer <token>` en cada petición con sesión. **Un 401 hace que el front cierre la sesión** (borra el token y manda al ingreso). Usa 401 solo para token vencido o inválido, o para fallos de ingreso. Ver trampa 8.1.
- `X-Botica: <código>` en **cada** petición de botica (también las públicas, `/public/*` y `/auth/staff`). Con eso resuelves de qué cliente son los datos. `API.md` dice "o por subdominio": hoy el front siempre manda el header.
- El código de botica: minúsculas, números y guiones, de 3 a 40, sin guion al inicio ni al final (`isValidBoticaCode`, `src/lib/domain/auth.ts`).
- Dos formas de ingresar a una botica: **PIN de mostrador** (`POST /auth/login`) y **correo + contraseña del dueño** (`POST /auth/owner-login`, solo `admin`). Ambas devuelven `Session { token, user, expiresAt }`.
- **Sesión de plataforma aparte** (`/platform/*`): otro login, otra tabla de operadores, otro token, **sin** `X-Botica`. Una sesión de botica no sirve en `/platform/*` ni al revés: responde `401 NO_AUTORIZADO`. El front guarda los tokens en claves distintas de `sessionStorage` (`bh.session` y `bh.platform.session`).
- El token vive en `sessionStorage` (se borra al cerrar la pestaña). Si prefieren cookie httpOnly hay que cambiar un archivo del front (`src/lib/api/token.ts`, ver sección 10).

### 3.4 Roles y permisos

| Rol | `branchId` | Regla |
| --- | --- | --- |
| `admin` | `null` | Ve y opera en todos los locales. Único que accede a Ajustes, Auditoría, Asistencia (administración), catálogo y proveedores |
| `encargado` | su local | Solo lee y escribe datos de su local; otro local → `403 SIN_PERMISO` |

- El backend valida el local en **cada** endpoint que recibe `branchId`. El front oculta cosas, pero la regla real es la tuya.
- `user.permissions` lista los ids de módulo que la cuenta ve. Lo defines tú. El mock da: `admin` todos; `encargado` todos menos `asistencia`, `reportes`, `auditoria` y `ajustes` (`PERMISSIONS` en `mock/client.ts`).
- Si en un endpoint `branchId` es opcional: `admin` sin `branchId` = todos los locales; `encargado` sin `branchId` = su local (o `403` si el endpoint lo exige; la sección 5 lo marca por endpoint cuando `API.md` lo dice).

### 3.5 Cuenta, plan y solo lectura

- Estados de cuenta: `trial`, `active`, `overdue` (avisa, pero se puede operar), `suspended` (solo lectura).
- **Calcula el estado en el servidor** (`effectiveStatus`, `src/lib/domain/account.ts`): una prueba cuyo `trialEndsAt` ya pasó se devuelve como `overdue`.
- **Solo lectura:** con `suspended`, todo `POST`, `PUT`, `PATCH` y `DELETE` responde `403 CUENTA_SUSPENDIDA`, excepto `/auth/login`, `/auth/owner-login` y `/auth/logout` (y `/platform/*`, que no es de la botica). Los `GET` siguen.
- **Módulos por plan:** `GET /account` devuelve `modules`. El backend debe rechazar también los endpoints de un módulo que el plan no incluye. `API.md` no dice qué código devolver; propuesta: `403 SIN_PERMISO` (sección 10). Propuesta de qué endpoints cuelgan de cada módulo:

| Módulo (`nav.ts`) | Endpoints que pertenecen sólo a él |
| --- | --- |
| `panel` | `GET /dashboard`, `/setup*` |
| `pos` | `POST /sales`, `POST /sales/sync`, `GET/POST /customers` (búsqueda y alta rápida) |
| `vencimientos` | `GET /sales/velocity`, `PATCH /lots/discount`, `POST /lots/:id/write-off` |
| `inventario` | `GET /kardex`, `POST/PUT /products` |
| `traslados` | `/transfers*` |
| `compras` | `/suppliers*`, `/purchases*` |
| `clientes` | `GET /customers/all`, `/customers/refills`, `/customers/:id*` |
| `caja` | `/cash*` |
| `comprobantes` | `/vouchers*`, `/credit-notes*` |
| `asistencia` | `/attendance/*` |
| `reportes` | `GET /reports/sales` |
| `auditoria` | `GET /audit` |
| `ajustes` | `/settings/*` |

  No bloquees por módulo los endpoints compartidos: `/public/*`, `/auth/*`, `/account`, `GET /products`, `GET /lots`, `GET /stock/summary`. Las pantallas los usan desde varios módulos.
- Planes (`src/lib/domain/plans.ts`, `plans.test.ts`): precio de lista sin IGV, `priceMonthly` con IGV a 2 decimales.

| Plan (`id`) | Sin IGV | Con IGV | Locales | Módulos |
| --- | --- | --- | --- | --- |
| `inicio` | 50 | 59.00 | 1 | `panel pos vencimientos inventario compras clientes caja comprobantes ajustes` |
| `crece` | 110 | 129.80 | 3 | los de `inicio` + `traslados reportes auditoria` |
| `cadena` | 210 | 247.80 | 10 | todos (+ `asistencia`) |

### 3.6 Fechas

- **Días locales** `YYYY-MM-DD` en hora de Lima (America/Lima, UTC-5, sin horario de verano). Vencimientos, `trialEndsAt`, `renewsAt`, rangos `from`/`to` (ambos incluidos).
- **Instantes** en ISO 8601 con zona (`2026-10-27T15:20:00-05:00`; UTC con `Z` también sirve).
- "Hoy", "desde las 00:00", plazos de 7 días, tablero por hora: todo se corta en hora de Lima, no UTC. Una venta a las 22:30 de Lima ya es del día siguiente en UTC.
- La hora de una marcación de asistencia la pone el **servidor**.

### 3.7 Dinero

- Soles con 2 decimales. Usa `DECIMAL(12,2)` o céntimos enteros; nunca `float`.
- `round2(n) = Math.round(n * 100) / 100` (`src/lib/domain/pharmacy.ts`). Replica el redondeo: la prueba de dominio te dice qué esperan los totales.
- **Precios con IGV (18 %); costos sin IGV.** `taxBase = round2(total / 1.18)`, `igv = round2(total − taxBase)`.
- Margen = (precio sin IGV − costo) / precio sin IGV.
- Línea de venta: `total = round2(qty × precioPresentación × (1 − descuentoPonderado))`.
- Puntos del cliente: 1 por cada S/ 10 (`Math.floor(total / 10)`).

### 3.8 Paginación

Convención `Page<T>` = `{ items, total, page, pageSize }`, con `page` desde 1, `pageSize` por defecto 25 y máximo 100. Una página fuera de rango no es error: se corrige a la última con datos. Orden estable.

| Endpoint | Paginación |
| --- | --- |
| `GET /audit`, `GET /platform/tenants` | Siempre por páginas |
| `GET /kardex`, `GET /customers/all` | **Opcional**: sin `page` responde lo de siempre; con `page`, versión recortada y con totales |
| `GET /vouchers`, `GET /credit-notes`, `GET /reports/sales` | **Sin paginar a propósito** (máximo 370 días) |

Reglas con pruebas: `src/lib/domain/pagination.ts` / `pagination.test.ts`.

### 3.9 Idempotencia

`POST /sales` lleva `clientSaleId` (UUID, 8 a 64 caracteres `A-Za-z0-9_-`), `unique` por botica. Mismos datos → devuelve la venta original (`200`); otros datos → `409 CLAVE_REPETIDA`. La búsqueda por clave va **antes** de validar caja y stock. Detalle: [`API.md`, "Clave de idempotencia"](API.md#clave-de-idempotencia-clientsaleid-y-ventas-sin-conexión).

## 4. Reglas de negocio que el backend debe repetir

Cada fila: el archivo con la regla y el test que sirve como caso de prueba. Lee primero el test; es más corto que el código.

| Regla | Archivo | Test (casos listos) |
| --- | --- | --- |
| **FEFO**: la venta saca de los lotes del local, no vencidos, del que vence primero al último (desempate por `id`). Descuento del lote ponderado por unidades. Presentaciones (unidad, blíster, caja) y `units = qty × unidades` | `domain/pharmacy.ts` (`allocateFefo`, `sellableLots`, `weightedDiscount`) | `pharmacy.test.ts` |
| **Comprobante**: boleta con DNI de 8 dígitos (obligatorio sobre S/ 700, ver duda 10.5); factura con RUC de 11 dígitos que empiece en 10 o 20 y razón social. Receta con número, médico y CMP de 4 a 6 dígitos | `domain/pharmacy.ts` (`documentIsValid`, `isValidCmp`) | `pharmacy.test.ts` |
| **Stock por lote y por local**; nunca se edita a mano; cada movimiento queda en el **kardex** (inmutable). Tipos: `ingreso`, `venta`, `merma`, `devolucion`, `ajuste`, `traslado_salida`, `traslado_ingreso`. `closing` y los movimientos deben cuadrar | `domain/inventory.ts` (`kardexBalances`, `kardexView`, `validateProduct`) | `inventory.test.ts` |
| **Compras**: lote repetido con mismo vencimiento suma y promedia costo; con otro vencimiento `LOTE_CONFLICTO`; documento del proveedor único; vencimiento posterior a hoy | `domain/purchasing.ts` (`checkReceiptLine`, `isValidLotCode`, `isValidSupplierDocument`) | `purchasing.test.ts` |
| **Vencimientos**: semáforo (`red` 30 y `yellow` 90 días por defecto), descuento de lote de 0 a 0.5, baja `merma`/`devolucion` | `domain/expiry.ts`, `domain/pharmacy.ts` (`expiryTone`) | `expiry.test.ts` |
| **Traslados**: `solicitado` → `en_transito` → `recibido`; `anulado` desde los dos primeros. Envío directo, pedido, despacho (lo que alcance por FEFO), recepción con mismo lote y vencimiento, anulación que devuelve stock. Código `T-0012` | `domain/transfers.ts` (`transferActions`, `transferCode`, `checkTransferLine`) | `transfers.test.ts` |
| **Caja**: un turno por local; `expected = fondo + ventas en efectivo − devoluciones en efectivo + ingresos − egresos − retiros`; diferencia de S/ 1 o más exige nota; menos de 5 céntimos se ve como "cuadra". Todo en céntimos | `domain/cash.ts` (`expectedCash`, `closeDifference`, `movementError`) | `cash.test.ts` |
| **Anulación (comunicación de baja)**: solo `aceptado`, dentro de 7 días calendario (Lima) desde la emisión; si no, `PLAZO_VENCIDO` y corresponde nota de crédito. No se anula uno con nota válida. Motivo de 5 a 160 caracteres | `domain/vouchers.ts` (`voidBlocker`, `voidDeadline`, `VOID_WINDOW_DAYS`) | `vouchers.test.ts` |
| **Notas de crédito** (catálogo 09): `01` anulación y `06` devolución total (acreditan todo; solo si no hay otra nota válida); `07` por ítem; `04` descuento global y `09` disminución (con `amount`, sin stock). Numeración `BC01-000001` / `FC01-000001`. Nunca acreditar más que el total ni más de lo vendido | `domain/vouchers.ts` (`planCreditNote`, `creditNoteNumber`, `allocateReturn`) | `vouchers.test.ts`, `mock/vouchers.test.ts` |
| **Cómo restan las notas**: una nota válida (no rechazada ni anulada) resta de la venta neta el día y el turno en que se **emitió**, por el método de pago de la venta original. Solo el efectivo baja el efectivo esperado de la caja. El costo se revierte al costo del lote de origen solo si el stock vuelve. Aplica a caja, panel, reportes, compras del cliente y velocidad de venta | `domain/returns.ts` (`returnLines`, `returnsByMethod`, `netPurchase`) | `returns.test.ts` |
| **Reportes**: devoluciones como líneas `kind: "devolucion"` en negativo; las cifras ya salen netas | `domain/reports.ts`, `domain/returns.ts` | `reports.test.ts`, `returns.test.ts` |
| **Clientes**: nombre ≥ 3 letras; DNI de 8 y RUC válido, sin repetir; para `contactConsent` hace falta celular peruano (9 dígitos que empiezan en 9); tratamiento con ciclo de 1 a 365 días. **Consentimiento (Ley 29733):** sin `contactConsent`, `POST /customers/:id/contacts` responde `403 SIN_CONSENTIMIENTO` | `domain/customers.ts` (`validateCustomer`, `peruMobile`, `pointsFor`) | `customers.test.ts` |
| **Asistencia**: orden de marcas entrada → refrigerio (una vez) → salida; tardanza, horas, extra | `domain/attendance.ts` (`allowedMarks`, `daySummary`) | `attendance.test.ts` |
| **Ajustes**: validación de botica (RUC, colores, contraste ≥ 4.5), locales, series de 3 dígitos, cuentas, PIN no repetido ni seguido, rangos de reglas | `domain/settings.ts` | `settings.test.ts` |
| **Cuenta y plan**: estado efectivo, módulos permitidos, aviso | `domain/account.ts`, `domain/plans.ts` | `account.test.ts`, `plans.test.ts` |
| **Registro**: código de botica, correo, contraseña ≥ 8, pasos de configuración inicial | `domain/auth.ts`, `domain/onboarding.ts` | `auth.test.ts`, `onboarding.test.ts` |
| **Consola de plataforma**: cambiar plan, extender prueba (1 a 60 días), suspender, reactivar; motivo de 5 a 200 caracteres | `domain/platform.ts` (`applyTenantAction`) | `platform.test.ts`, `mock/platform.test.ts` |
| **Auditoría**: qué acciones y entidades existen, qué campos se muestran | `domain/audit.ts` | `audit.test.ts`, `mock/audit.test.ts` |
| **Ventas sin conexión**: lotes de máximo 50, un resultado por venta, `created`/`replayed`/`failed` | `domain/offline-sales.ts` (`SYNC_BATCH_MAX`, `classifyFailure`) | `offline-sales.test.ts`, `mock/offline-sales.test.ts` |
| **Privacidad de errores**: nunca DNI, RUC, celular, correo, PIN ni token en logs de error | `domain/privacy.ts` | `privacy.test.ts` |

**Receta y controlados (DIGEMID):** si algún producto no es `libre` la venta exige receta (`RECETA_REQUERIDA`). Los controlados los dispensa un químico farmacéutico: las cuentas de local lo son. El libro de recetas se arma desde `GET /reports/sales` (campo `prescription`).

## 5. Mapa de endpoints por módulo

Leyenda de **Fase** (sección 6): **F0**–**F2** = obligatorio para arrancar; **F3**–**F6** = después. Columna **Quién**: *todos* = cualquier sesión de la botica; *público* = sin token pero con `X-Botica` (salvo `/platform/*`). La sección es la de [`API.md`](API.md). En todos los `POST/PUT/PATCH` rige el solo lectura de 3.5.

### 5.1 Acceso y botica

| Método | Ruta | Quién | Qué hace | API.md | Fase |
| --- | --- | --- | --- | --- | --- |
| GET | `/public/botica/:code` | público | Marca de la botica antes de ingresar (`BoticaPublic`) | Públicos | F0 |
| GET | `/public/config` | público | Botica, locales activos y cerrados, plan, reglas | Públicos, Ajustes | F0 |
| GET | `/auth/staff` | público | Lista de usuarios para el ingreso (sin PIN) | Públicos | F0 |
| POST | `/auth/login` | público | Ingreso con `userId` y PIN; bloqueo 5 min tras 5 fallos | Públicos | F0 |
| POST | `/auth/owner-login` | público | Ingreso del dueño con correo y contraseña | Públicos | F0 |
| GET | `/auth/me` | todos | Usuario de la sesión | Sesión | F0 |
| POST | `/auth/logout` | todos | Cierra sesión (`204`) | Sesión | F0 |

### 5.2 Cuenta, plan, registro y configuración inicial

| Método | Ruta | Quién | Qué hace | API.md | Fase |
| --- | --- | --- | --- | --- | --- |
| GET | `/account` | todos | Estado de la cuenta y módulos del plan | Cuenta y plan | F0 |
| GET | `/public/plans` | público | Planes contratables | Registro y primera configuración | F5 |
| POST | `/public/signup` | público | Crea botica en prueba de 14 días y devuelve la sesión del dueño | Registro y primera configuración | F5 |
| GET | `/setup` | `admin` | Pasos de configuración inicial hechos | Registro y primera configuración | F5 |
| POST | `/setup/steps/:step` | `admin` | Marca un paso (idempotente) | Registro y primera configuración | F5 |

### 5.3 Catálogo, inventario y vencimientos

| Método | Ruta | Quién | Qué hace | API.md | Fase |
| --- | --- | --- | --- | --- | --- |
| GET | `/products` | todos | Catálogo compartido por los locales | Catálogo e inventario | F1 |
| POST | `/products` | `admin` | Alta de producto (`201`) | Inventario y kardex | F1 |
| PUT | `/products/:id` | `admin` | Edita producto | Inventario y kardex | F1 |
| GET | `/lots?branchId=` | todos (su local) | Lotes con `qty > 0`, incluidos vencidos | Catálogo e inventario | F1 |
| GET | `/stock/summary` | todos | Stock vigente por local y producto | Catálogo e inventario | F1 |
| GET | `/kardex?productId=&days=&branchId=` | todos (su local) | Movimientos y `closing`; `page` opcional | Inventario y kardex | F1 |
| GET | `/sales/velocity?days=` | todos | Unidades vendidas por local y producto (todos los locales) | Vencimientos | F4 |
| PATCH | `/lots/discount` | su local | Descuento (0 a 0.5) a varios lotes | Vencimientos | F4 |
| POST | `/lots/:id/write-off` | su local | Baja `merma` o `devolucion` de un lote | Vencimientos | F4 |

### 5.4 Compras

| Método | Ruta | Quién | Qué hace | API.md | Fase |
| --- | --- | --- | --- | --- | --- |
| GET | `/suppliers` | todos | Proveedores | Compras | F1 |
| POST | `/suppliers` | `admin` | Alta (RUC 10/20 sin repetir) | Compras | F1 |
| PUT | `/suppliers/:id` | `admin` | Edita; se desactiva con `active: false` | Compras | F1 |
| GET | `/purchases?days=&branchId=` | su local | Ingresos recientes | Compras | F1 |
| POST | `/purchases` | su local | Ingreso por lote: crea lotes, kardex y costo (transacción, `201`) | Compras | F1 |

### 5.5 Traslados

| Método | Ruta | Quién | Qué hace | API.md | Fase |
| --- | --- | --- | --- | --- | --- |
| GET | `/transfers?days=` | su local | Recientes más todos los en curso | Traslados | F4 |
| POST | `/transfers` | origen | Envío directo, queda `en_transito` (`201`) | Traslados | F4 |
| POST | `/transfers/requests` | destino | Pedido, queda `solicitado`, sin mover stock (`201`) | Traslados | F4 |
| POST | `/transfers/:id/dispatch` | origen | Despacha un pedido por FEFO | Traslados | F4 |
| POST | `/transfers/:id/receive` | destino | Recibe; entra al destino con el mismo lote | Traslados | F4 |
| POST | `/transfers/:id/cancel` | origen/destino | Anula (motivo obligatorio); el stock vuelve | Traslados | F4 |

### 5.6 Ventas / POS (incluye ventas sin conexión)

| Método | Ruta | Quién | Qué hace | API.md | Fase |
| --- | --- | --- | --- | --- | --- |
| POST | `/sales` | su local | Registra la venta en una transacción (`201`; `200` si repite `clientSaleId`) | Ventas | F2 |
| POST | `/sales/sync` | su local | Lote de hasta 50 ventas hechas sin internet, una a una y en orden | Ventas (sync) | F6 |

### 5.7 Comprobantes (SUNAT)

| Método | Ruta | Quién | Qué hace | API.md | Fase |
| --- | --- | --- | --- | --- | --- |
| GET | `/vouchers?from=&to=&branchId=` | su local | Boletas y facturas con estado SUNAT (máx. 370 días) | Comprobantes electrónicos | F3 |
| GET | `/credit-notes?from=&to=&branchId=` | su local | Notas de crédito | Comprobantes electrónicos | F3 |
| POST | `/vouchers/:id/resend` | su local | Reenvía a SUNAT un pendiente o rechazado | Comprobantes electrónicos | F3 |
| POST | `/credit-notes/:id/resend` | su local | Lo mismo para una nota | Comprobantes electrónicos | F3 |
| POST | `/vouchers/:id/void` | su local | Comunicación de baja (7 días) | Comprobantes electrónicos | F3 |
| POST | `/vouchers/:id/credit-notes` | su local | Emite nota de crédito (`201`) | Comprobantes electrónicos | F3 |

### 5.8 Clientes

| Método | Ruta | Quién | Qué hace | API.md | Fase |
| --- | --- | --- | --- | --- | --- |
| GET | `/customers?q=` | todos | Búsqueda rápida (máx. 8) para el POS | Clientes | F2 |
| POST | `/customers` | todos | Alta rápida | Clientes | F2 |
| GET | `/customers/all` | todos | Cartera con totales netos; `page`, `pageSize`, `q` opcionales | Clientes y recompras | F4 |
| GET | `/customers/refills` | todos | Recompras: una fila por cliente y tratamiento | Clientes y recompras | F4 |
| PUT | `/customers/:id` | todos | Edita cliente | Clientes y recompras | F4 |
| GET | `/customers/:id/purchases` | todos | Últimas 50 compras (netas de notas) | Clientes y recompras | F4 |
| POST | `/customers/:id/contacts` | todos | Registra un aviso (`204`); exige consentimiento | Clientes y recompras | F4 |

### 5.9 Caja

| Método | Ruta | Quién | Qué hace | API.md | Fase |
| --- | --- | --- | --- | --- | --- |
| GET | `/cash/closings?days=&branchId=` | su local | Historial de cierres (**declarar antes de `/cash/:branchId`**) | Caja (sexta entrega) | F2 |
| GET | `/cash/:branchId` | su local | Estado de la caja | Caja | F2 |
| POST | `/cash/:branchId/open` | su local | Abre con fondo de 0 a 5000 | Caja | F2 |
| GET | `/cash/:branchId/summary` | su local | Turno abierto: ventas, devoluciones, movimientos, `expected` | Caja (sexta entrega) | F2 |
| POST | `/cash/:branchId/movements` | su local | Egreso, retiro o ingreso (`201`) | Caja (sexta entrega) | F2 |
| POST | `/cash/:branchId/close` | su local | Arqueo y cierre (`201`) | Caja (sexta entrega) | F2 |

### 5.10 Asistencia

| Método | Ruta | Quién | Qué hace | API.md | Fase |
| --- | --- | --- | --- | --- | --- |
| GET | `/public/attendance/workers?branchId=` | público | Trabajadores activos con sus marcas de hoy (sin PIN) | Asistencia | F4 |
| POST | `/public/attendance/clock` | público | Marca con PIN personal; máx. 10 intentos por minuto por trabajador (`201`) | Asistencia | F4 |
| GET | `/attendance/workers` | `admin` | Trabajadores activos e inactivos | Asistencia | F4 |
| POST | `/attendance/workers` | `admin` | Alta con PIN de 4 dígitos | Asistencia | F4 |
| PUT | `/attendance/workers/:id` | `admin` | Edita; PIN vacío = no cambia | Asistencia | F4 |
| GET | `/attendance/marks?from=&to=&branchId=` | `admin` | Marcas del periodo (máx. 1 año) | Asistencia | F4 |
| POST | `/attendance/marks/manual` | `admin` | Marca manual con motivo | Asistencia | F4 |

### 5.11 Panel y reportes

| Método | Ruta | Quién | Qué hace | API.md | Fase |
| --- | --- | --- | --- | --- | --- |
| GET | `/dashboard?days=` | todos (su local) | Venta de hoy y de los últimos días, neta de devoluciones | Panel del día | F3 |
| GET | `/reports/sales?from=&to=&branchId=` | `admin` (y local propio) | Una fila por línea de venta; devoluciones en negativo | Reportes | F3 |

### 5.12 Auditoría

| Método | Ruta | Quién | Qué hace | API.md | Fase |
| --- | --- | --- | --- | --- | --- |
| GET | `/audit?from=&to=&userId=&action=&entity=&page=&pageSize=` | `admin` | `Page<AuditEntry>`; leerla no deja registro | Auditoría | F5 |

### 5.13 Consola de plataforma (Digi!HME, sin `X-Botica`)

| Método | Ruta | Quién | Qué hace | API.md | Fase |
| --- | --- | --- | --- | --- | --- |
| POST | `/platform/login` | público | Ingreso del operador con correo y contraseña | Consola interna | F5 |
| POST | `/platform/logout` | operador | Cierra sesión (`204`) | Consola interna | F5 |
| GET | `/platform/tenants?q=&status=&page=&pageSize=` | operador | Boticas por páginas, con `counts` por estado | Consola interna | F5 |
| PATCH | `/platform/tenants/:code` | operador | `change_plan`, `extend_trial`, `suspend`, `reactivate` (con motivo) | Consola interna | F5 |

### 5.14 Ajustes (todo `admin`)

| Método | Ruta | Qué hace | API.md | Fase |
| --- | --- | --- | --- | --- |
| PUT | `/settings/pharmacy` | Datos y colores de la botica | Ajustes | F5 |
| POST | `/settings/branches` | Crea local (y su cuenta, opcional); `LIMITE_DEL_PLAN` | Ajustes | F5 |
| PUT | `/settings/branches/:id` | Nombre, dirección y serie | Ajustes | F5 |
| POST | `/settings/branches/:id/deactivate` | Desactiva local con motivo | Ajustes | F5 |
| POST | `/settings/branches/:id/activate` | Reactiva local | Ajustes | F5 |
| GET | `/settings/series` | Último correlativo por serie | Ajustes | F5 |
| PUT | `/settings/rules` | Vencimientos, compras y asistencia | Ajustes | F5 |
| GET | `/settings/accounts` | Cuentas de mostrador (sin PIN) | Ajustes | F5 |
| POST | `/settings/accounts` | Crea cuenta | Ajustes | F5 |
| PUT | `/settings/accounts/:id` | Edita cuenta (rol, local, PIN, estado) | Ajustes | F5 |

**Total: 77 endpoints** (7 + 5 + 9 + 5 + 6 + 2 + 6 + 7 + 6 + 7 + 2 + 1 + 4 + 10 = 77).

**Orden de rutas.** Declara las rutas fijas antes de las que llevan `:id`: `GET /cash/closings` antes de `GET /cash/:branchId`; `GET /customers/all` y `GET /customers/refills` antes de `GET/PUT /customers/:id`; `POST /transfers/requests` antes de `POST /transfers/:id/...`. En Nest, el orden de métodos dentro del controlador manda.

## 6. Orden sugerido de implementación

Cada fase termina cuando **las pantallas listadas funcionan contra tu backend sin tocar el front** (`NEXT_PUBLIC_API_MODE=http`).

| Fase | Qué construyes | Desbloquea | Listo cuando… |
| --- | --- | --- | --- |
| **F0 Base** | Resolución de botica por `X-Botica`, formato de errores, middleware de token, guardia de solo lectura, `/public/botica`, `/public/config`, `/auth/*`, `/account`. Siembra una botica de prueba con los datos del mock | Todo lo demás | `/login`: eliges botica, ves los usuarios, ingresas con PIN y con correo; el panel abre; una cuenta suspendida muestra el aviso y bloquea escrituras |
| **F1 Catálogo, stock y compras** | `/products`, `/lots`, `/stock/summary`, `/kardex`, `/suppliers`, `/purchases`. Tabla de movimientos (kardex) desde el día uno | Tener stock para vender | `/inventario` lista productos y kardex con saldos que cuadran; `/compras` ingresa lotes (stock inicial con documento `INV-1`) |
| **F2 Caja y venta** | `/cash/*`, `POST /sales` (FEFO, descuentos, receta, documento, correlativo por serie, puntos), `/customers` (buscar/alta). La venta ya crea su comprobante en `pendiente` (puedes aceptarlo automático hasta F3) | El corazón del negocio | `/pos`: abres caja, vendes con efectivo/Yape/tarjeta, imprimes el ticket; `/caja` cuadra y cierra |
| **F3 Comprobantes, panel y reportes** | Proveedor de facturación (adaptador), `/vouchers*`, `/credit-notes*`, anulación, notas de crédito con efecto en caja/panel/reportes, `/dashboard`, `/reports/sales` | Cifras netas correctas | `/comprobantes` reenvía, anula y emite notas; `/panel` y `/reportes` restan devoluciones; la caja descuenta el efectivo devuelto |
| **F4 Operación completa** | `/sales/velocity`, `/lots/discount`, `/lots/:id/write-off`, `/transfers*`, clientes completos (`/customers/all`, `refills`, `contacts`…), `/attendance/*` y `/public/attendance/*` | Resto de módulos de botica | `/vencimientos`, `/traslados`, `/clientes`, `/asistencia` funcionan; marcación sin sesión desde el ingreso |
| **F5 SaaS** | `/settings/*`, `/public/plans`, `/public/signup`, `/setup*`, `GET /audit`, `/platform/*`, módulos por plan, cobro de plan | Vender a más boticas | `/registro` crea una botica y entra; `/ajustes` completo; `/auditoria` pagina y filtra; `/consola` suspende y reactiva |
| **F6 Producción** | `POST /sales/sync`, índices y rendimiento, Sentry, backups, SUNAT en producción | Salir a producción | Cortar internet en `/pos`, vender, reconectar: las ventas suben solas sin duplicarse |

**Dos puntos que cruzan fases:**

- **Auditoría:** escribe las entradas desde F1 con un solo punto del servidor (interceptor o middleware, no endpoint por endpoint); la pantalla (`GET /audit`) llega en F5. El mock lo hace con un único envoltorio, `auditWrites` en `src/lib/api/mock/audit.ts`.
- **Multi-tenant:** pon `tenant_id` en todas las tablas y fíltralo en un solo lugar desde F0. Cambiarlo después duele.

## 7. Lo que el mock simula y el backend debe hacer de verdad

| Tema | En el mock / front hoy | Del backend |
| --- | --- | --- |
| **Facturación SUNAT** | El mock acepta al instante o deja `pendiente`/`rechazado` de ejemplo (`acceptedResponse`) | Envío real vía proveedor de facturación: estados `pendiente`/`aceptado`/`rechazado`/`anulado`, `sunat { code, message, at }`, `attempts`, comunicación de baja con `ticket`. **QR y hash del ticket:** el proveedor los entrega y el contrato **aún no los incluye** (duda 10.10) |
| **Contraseñas y PIN** | En claro en `localStorage` | Hash (argon2/bcrypt) de contraseñas del dueño, PIN de mostrador, PIN de asistencia y contraseñas de operador |
| **Bloqueo por intentos** | No existe | `POST /auth/login`: 5 min tras 5 fallos por usuario. `/auth/owner-login` y `/platform/login`: bloqueo similar. Marcación: 10 intentos por minuto por trabajador |
| **Tokens y sesión** | Token ficticio, 12 h | Emisión y vencimiento reales; invalidar sesiones al cambiar PIN/rol/local o desactivar una cuenta o local |
| **Multi-tenant** | Un `localStorage` por botica | Aislamiento real por botica en cada consulta; `CORREO_EN_USO` y `CODIGO_EN_USO` globales (el mock solo ve su propia botica) |
| **Plan y cobro** | `Account` editable a mano | Cobro y renovación; estado calculado; rechazar endpoints de módulos fuera del plan; correos del registro |
| **Auditoría** | Envoltorio en el mock | Un solo punto del servidor, inmutable; nunca DNI, RUC de clientes, nombres de clientes, PIN ni contraseñas (de un PIN solo `pinChanged: true`) |
| **Concurrencia** | Un solo navegador | Transacciones al vender, trasladar, comprar y cerrar caja (bloqueo de filas de lotes); correlativos sin huecos ni repetidos por serie |
| **Reloj** | `Date.now()` del navegador | Hora del servidor en Lima (marcaciones, "hoy", plazos) |
| **Monitoreo (Sentry)** | Gancho apagado: `src/lib/monitoring.ts` | Conectar el SDK en el front siguiendo la guía de `README.md` ("Monitoreo de errores"); sumar Sentry en el servidor. Ya está filtrada la información personal en el front (`domain/privacy.ts`); haz lo mismo en el backend |
| **Backups** | — | Copias automáticas y prueba de restauración (los datos de salud y de clientes caen bajo la Ley 29733) |
| **Excel y gráficos** | Hechos en el front | Nada: el front genera los `.xlsx` y los gráficos |
| **Ticket de 80 mm** | Se imprime desde el front | Nada: no generes PDF |
| **PWA / service worker** | `public/sw.js`, `src/app/manifest.ts`; la cola de ventas vive en IndexedDB | Solo `POST /sales/sync` y la idempotencia |

## 8. Riesgos y trampas conocidas

### 8.1 Contrato

1. **Un 401 cierra la sesión** (`http.ts`: borra el token y avisa al layout), salvo que el cuerpo traiga `code` `PIN_INVALIDO` o `CREDENCIALES_INVALIDAS` (`isSessionExpiry` en `src/lib/api/errors.ts`). Por eso el 401 de `POST /public/attendance/clock` con PIN malo no saca al usuario. Mantén siempre el campo `code` en el cuerpo de los 401 y no uses 401 para reglas de negocio.
2. **Un mismo endpoint, dos formas de respuesta:** `GET /customers/all` devuelve un arreglo sin `page` y un `Page<CustomerSummary>` con `page`; `GET /kardex` suma `total`, `page`, `pageClosing`, `summary` solo con `page`. Respeta ambas.
3. **`ESTADO_INVALIDO` sirve para tres cosas:** traslados fuera de estado, comprobantes (reenviar uno aceptado, anular uno pendiente, nota sobre uno no aceptado) y acciones sobre boticas. El plazo de anulación vencido es `PLAZO_VENCIDO` (otro código).
4. **`created` vs `replayed` en `/sales/sync`:** una venta repetida es `replayed` (no se toca stock ni correlativo). Un error pasajero va como `failed` con `ERROR_INTERNO` y el front la reintenta sola; cualquier otro código es rechazo definitivo.
5. **Errores que afectan a todo el lote de `/sales/sync`** van como respuesta HTTP sin `results` (`401`, `403 CUENTA_SUSPENDIDA`, `400`, 5xx). El front espera con retardo creciente (5 s, 10 s, 20 s… hasta 5 min).
6. **Tiempos del front:** `POST /sales` espera 20 s; `/sales/sync`, 60 s. Una venta lenta se guarda sin conexión y se reintenta con la misma `clientSaleId`: tu idempotencia debe resistir una venta que sí llegó pero cuya respuesta se perdió.

### 8.2 Dinero y caja

7. **Notas de crédito con la caja cerrada** no restan de ningún turno (el reembolso sale de la caja del turno en que se emite). Está documentado como límite conocido; conviene abrir caja antes de devolver efectivo.
8. **La nota resta el día de su emisión, no el de la venta**: el panel, los reportes y el cierre pueden mostrar devoluciones de ventas de otros días. Es intencional.
9. **`GET /vouchers`, `/credit-notes` y `/reports/sales` no se paginan** (hasta 370 días). Con volumen real necesitan índices por `(botica, local, fecha)` y, más adelante, filtros en el servidor (`status`, `type`, `q`).
10. **Flotantes:** `0.1 + 0.2`. Haz las sumas de caja y devoluciones en céntimos (`domain/cash.ts`, `returns.test.ts` tiene un caso "10.30 − 0.10"). Un descuento global se reparte entre productos "sin perder ni inventar centavos".

### 8.3 Ventas sin conexión

11. **Numeración `OFF-0001`:** es un ticket provisional por equipo y botica; no es único entre equipos. Guarda `offlineTicket` sin restricción `unique`. El número oficial (`B001-000123`) lo asigna el backend al registrar.
12. **El orden de llegada es el orden de los correlativos:** `/sales/sync` procesa de una en una y en el orden recibido.
13. **Una venta offline que llega con la caja cerrada** falla con `CAJA_CERRADA` en el mock (rechazo definitivo; el administrador la reintenta o la descarta). Falta decidir si el servidor debe aceptarla por `soldAt` (duda 10.8).
14. **Sesión offline:** el token vive en `sessionStorage`. Si se cierra la ventana sin internet no se puede volver a ingresar hasta que vuelva la conexión (el ingreso no funciona offline).
15. **Solo se asume una pestaña por equipo** para la numeración `OFF-`.
16. **Sin probar en navegador real:** instalación de la PWA y cola sin conexión, impresión en ticketera de 80 mm, envío real a Sentry.

### 8.4 Multi-tenant y datos

17. `CORREO_EN_USO` y `CODIGO_EN_USO` deben garantizarse globalmente.
18. El id del local (`principal`, `sucursal-amarilis`) lo genera el backend a partir del nombre y queda fijo aunque el nombre cambie. Si ya existe, `-2`, `-3`.
19. **Locales:** nunca asumas "principal" y "sucursal" ni que son dos. Desactivar un local no borra nada: ventas, cierres, kardex y marcas siguen en reportes; las operaciones nuevas dan `LOCAL_INACTIVO`.
20. **Rutas con `:branchId`:** el front pasa `encodeURIComponent(branchId)`.
21. **Si cambia la forma de los datos del mock**, su `VERSION` sube y se regeneran. No es un problema tuyo, pero explica por qué el mock "pierde" datos al actualizar el front.
22. **El `Voucher.id` es el mismo `id` de la venta** (`Sale.id`). No tienes que inventar otro.

## 9. Cómo probar que cumples el contrato

1. **Casos de dominio como especificación.** Los tests de `src/lib/domain/*.test.ts` están escritos en español y cuentan la regla. Para cada regla de la sección 4, transforma los casos a tu framework de pruebas (o escríbelos como pruebas de integración contra tu API) y verifica que den los mismos números. Se corren con `npx vitest run src/lib/domain/pharmacy.test.ts`.
2. **Pruebas del mock = pruebas de comportamiento de API.** `src/lib/api/mock/*.test.ts` (`vouchers`, `offline-sales`, `audit`, `platform`, `pagination`) llaman al cliente completo: son el guion de pruebas de integración de tus endpoints. Se pueden adaptar para correr con `createHttpClient(baseUrl)` en lugar del mock.
3. **Contra el front real:** `NEXT_PUBLIC_API_MODE=http` y recorre la pantalla del módulo. Si pasa sin cambiar el front, cumples.
4. **Revisa tipos:** cada respuesta debe tener la forma de `src/lib/api/types.ts`. Campos opcionales que no vengan se tratan como `undefined`/`null` según el tipo; no devuelvas `""` por `null`.
5. **Orden de validaciones:** copia el del mock (`async createSale(`: clave → hora → caja → ítems/FEFO → receta → documento → pago).

**Checklist por módulo (para que el front pase sin cambios):**

- [ ] **Acceso:** 401 `PIN_INVALIDO` y `CREDENCIALES_INVALIDAS` con mensajes en español; `404 BOTICA_NO_ENCONTRADA`; `/auth/staff` sin PIN; token vencido → `401 NO_AUTORIZADO`.
- [ ] **Cuenta:** `suspended` responde `403 CUENTA_SUSPENDIDA` en toda escritura salvo login/logout; los `GET` siguen; prueba vencida llega como `overdue`.
- [ ] **Inventario:** `kardex.closing` = suma de lotes del alcance (incluye vencidos) y cuadra con `entries[].delta`; con `page`, `pageClosing` y `summary` correctos.
- [ ] **Compras:** `DOCUMENTO_DUPLICADO`, `LOTE_CONFLICTO`, `FECHA_VENCIDA`; costo del producto actualizado; movimiento `ingreso` con `reference` `Compra F001-00012345 · <proveedor>`.
- [ ] **Venta:** reparto FEFO con `items[].lots`; descuento ponderado; `RECETA_REQUERIDA`, `DOCUMENTO_INVALIDO`, `PAGO_INSUFICIENTE`, `STOCK_INSUFICIENTE`, `CAJA_CERRADA`; puntos; correlativo por serie; repetir `clientSaleId` devuelve la misma venta.
- [ ] **Caja:** `expected` según la fórmula; `CAJA_SIN_EFECTIVO`; `DIFERENCIA_SIN_MOTIVO`; `counted` recalculado desde `denominations`; cierre bloquea nuevas ventas.
- [ ] **Comprobantes:** reenvío solo `pendiente`/`rechazado`; baja en 7 días solo para `aceptado` sin notas; notas `01/04/06/07/09`; numeración `BC01-…`/`FC01-…`; stock vuelve a los lotes originales en orden.
- [ ] **Devoluciones:** caja, panel, reportes, `customers/all`, `customers/:id/purchases` y `sales/velocity` ya salen netos.
- [ ] **Traslados:** máquina de estados y permisos origen/destino; `STOCK_INSUFICIENTE` no mueve nada; recepción conserva lote y vencimiento.
- [ ] **Clientes:** `SIN_CONSENTIMIENTO`; `q` busca por nombre o dígitos de DNI/RUC/celular; orden por compra más reciente.
- [ ] **Asistencia:** marcación sin sesión; `MARCA_FUERA_DE_ORDEN`; hora del servidor; PIN con hash.
- [ ] **Ajustes:** `LIMITE_DEL_PLAN`, `LOCAL_NO_SE_PUEDE_CERRAR`, `CUENTA_PROTEGIDA`; sesiones invalidadas al cambiar PIN/rol/local.
- [ ] **Auditoría:** una entrada por acción completada; `sesion_fallida` incluida; ninguna entrada por una escritura rechazada; sin datos personales.
- [ ] **Plataforma:** token separado; `change_plan` respeta el límite de locales; el motivo queda en la auditoría de esa botica.
- [ ] **Sync offline:** 50 por lote; `results` en el mismo orden; una rechazada no frena a las demás.

Antes de dar un cambio por bueno, en el front: `npm run typecheck` sin errores y `npm test` en verde.

## 10. Dudas para resolver con el front

Cosas que no se pudieron confirmar con el código ni con `API.md`. Cada una trae mi propuesta.

1. ~~`POST /public/attendance/clock` con PIN malo cerraba la sesión~~ **Resuelta en el front**: un 401 con `code` `PIN_INVALIDO` o `CREDENCIALES_INVALIDAS` ya no cierra la sesión. Condición: el backend debe enviar siempre ese `code` en el cuerpo.
2. **Códigos de error fuera de la tabla de `API.md`** (`CODIGO_EN_USO`, `CORREO_EN_USO`, `LIMITE_DEL_PLAN`, `LOCAL_NO_SE_PUEDE_CERRAR`, `LOCAL_INACTIVO`, `CUENTA_PROTEGIDA`, `SERIE_NO_AUTORIZADA`, `LOCAL_NO_EXISTE`, `CUENTA_NO_EXISTE`, `VENTA_VACIA`): hay que sumarlos a la tabla con su HTTP status. El texto de `API.md` y el mock dan 409/404/400 como en la sección 3.2.
3. **`SaleRequest.approverPin`** existe en `types.ts` ("PIN de un Q.F. cuando quien cobra no puede dispensar controlados") pero no está en `API.md` ni lo usa el mock (el mock da por hecho que todas las cuentas de local son Q.F.). ¿Se usa? ¿Cómo se valida?
4. **Plazo de DNI:** `API.md` y `CLAUDE.md` dicen "obligatorio desde S/ 700", pero `documentIsValid` exige DNI solo cuando `total > 700` (exactamente S/ 700 no lo pide). ¿Cuál vale? La norma habla de montos mayores a 700.
5. **Módulos del plan inicio:** el ejemplo de `GET /public/plans` en `API.md` muestra `["panel","pos","caja"]`, pero `plans.ts` da otra lista (9 módulos). Vale `plans.ts`. Además `asistencia` solo está en `cadena`: ¿los endpoints públicos de marcación (`/public/attendance/*`) también se bloquean en los planes que no la incluyen?
6. **Código HTTP al usar un módulo fuera del plan:** `API.md` no lo dice. Propuesta: `403 SIN_PERMISO` con mensaje "Tu plan no incluye este módulo". ¿O un código nuevo (`MODULO_NO_INCLUIDO`)?
7. **Permisos por endpoint no especificados:** ¿quién puede `PATCH /lots/discount` y `POST /lots/:id/write-off` (solo su local, entendido), `POST /customers`, `PUT /customers/:id` y `POST /purchases`? Y la lista exacta de `user.permissions` por rol (el mock tiene una; `API.md` dice "los define el backend"). Además `GET /reports/sales` acepta encargado, pero el mock no le da el módulo `reportes`.
8. **Venta offline que llega con la caja cerrada:** hoy es rechazo definitivo (`CAJA_CERRADA`). ¿El servidor debe aceptarla por `soldAt` (hora real del cobro) y asignarla al turno que estaba abierto entonces?
9. **Token:** ¿Bearer en `sessionStorage` (como hoy) o cookie httpOnly (exige cambio en `token.ts` y `credentials: "include"` en `http.ts`)? ¿Cuánto dura la sesión (el mock usa 12 h)? ¿Hay refresco de token?
10. **QR y hash de la representación impresa:** el contrato no los tiene (`Voucher` y `Sale` no traen `qr` ni `hash`; no existe en `types.ts`). ¿Qué proveedor de facturación se usa y cuándo se añaden esos campos?
11. **Subdominio o `X-Botica`:** `API.md` permite ambos. ¿Se implementa solo el header por ahora?
12. **Cuentas de operador de la plataforma:** no existe endpoint para crearlas (solo la del mock). ¿Se siembran por script?
13. **Zona horaria de los instantes:** el mock guarda UTC (`toISOString`) y `API.md` muestra `-05:00`. ¿Se acepta UTC con `Z` siempre?
14. **Paginar comprobantes y reportes:** `API.md` dice "cuando el volumen lo pida". ¿Con qué volumen se decide y quién cambia el front?
15. **Cobro del plan:** ¿pasarela y proveedor? No hay endpoints de facturación del plan (Ajustes solo lo muestra).

**Contacto (llenar):**

| Qué | Quién |
| --- | --- |
| Responsable del front | _______________ |
| Responsable del backend | _______________ |
| Canal para dudas del contrato | _______________ |
| Proveedor de facturación electrónica | _______________ |
| Proveedor de pagos del plan | _______________ |
| Entornos (URL de pruebas / producción) | _______________ |
