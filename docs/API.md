# Contrato de la API · Botica Huánuco

Este documento es el acuerdo entre el front (Next.js) y el backend (Node). El front ya funciona con una API simulada que sigue estas mismas reglas (`src/lib/api/mock/client.ts`); cuando un endpoint real esté listo, se cambia `NEXT_PUBLIC_API_MODE=http` y el front no cambia.

Los tipos exactos están en `src/lib/api/types.ts`. Si algo cambia, se actualizan los dos archivos en el mismo commit.

## Convenciones

- Base: `NEXT_PUBLIC_API_URL`, por ejemplo `https://api.boticahuanuco.pe/api`.
- JSON en todas las respuestas, `camelCase`.
- Dinero en soles con IGV incluido, número con 2 decimales. Costos sin IGV.
- Fechas de vencimiento como `YYYY-MM-DD`. Fechas y horas como ISO 8601 con zona (`2026-10-27T15:20:00-05:00`).
- Autenticación: `Authorization: Bearer <token>`. Un 401 hace que el front cierre la sesión.
- CORS: permitir el dominio del front y el header `Authorization`.

### Errores

Cualquier respuesta 4xx o 5xx trae este cuerpo. El front muestra `message` tal cual, así que debe estar en español y ser claro para el personal de la botica.

```json
{ "code": "STOCK_INSUFICIENTE", "message": "No hay stock suficiente de Amoxicilina 500 mg en este local.", "details": { "productId": 7 } }
```

| HTTP | `code` | Cuándo |
| --- | --- | --- |
| 401 | `PIN_INVALIDO` | Usuario o PIN incorrectos |
| 401 | `NO_AUTORIZADO` | Token vencido o inválido |
| 403 | `SIN_PERMISO` | Una cuenta de local intenta operar en otro local |
| 400 | `CAJA_CERRADA` | Venta con la caja del local cerrada |
| 400 | `RECETA_REQUERIDA` | Producto con receta sin número, médico o CMP |
| 400 | `DOCUMENTO_INVALIDO` | DNI o RUC no válido para el comprobante |
| 400 | `PAGO_INSUFICIENTE` | Efectivo recibido menor al total |
| 409 | `STOCK_INSUFICIENTE` | No alcanzan los lotes vigentes del local |
| 404 | `PRODUCTO_NO_EXISTE` | Producto eliminado o inexistente |
| 404 | `LOTE_NO_EXISTE` | Lote inexistente o de otro local |
| 400 | `DATOS_INVALIDOS` | Falta un dato o está fuera de rango (el `message` dice cuál) |
| 409 | `CODIGO_DUPLICADO` | El código de barras ya lo usa otro producto |
| 409 | `DOCUMENTO_DUPLICADO` | La factura o guía de ese proveedor ya se ingresó |
| 409 | `LOTE_CONFLICTO` | El lote ya existe en el local con otra fecha de vencimiento |
| 400 | `FECHA_VENCIDA` | Se intenta ingresar un lote vencido o que vence hoy |
| 404 | `PROVEEDOR_NO_EXISTE` | Proveedor inexistente o inactivo |
| 409 | `RUC_DUPLICADO` | Ya hay un proveedor con ese RUC |
| 404 | `TRASLADO_NO_EXISTE` | Traslado inexistente |
| 409 | `MARCA_FUERA_DE_ORDEN` | La marca no corresponde (p. ej. salida sin entrada) |
| 404 | `TRABAJADOR_NO_EXISTE` | Trabajador inexistente |
| 404 | `CLIENTE_NO_EXISTE` | Cliente inexistente |
| 403 | `SIN_CONSENTIMIENTO` | Se intenta registrar un aviso a un cliente que no aceptó recibirlos |
| 409 | `CAJA_ABIERTA` | Se intenta abrir una caja que ya está abierta |
| 400 | `CAJA_SIN_EFECTIVO` | El egreso o retiro supera el efectivo que debe haber |
| 400 | `DIFERENCIA_SIN_MOTIVO` | Cierre con diferencia de S/ 1 o más sin explicar |
| 409 | `ESTADO_INVALIDO` | La acción no corresponde al estado del traslado (p. ej. recibir un pedido sin despachar) |

## Roles y locales

| Rol | `branchId` | Puede |
| --- | --- | --- |
| `admin` | `null` | Ver y operar en todos los locales |
| `encargado` | su local | Solo leer y escribir datos de su local |

El backend valida el local en cada endpoint que recibe `branchId`; el front también lo oculta, pero la regla de verdad está en el servidor. `user.permissions` lista los módulos que la cuenta ve (ids de `src/lib/nav.ts`).

## Endpoints de esta primera entrega

### Públicos (sin token)

`GET /public/config` → `{ pharmacy: Pharmacy, branches: Branch[], expiry: { red: 30, yellow: 90 } }`. `expiry` son los días del semáforo de vencimientos (crítico hasta `red`, por vencer hasta `yellow`). También trae `attendance: { toleranceMinutes: 10, breakMinutes: 60, overtimeAfterMinutes: 15 }` y `purchasing: { coverDays: 15, minShelfDays: 180 }`: días que cubre el pedido sugerido y vida útil mínima al recibir (menos días = advertencia). Ambos se editarán en Ajustes.

`GET /auth/staff` → `StaffSummary[]`. Solo nombre, rol y local, nunca el PIN.

`POST /auth/login` con `{ "userId": "u2", "pin": "1111" }` → `Session` (`{ token, user, expiresAt }`). Recomendado: bloquear 5 minutos tras 5 intentos fallidos por usuario.

### Sesión

`GET /auth/me` → `User`

`POST /auth/logout` → `204`

### Panel del día (octava entrega)

`GET /dashboard?days=14` → `Dashboard`

```json
{
  "series": [{ "date": "2026-10-21", "branchId": "principal", "total": 312.4, "tickets": 41 }],
  "today": [{
    "branchId": "principal", "total": 72.8, "tickets": 6,
    "byMethod": { "efectivo": 40.3, "yape": 29, "tarjeta": 3.5 },
    "byHour": [0, 0, 0, 0, 0, 0, 0, 0, 22.5, 50.3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "topProducts": [{ "productId": 1, "units": 30, "total": 6 }]
  }]
}
```

- `series`: una fila por día **anterior a hoy** y local, del más antiguo al más reciente, **incluidos los días sin venta** (con 0) para que el gráfico no salte días. `date` en hora de Lima. `days` entre 1 y 60.
- `today`: venta desde las 00:00 de hoy (Lima). `byHour` tiene 24 posiciones (0 = 00:00–00:59). `topProducts` son los 8 de mayor importe, usando `items[].total` de las ventas.
- El administrador recibe todos los locales; el encargado, solo el suyo.
- Lo demás del panel (pendientes de vencimiento, stock, traslados, caja y asistencia) se arma en el front con los endpoints de cada módulo (`buildAlerts` en `src/lib/domain/dashboard.ts`).

### Catálogo e inventario

`GET /products` → `Product[]`. Catálogo compartido por los dos locales. `minStockByBranch` (opcional) es el mínimo propio de cada local, por ejemplo `{ "principal": 100, "sucursal": 50 }`; si un local no figura, vale `minStock`.

`GET /lots?branchId=principal` → `Lot[]`. Lotes con `qty > 0` del local, incluidos los vencidos (el front los muestra como "solo stock vencido"). Cada lote trae `receivedOn` (fecha de ingreso, `YYYY-MM-DD`) y `supplier` (razón social del proveedor); ambos pueden ser `null` en lotes antiguos.

`GET /stock/summary` → `{ branchId, productId, units }[]`. Stock vigente por local; lo ven todos los roles para poder sugerir traslados.

### Vencimientos (segunda entrega)

La pantalla calcula el riesgo en el front (`src/lib/domain/expiry.ts`, con pruebas) a partir de los lotes y del ritmo de venta. El backend solo entrega datos y aplica las acciones.

`GET /sales/velocity?days=30` → `ProductVelocity[]`

```json
[{ "branchId": "principal", "productId": 7, "units": 480, "days": 30 }]
```

Unidades vendidas (suma de `items[].units` de ventas no anuladas) por local y producto en los últimos `days` días. Devuelve **todos los locales** para cualquier rol, porque la pantalla sugiere trasladar un lote al local que más lo vende. Se pueden omitir los productos sin venta. `days` entre 1 y 365.

`PATCH /lots/discount` con `{ "branchId": "principal", "lotIds": [12, 15], "discount": 0.2 }` → `Lot[]` (los lotes actualizados)

- `discount` de 0 a 0.5 (`0` quita el descuento). Fuera de rango: `400 DATOS_INVALIDOS`.
- Todos los lotes deben ser de ese local, si no `404 LOTE_NO_EXISTE`. Encargado de otro local: `403 SIN_PERMISO`.
- El descuento lo aplica la venta (paso 3 de `POST /sales`), así que el punto de venta lo cobra de inmediato.

`POST /lots/:id/write-off` con `{ "type": "merma", "units": 12, "note": "Producto vencido retirado de anaquel" }` → `Lot` (actualizado)

- `type`: `merma` (baja por vencido, roto o deteriorado) o `devolucion` (canje o devolución al proveedor).
- `units` entero entre 1 y `lot.qty` (si es mayor: `409 STOCK_INSUFICIENTE`). `note` obligatorio, mínimo 3 caracteres.
- Descuenta `qty` del lote y guarda un movimiento de stock `{ branchId, productId, lotId, type, units, note, userId, at }`. Ese movimiento aparecerá en el kardex del módulo de Inventario.
- Permite lotes vencidos (es el caso principal).

### Inventario y kardex (tercera entrega)

El inventario valorizado se arma en el front con `GET /products` y `GET /lots` (`src/lib/domain/inventory.ts`, con pruebas). El backend agrega el catálogo editable y el kardex.

`POST /products` con `ProductInput` (un `Product` sin `id`) → `Product` (201)

`PUT /products/:id` con `ProductInput` → `Product`

- Solo `admin`; un encargado recibe `403 SIN_PERMISO`.
- Validación (la misma de `validateProduct` en el front): nombre, laboratorio y tipo obligatorios; `unitsPerBox ≥ 1`; si hay blíster, la caja trae blísteres completos; `priceUnit > 0`; precio de blíster o caja solo si la presentación tiene más de 1 unidad; costo con IGV menor que el precio unidad; código de barras de 8 a 14 dígitos. Error: `400 DATOS_INVALIDOS` con el primer problema en `message`.
- Código de barras repetido: `409 CODIGO_DUPLICADO`.
- No se borran productos con historial; para retirarlos de la venta llegará un campo `active` en Ajustes.

`GET /kardex?productId=7&days=30&branchId=principal` → `Kardex`

```json
{
  "productId": 7, "branchId": "principal",
  "from": "2026-09-27T10:00:00-05:00", "to": "2026-10-27T10:00:00-05:00",
  "closing": 680,
  "entries": [
    { "id": "s_91-0", "at": "2026-10-27T09:41:00-05:00", "branchId": "principal", "type": "venta", "reference": "Boleta B001-003121", "lotCode": "KD40921", "delta": -20, "userName": "Q.F. Daniel Rojas" },
    { "id": "m512", "at": "2026-10-24T09:30:00-05:00", "branchId": "principal", "type": "ingreso", "reference": "Compra a Droguería Los Andes S.A.C.", "lotCode": "KD40921", "delta": 300, "userName": "Q.F. Daniel Rojas" }
  ]
}
```

- `entries` del más reciente al más antiguo, en unidades. `delta` positivo si entra, negativo si sale.
- `type`: `ingreso`, `venta`, `merma`, `devolucion`, `ajuste`, `traslado_salida`, `traslado_ingreso`.
- `closing` es el stock actual del producto en el alcance pedido, **incluidos los lotes vencidos**. El front calcula el saldo de cada línea hacia atrás desde ese número (`kardexBalances`), así que `closing` y los movimientos tienen que cuadrar.
- Las ventas salen de `POST /sales` (una línea por ítem, con los lotes usados en `lotCode` separados por coma). Los ingresos, bajas y devoluciones salen de la tabla de movimientos.
- Sin `branchId`: todos los locales, solo `admin`. Un encargado debe mandar el suyo, si no `403 SIN_PERMISO`. `days` entre 1 y 365.

### Compras (cuarta entrega)

El pedido sugerido se calcula en el front (`suggestOrder` en `src/lib/domain/purchasing.ts`) con lotes, ritmo de venta y mínimos. La importación desde Excel se lee y valida en el front (`src/lib/excel/read-xlsx.ts`, `src/lib/domain/product-import.ts`) y usa `POST /products`, `PUT /products/:id` y `POST /purchases`; no necesita endpoint propio.

`GET /suppliers` → `Supplier[]` (todos los roles)

`POST /suppliers` y `PUT /suppliers/:id` con `SupplierInput` → `Supplier`. Solo `admin`. RUC de 11 dígitos que empieza en 10 o 20 y no repetido (`409 RUC_DUPLICADO`). Un proveedor no se borra: se marca `active: false`.

`GET /purchases?days=30&branchId=principal` → `Purchase[]`, del más reciente al más antiguo. Sin `branchId`, todos los locales (solo `admin`).

`POST /purchases` con `PurchaseRequest` → `Purchase` (201)

```json
{
  "branchId": "principal",
  "supplierId": 1,
  "document": "F001-00012345",
  "items": [{ "productId": 7, "lotCode": "AM55120", "expiresOn": "2028-09-30", "units": 200, "unitCost": 0.22 }]
}
```

En una transacción:

1. Valida que el usuario opere en ese local, que el proveedor exista y esté activo, y que `document` tenga serie y número (`F001-00012345`, `E001-123`; para stock inicial vale `INV-1`). Mismo documento del mismo proveedor: `409 DOCUMENTO_DUPLICADO`.
2. Por ítem: lote con letras, números, punto o guion (se guarda en mayúsculas); vencimiento posterior a hoy (`400 FECHA_VENCIDA`); `units` entero mayor a 0; `unitCost ≥ 0`, sin IGV. Lote repetido en el mismo ingreso: `400 DATOS_INVALIDOS`.
3. Si el lote ya existe en el local con el **mismo** vencimiento, se suman las unidades y el costo del lote queda promediado; con **otro** vencimiento, `409 LOTE_CONFLICTO`. Si no existe, se crea con `receivedOn` = hoy y `supplier` = razón social.
4. El costo del producto en el catálogo pasa a ser el de esta compra (si es mayor a 0).
5. Guarda un movimiento `ingreso` por ítem con `reference` = `Compra F001-00012345 · <proveedor>` para el kardex.
6. Devuelve la compra con `lotId` y `subtotal` por ítem, `subtotal`, `igv` (18 %) y `total`.

### Traslados (quinta entrega)

Estados: `solicitado` (pedido, sin mover stock) → `en_transito` (salió del origen) → `recibido`. Desde `solicitado` o `en_transito` se puede pasar a `anulado`. Las sugerencias se calculan en el front (`suggestTransfers` en `src/lib/domain/transfers.ts`) con `GET /stock/summary`, `GET /sales/velocity` y los lotes visibles.

`GET /transfers?days=30` → `Transfer[]`, del más reciente al más antiguo. Trae los creados en los últimos `days` días **y todos los que siguen en curso**, aunque sean más antiguos. El encargado solo ve los que salen o llegan a su local.

`POST /transfers` (envío directo) con `TransferSendRequest` → `Transfer` en `en_transito` (201)

```json
{ "fromBranchId": "principal", "toBranchId": "sucursal", "note": "Lo lleva el motorizado", "items": [{ "productId": 7, "units": 200 }, { "productId": 18, "units": 30, "lotId": 152 }] }
```

- Solo quien opera en el origen (`403 SIN_PERMISO`). Origen y destino distintos.
- Sin `lotId`, se reparte por **FEFO** entre lotes vigentes del origen; con `lotId`, sale de ese lote. Si no alcanza, `409 STOCK_INSUFICIENTE` y no se mueve nada.
- Descuenta los lotes del origen y guarda un movimiento `traslado_salida` por lote (`reference`: `Traslado T-0005 a Sucursal`). `items[]` trae `lotId`, `lotCode`, `expiresOn` y `unitCost` de cada lote.

`POST /transfers/requests` (pedido) con `TransferAskRequest` → `Transfer` en `solicitado` (201). Solo quien opera en el **destino**. Guarda `requested` y no mueve stock.

`POST /transfers/:id/dispatch` → `Transfer` en `en_transito`. Solo el origen. Reparte `requested` por FEFO **con lo que haya** (si falta, despacha menos); si no hay nada, `409 STOCK_INSUFICIENTE`. Registra las salidas como en el envío directo.

`POST /transfers/:id/receive` → `Transfer` en `recibido`. Solo el destino. Cada ítem entra al destino con el **mismo lote y vencimiento**: si el lote ya existe ahí con igual vencimiento se suma (costo promediado), si no se crea con `receivedOn` = hoy y el mismo proveedor. Mismo código con otro vencimiento: `409 LOTE_CONFLICTO`. Guarda `traslado_ingreso` por lote.

`POST /transfers/:id/cancel` con `{ "reason": "Cantidad equivocada" }` → `Transfer` en `anulado`. Un pedido lo anula el origen o el destino; un envío en camino, solo el origen. Si estaba en camino, las unidades vuelven a los lotes de origen con un movimiento `ajuste` (`Traslado T-0005 anulado: vuelve al stock`). Motivo obligatorio (mínimo 3 caracteres).

Código del traslado: `T-` y el id con 4 dígitos (`T-0012`). El administrador puede hacer todo en cualquier local.

### Clientes y recompras (novena entrega)

`Customer` ahora trae `treatments: [{ productId, everyDays }]` (medicamentos de uso continuo con su ciclo), `contactConsent` (aceptó recibir avisos), `notes` y `createdAt`. Reemplaza a `chronicProductIds`. Validación (la misma de `validateCustomer`): nombre de 3 letras o más; DNI de 8 dígitos y RUC válido, ambos sin repetir; para marcar `contactConsent` hace falta un celular peruano (9 dígitos que empiezan en 9); medicamentos sin repetir y ciclo de 1 a 365 días.

`GET /customers/all` → `CustomerSummary[]`: todos los clientes con `purchases`, `totalSpent` y `lastPurchaseAt`. Declárala antes de `/customers/:id`.

`PUT /customers/:id` con `CustomerInput` → `Customer`. Los puntos no se editan aquí: los suma la venta (1 por cada S/ 10).

`GET /customers/:id/purchases` → `CustomerPurchase[]`: las ventas con ese cliente, de la más reciente a la más antigua, máximo 50.

`GET /customers/refills` → `RefillInfo[]`: una fila por cliente y tratamiento, con la fecha de la última venta que incluyó ese producto (`lastPurchaseAt`, `null` si nunca), las unidades de esa compra y el último aviso registrado. El estado (atrasado, hoy, pronto, al día) lo calcula el front con `refillRows`.

`POST /customers/:id/contacts` con `{ "productId": 17, "channel": "whatsapp", "note": "" }` → `204`. Guarda que se avisó al cliente (fecha, canal y usuario) para no repetirlo en 5 días. Sin consentimiento: `403 SIN_CONSENTIMIENTO`.

El mensaje de WhatsApp lo arma el front (`refillMessage`) y lo abre con `wa.me` en el celular o la computadora del local: no hace falta la API de WhatsApp Business. El mensaje nombra el medicamento pero nunca la enfermedad.

### Caja (sexta entrega)

Un turno de caja por local: se abre con un fondo, acumula ventas y movimientos, y se cierra con un arqueo. Los cálculos están en `src/lib/domain/cash.ts`, en céntimos enteros para evitar errores de redondeo; el backend debe usar `DECIMAL` o céntimos, nunca `float`.

> Rutas: declara `GET /cash/closings` **antes** de `GET /cash/:branchId` para que `closings` no se tome como un local.

`GET /cash/:branchId/summary` → `CashSummary`

```json
{
  "session": { "branchId": "principal", "open": true, "openedAt": "2026-10-27T08:00:00-05:00", "openedBy": "Q.F. Daniel Rojas", "openingAmount": 150 },
  "sales": [{ "id": "s_91", "number": "B001-003141", "createdAt": "2026-10-27T10:42:00-05:00", "total": 18.5, "method": "efectivo", "sellerName": "Q.F. Daniel Rojas", "hasPrescription": false }],
  "totals": { "efectivo": 93.4, "yape": 29.4, "tarjeta": 3.5, "tickets": 20 },
  "movements": [{ "id": 1, "at": "2026-10-27T11:00:00-05:00", "type": "egreso", "amount": 12, "note": "Movilidad", "userName": "Q.F. Daniel Rojas" }],
  "expected": 231.4
}
```

- `sales`: ventas del local desde `openedAt`, de la más reciente a la más antigua.
- `expected` = fondo + ventas en efectivo + ingresos − egresos − retiros. El efectivo de la venta es su `total`, porque el vuelto ya se entregó.
- Con la caja cerrada: `session.open = false`, listas vacías y `expected = 0`.

`POST /cash/:branchId/movements` con `{ "type": "egreso", "amount": 7.5, "note": "Agua para el local" }` → `CashMovement` (201)

- `type`: `egreso` (pago menor), `retiro` (se saca efectivo para depósito o entrega) o `ingreso` (se agrega sencillo).
- Caja abierta (`400 CAJA_CERRADA`). Monto mayor a 0, con 2 decimales como máximo y hasta 10 000; motivo de al menos 3 caracteres.
- Un egreso o retiro no puede superar `expected`: `400 CAJA_SIN_EFECTIVO`.

`POST /cash/:branchId/close` con `CashCloseRequest` → `CashClosing` (201)

```json
{ "counted": 228.9, "denominations": { "100": 2, "20": 1, "5": 1, "2": 1, "0.5": 1, "0.2": 2 }, "note": "" }
```

- Si llegan `denominations`, el servidor recalcula `counted` con ellas.
- `difference = counted − expected` (negativo: faltante; positivo: sobrante). Con una diferencia de S/ 1 o más en valor absoluto, `note` es obligatoria (mínimo 5 caracteres); si falta, `400 DIFERENCIA_SIN_MOTIVO`.
- Guarda el cierre con totales por método, egresos, retiros, ingresos, arqueo y movimientos, y deja la caja cerrada. Desde ahí `POST /sales` responde `CAJA_CERRADA` hasta que se vuelva a abrir.

`GET /cash/closings?days=30&branchId=principal` → `CashClosing[]`, del más reciente al más antiguo. Sin `branchId`, todos los locales (solo `admin`).

### Asistencia (séptima entrega)

Cada trabajador marca en el equipo del local con su **PIN personal** (distinto del PIN de las cuentas). La marcación funciona **sin sesión**, desde la pantalla de ingreso o desde la barra superior, porque el primero en llegar abre el local antes de que el Q.F. inicie sesión. Los cálculos (estado del día, tardanza, horas, extra, puntualidad) están en `src/lib/domain/attendance.ts` con pruebas.

Reglas que usa el front:

- **Tardanza:** entrada más de `toleranceMinutes` después de la hora de ingreso.
- **Horas trabajadas:** suma de tramos entrada → salida menos refrigerios marcados. Si en una jornada de más de 5 horas no marcó refrigerio, se descuentan `breakMinutes`.
- **Horas extra:** trabajadas − (horario − `breakMinutes`), si pasa de `overtimeAfterMinutes`.
- **Estados:** en turno, en refrigerio, salió, aún no entra, no ha marcado, falta, sin marca de salida y descanso.
- **Orden de marcas:** entrada → (inicio y fin de refrigerio, una vez) → salida. Después de la salida se puede volver a entrar (turno partido).

**Públicos** (sin token; limita a 10 intentos por minuto por trabajador):

`GET /public/attendance/workers?branchId=principal` → `KioskWorker[]`: trabajadores **activos** del local con su horario y sus marcas de hoy (`today: [{ type, at }]`). Nunca el PIN.

`POST /public/attendance/clock` con `{ "workerId": "w2", "pin": "4102", "type": "entrada" }` → `AttendanceMark` (201)

- PIN incorrecto o trabajador inactivo: `401 PIN_INVALIDO`.
- La hora la pone el **servidor**, en hora de Lima. Si `type` no es la que toca según las marcas de hoy: `409 MARCA_FUERA_DE_ORDEN`, con lo que sí corresponde en el `message`.

**Solo `admin`** (un encargado recibe `403 SIN_PERMISO`):

`GET /attendance/workers` → `Worker[]` (activos e inactivos, sin PIN)

`POST /attendance/workers` y `PUT /attendance/workers/:id` con `WorkerInput` → `Worker`. Nombre de al menos 3 letras y no repetido, cargo, local válido, horario `HH:MM` con la salida después de la entrada y al menos un día. PIN de 4 dígitos, obligatorio al crear; al editar, vacío = no cambia. Guárdalo con hash. No se borran trabajadores: se desactivan.

`GET /attendance/marks?from=2026-09-28&to=2026-10-27&branchId=principal` → `AttendanceMark[]`. Fechas locales, ambas incluidas, máximo un año. Sin `branchId`, todos los locales.

`POST /attendance/marks/manual` con `{ "workerId": "w3", "type": "salida", "at": "2026-10-24T22:05:00-05:00", "note": "Olvidó marcar; confirmado por cámaras" }` → `AttendanceMark` con `manual: true` y `registeredBy` = el administrador. No puede ser en el futuro ni de hace más de 60 días; motivo de al menos 5 caracteres. Las marcas no se editan ni se borran: se corrigen agregando otra.

### Clientes

`GET /customers?q=texto` → `Customer[]` (máximo 8, busca por nombre, DNI o RUC)

`POST /customers` con `{ name, dni?, ruc?, phone?, contactConsent? }` → `Customer`

El resto de clientes está en la sección **Clientes y recompras**, más abajo.

### Caja

`GET /cash/:branchId` → `CashSession` (`{ branchId, open, openedAt, openedBy, openingAmount }`)

`POST /cash/:branchId/open` con `{ "amount": 150 }` → `CashSession`. Fondo entre 0 y 5000. Si ya está abierta: `409 CAJA_ABIERTA`.

El resto de la caja está en la sección **Caja**, más abajo.

### Ventas

`POST /sales` con `SaleRequest` → `Sale` (201)

```json
{
  "branchId": "principal",
  "items": [
    { "productId": 1, "presentation": "blister", "qty": 2 },
    { "productId": 7, "presentation": "unidad", "qty": 3 }
  ],
  "payment": { "method": "efectivo", "received": 20 },
  "document": { "type": "boleta", "customerDocId": "40125588", "customerName": "Rosa Huamán" },
  "customerId": 1,
  "prescription": { "number": "R-55821", "doctor": "Dra. Lucía Fernández", "cmp": "45123" }
}
```

Lo que el backend hace al registrar la venta, en una transacción:

1. Valida que la caja del local esté abierta y que el usuario pueda operar en ese local.
2. Por cada ítem calcula `units = qty × unidades de la presentación` y reparte por **FEFO**: lotes del local con stock, no vencidos, del que vence primero al último. Si no alcanzan, `409 STOCK_INSUFICIENTE`.
3. Aplica el descuento de cada lote (`lot.discount`) ponderado por unidades.
4. Exige receta si algún producto no es `libre`. Los controlados los dispensa un químico farmacéutico (las cuentas de local lo son).
5. Valida el comprobante: boleta con DNI de 8 dígitos (obligatorio desde S/ 700); factura con RUC de 11 dígitos que empiece en 10 o 20 y razón social.
6. Asigna el correlativo de la serie del local (`B001-000123`, `F002-000045`), descuenta los lotes, suma puntos al cliente (1 punto por cada S/ 10) y envía el comprobante al proveedor de facturación electrónica.
7. Devuelve la venta con los lotes usados en cada línea (`items[].lots`).

Las reglas de los pasos 2, 3 y 5 están en `src/lib/domain/pharmacy.ts` con pruebas en `pharmacy.test.ts`. Conviene que el backend use los mismos casos de prueba.

### Reportes

La pantalla es del administrador. El endpoint acepta también a una cuenta de local, pero solo para su propio local (otro `branchId` → `403 SIN_PERMISO`; sin `branchId` → su local).

`GET /reports/sales?from=2026-10-01&to=2026-10-27&branchId=principal` → `SalesReportLine[]`. Una fila por línea de venta del periodo, fechas locales (America/Lima) y ambas incluidas, máximo 370 días (`400 DATOS_INVALIDOS`). Sin `branchId`, todos los locales.

```json
{
  "saleId": "s-1042", "number": "B001-000123", "at": "2026-10-26T10:15:00-05:00",
  "branchId": "principal", "sellerName": "Principal", "method": "efectivo", "documentType": "boleta",
  "customerId": 1, "productId": 7, "presentationLabel": "Blíster", "qty": 2, "units": 20,
  "total": 9.6, "cost": 3.8, "discount": 0,
  "prescription": { "number": "R-55821", "doctor": "Dra. Lucía Fernández", "cmp": "45123" }
}
```

- `total` es lo cobrado por la línea, con IGV y después del descuento. `cost` es el costo sin IGV de los lotes que salieron (FEFO), no el costo de lista.
- `discount` es el descuento promedio aplicado (0..1). `prescription` va en todas las líneas de una venta con receta; el front arma el libro de recetas solo con los productos que la requieren.
- Las anuladas no se incluyen.

El front calcula todo lo demás con `src/lib/domain/reports.ts` (pruebas en `reports.test.ts`): venta sin IGV = total / 1,18; utilidad = venta sin IGV − costo; margen = utilidad / venta sin IGV; agrupación por producto, laboratorio, tipo, local, vendedor y pago; venta por día; productos con stock sin venta en el periodo (usa `GET /lots`); libro de recetas; comparación con el periodo anterior de la misma duración. Si el volumen crece, el backend puede ofrecer después los mismos cortes ya agrupados sin cambiar la pantalla.

### Ajustes

Todo es solo para el administrador (`403 SIN_PERMISO`). Los datos de la botica, los locales y las reglas se leen con `GET /public/config`; el front actualiza esa configuración al guardar, y los demás equipos la ven al volver a leerla (cada 10 minutos o al recargar). Las validaciones están en `src/lib/domain/settings.ts` (pruebas en `settings.test.ts`).

`PUT /settings/pharmacy` con `Pharmacy` → `Pharmacy`. Nombre de 3 a 40 caracteres, lema hasta 60, RUC de 11 dígitos que empiece en 10 o 20, colores `#RRGGBB` (se guardan en mayúsculas). El color principal debe tener contraste de al menos 4,5 con texto blanco (fórmula WCAG), porque va de fondo en botones y barra lateral.

**Locales.** `GET /public/config` trae `branches` (solo activos: donde se vende, se traslada y se elige), `closedBranches` (desactivados, solo para nombrarlos en el historial) y `plan`: `{ "name": "Plan Crece", "maxBranches": 3 }`, que define Digi!HME según lo contratado. Cada `Branch` lleva `active`.

`POST /settings/branches` con `BranchCreateInput` → `{ branch, account }` (201):

```json
{ "name": "Sucursal Amarilis", "address": "Jr. Huallayco 120", "series": "003", "account": { "name": "Q.F. Ana Paz", "pin": "4826" } }
```

- `409 LIMITE_DEL_PLAN` si ya hay `maxBranches` locales activos.
- El backend genera el `id` a partir del nombre (`sucursal-amarilis`; si existe, `-2`, `-3`…) y lo deja fijo aunque el nombre cambie después.
- Mismas reglas de nombre, dirección y serie que al editar (la serie no puede repetir la de ningún local, tampoco de uno desactivado).
- `account` es opcional (`null` = no se crea): cuenta de local para ese local, con las reglas de cuentas de abajo.
- El local nace sin stock, con la caja cerrada y numeración desde 1. Su stock mínimo por producto es el general (`minStock`) hasta que se ajuste.

`POST /settings/branches/:id/deactivate` con `{ "reason": "Cierre del local" }` → `Branch` con `active: false`.

- `409 LOCAL_NO_SE_PUEDE_CERRAR` (con todas las razones en el mensaje) si es el único activo, si le queda stock (vigente o vencido), si su caja está abierta o si tiene traslados `solicitado` o `en_transito`.
- Desactiva también sus cuentas de local y sus trabajadores, y cierra sus sesiones.
- No borra nada: ventas, cierres, kardex y marcas siguen en los reportes. Ninguna operación acepta un local desactivado (`409 LOCAL_INACTIVO`): ventas, caja, compras, traslados, marcación, cuentas y trabajadores nuevos.

`POST /settings/branches/:id/activate` → `Branch` con `active: true`. `409 LIMITE_DEL_PLAN` si no hay cupo. Sus cuentas y trabajadores siguen desactivados hasta que el administrador los reactive.

`PUT /settings/branches/:id` con `{ "name": "Sucursal", "address": "Av. Canto Grande 3150", "series": "002" }` → `Branch`. Nombre de 3 a 24 caracteres y no repetido, dirección, serie de 3 dígitos (001 a 999) que no use otro local. Al cambiar la serie, la numeración continúa desde el último comprobante emitido en esa serie por ese local (desde 1 si es nueva). La serie debe estar autorizada en SUNAT y en el proveedor de facturación; el backend puede rechazarla con `409 SERIE_NO_AUTORIZADA`. 

`GET /settings/series` → `BranchSeries[]` (activos y desactivados): `{ branchId, series, lastBoleta, lastFactura }`, el último correlativo emitido en la serie actual (la pantalla muestra el siguiente).

`PUT /settings/rules` con `{ expiry, purchasing, attendance }` → lo mismo. Rangos (enteros): `expiry.red` 7–180, `expiry.yellow` 15–365 y mayor que `red`, `purchasing.coverDays` 3–90, `purchasing.minShelfDays` 0–730, `attendance.toleranceMinutes` 0–30, `attendance.breakMinutes` 0–120, `attendance.overtimeAfterMinutes` 0–120.

`GET /settings/accounts` → `StaffAccount[]` (`{ id, name, role, branchId, active }`, sin PIN; incluye las desactivadas).

`POST /settings/accounts` y `PUT /settings/accounts/:id` con `AccountInput` → `StaffAccount`:

```json
{ "name": "Q.F. Ana Paz", "role": "encargado", "branchId": "sucursal", "pin": "4826", "active": true }
```

- Nombre de al menos 3 letras y no repetido. `branchId` obligatorio para `encargado`; para `admin` se guarda `null`.
- PIN de 4 dígitos, obligatorio al crear; al editar, vacío = no cambia. No se aceptan PIN repetidos (`7777`) ni seguidos (`1234`, `6543`). Guárdalo con hash.
- `409 CUENTA_PROTEGIDA` si el cambio dejaría sin administrador activo, o si el administrador intenta desactivarse o quitarse el rol a sí mismo.
- Al cambiar el PIN, el rol o el local de otra cuenta, o al desactivarla, se invalidan sus sesiones abiertas.
- Las cuentas desactivadas no salen en `GET /auth/staff` y no pueden ingresar. No se borran.

## Próximas entregas

Todos los módulos del front están definidos. Los cambios al contrato se agregan a este documento antes de construir la pantalla.
