# Digi!HME · front del sistema para boticas

Instrucciones para Claude Code. Léelas antes de cambiar algo.

## Qué es

Front de producción de **Digi!HME**, un SaaS para boticas y farmacias del Perú. El primer cliente es Botica Huánuco (sus datos son los de prueba). El backend lo hace otra persona en Node (Nest/Express); este repositorio es solo el front.

Stack: Next.js 15 (App Router) · React 19 · TypeScript estricto (`noUncheckedIndexedAccess`) · Tailwind CSS 4 · TanStack Query 5 · Zustand · lucide-react · Vitest.

## Comandos

```bash
npm run dev        # http://localhost:3000, modo de prueba sin backend
npm test           # Vitest (reglas de negocio)
npm run typecheck  # tsc --noEmit
npm run build
```

Antes de dar algo por terminado: `npm run typecheck` sin errores y `npm test` en verde.

Modo de la API: `NEXT_PUBLIC_API_MODE=mock` (por defecto, datos en el navegador) o `http` con `NEXT_PUBLIC_API_URL`.
PIN de prueba: admin 1234 · principal 1111 · sucursal 2222 · marcación 4101–4104 y 4201–4203.

## Estructura

- `src/app/(app)/<modulo>/page.tsx`: una ruta por módulo, solo monta la pantalla.
- `src/features/<modulo>/`: pantalla, diálogos y `export.ts` (Excel) de cada módulo.
- `src/lib/api/types.ts`: tipos compartidos con el backend.
- `src/lib/api/contract.ts`: interfaz `ApiClient`; las pantallas solo conocen esto.
- `src/lib/api/http.ts`: implementación contra el backend real.
- `src/lib/api/mock/client.ts`: backend simulado en `localStorage` (`bh.mock.v1`).
- `src/lib/domain/*.ts`: reglas de negocio puras, cada una con su `.test.ts`.
- `src/lib/queries.ts`: hooks de TanStack Query; las mutaciones invalidan lo que cambian.
- `src/features/shared/branch-scope.tsx`: alcance por local (`useBranchScope`, `ScopeToggle`, `useBranchLots`).
- `src/lib/excel/`: generador y lector `.xlsx` propios, sin dependencias.
- `src/components/charts/column-chart.tsx`: gráfico propio; colores en `src/lib/chart-colors.ts`.
- `docs/API.md`: contrato con el backend. Es la fuente de verdad.

## Cómo se agrega o cambia una función

1. **Contrato primero.** Actualiza `docs/API.md`, luego `types.ts`, `contract.ts` y `http.ts`.
2. **Mock.** Impleméntalo en `mock/client.ts` con las mismas validaciones y códigos de error (`fail(code, message, status)`). Si cambia la forma de los datos, sube `VERSION` para que se regeneren.
3. **Reglas puras.** Van en `src/lib/domain/` con pruebas. El backend debería usar los mismos casos.
4. **Pantalla.** Va en `src/features/`, con un hook en `queries.ts`, y la ruta en `app/(app)/`. El menú está en `src/lib/nav.ts`.
5. **Docs.** Avance y estructura en `README.md`, endpoints en `docs/API.md`.

## Reglas del negocio que no se rompen

- **Dinero:**
  - Soles con 2 decimales y `round2`.
  - Precios con IGV (18 %), costos sin IGV.
  - Margen = (precio sin IGV − costo) / precio sin IGV.
- **Stock:** por lote y por local; sale por **FEFO** (vence primero, sale primero). Nunca se edita el stock a mano: todo movimiento queda en el kardex.
- **Locales:** cantidad variable según el plan (`plan.maxBranches`). No asumas "principal" y "sucursal" ni que son dos.
  - Activos en `config.branches`; desactivados en `config.closedBranches`, solo para el historial.
  - Para nombrar locales en historiales y Excel usa `allBranches` de `useBranchScope`.
- **Roles:**
  - `admin`, con `branchId` null: ve todos los locales.
  - `encargado`: cuenta de local, solo opera en el suyo.
  - Los permisos (`user.permissions`) los define el backend.
- **Perú:**
  - Boleta con DNI de 8 dígitos, obligatorio desde S/ 700; factura con RUC de 11 dígitos que empiece en 10 o 20.
  - Receta y libro de recetas (DIGEMID).
  - Consentimiento para contactar clientes (Ley 29733).
- **Fechas:** días locales `YYYY-MM-DD` (America/Lima); instantes en ISO.

## Estilo

- Todo el texto de la interfaz va en español del Perú, claro y sin tecnicismos: "Cobrar", "Caja cerrada", "Pedir traslado".
- **Dos marcas:**
  - Digi!HME es la plataforma: logo en `public/brand/`, componentes `DigiHmeIcon`, `DigiHmeLogo`, `DigiHmeName` y `DigiSeal` en `src/components/brand-mark.tsx`. El logo completo tiene letras oscuras: solo va sobre fondo claro.
  - La botica pone su nombre y colores desde Ajustes. Llegan por `--brand` y `--accent` (`bg-brand`, `text-accent`). No escribas el nombre de una botica en el código.
- Componentes base en `src/components/ui/`: `Button`, `Field`/`Input`/`Select`, `Dialog`, `Segmented`, `Table`/`td`, `Empty`, `notify()`.
- Gráficos: máximo 4 series de color. Con más locales, `foldBranches` muestra el total. El texto nunca va en el color de la serie.
- No agregues dependencias si se puede resolver con lo que hay. El Excel y los gráficos son propios a propósito.

## Pendiente (hoja de ruta SaaS)

Ver el avance completo en `README.md`. Lo siguiente, en orden:

1. Varias boticas en una instalación (subdominio o código de botica) e ingreso del dueño con correo y contraseña. El PIN se queda para el mostrador.
2. Plan y facturación en Ajustes, estados de cuenta (prueba, vencida, suspendida en solo lectura) y módulos según el plan.
3. Registro y configuración inicial guiados.
4. Comprobantes con SUNAT: estado, reenvío, anulación y nota de crédito, impresión en ticketera de 80 mm.
5. POS sin internet (PWA con cola de ventas).
6. Auditoría, consola interna de Digi!HME, monitoreo (Sentry) y paginación en el servidor.

Detalles menores: copiar los stock mínimos de otro local al crear uno, sugerir en el POS lo que el cliente "suele llevar", quitar la ruta `[module]`.
