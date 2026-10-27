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

## Roles y locales

| Rol | `branchId` | Puede |
| --- | --- | --- |
| `admin` | `null` | Ver y operar en todos los locales |
| `encargado` | su local | Solo leer y escribir datos de su local |

El backend valida el local en cada endpoint que recibe `branchId`; el front también lo oculta, pero la regla de verdad está en el servidor. `user.permissions` lista los módulos que la cuenta ve (ids de `src/lib/nav.ts`).

## Endpoints de esta primera entrega

### Públicos (sin token)

`GET /public/config` → `{ pharmacy: Pharmacy, branches: Branch[], expiry: { red: 30, yellow: 90 } }`. `expiry` son los días del semáforo de vencimientos (crítico hasta `red`, por vencer hasta `yellow`); se editarán en Ajustes.

`GET /auth/staff` → `StaffSummary[]`. Solo nombre, rol y local, nunca el PIN.

`POST /auth/login` con `{ "userId": "u2", "pin": "1111" }` → `Session` (`{ token, user, expiresAt }`). Recomendado: bloquear 5 minutos tras 5 intentos fallidos por usuario.

### Sesión

`GET /auth/me` → `User`

`POST /auth/logout` → `204`

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

### Clientes

`GET /customers?q=texto` → `Customer[]` (máximo 8, busca por nombre, DNI o RUC)

`POST /customers` con `{ name, dni?, ruc?, phone? }` → `Customer`

### Caja

`GET /cash/:branchId` → `CashSession`

`POST /cash/:branchId/open` con `{ "amount": 150 }` → `CashSession`

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

## Próximas entregas

Traslados entre locales, compras, clientes y recompras, cierre de caja, asistencia del personal, reportes y exportación a Excel. Cada módulo agrega sus endpoints a este documento antes de construir la pantalla.
