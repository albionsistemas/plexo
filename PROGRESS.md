# PLEXO — Estado del proyecto

Última actualización: 2026-07-21. Repo: `github.com/albionsistemas/plexo`, rama `main`.

## Resumen ejecutivo

Los 9 módulos de negocio del brief original están construidos y commiteados. Hoy, por primera vez, se corrió todo contra una base de datos real (hasta ahora solo compilaba/testeaba con mocks) — se encontró y arregló un bug real, y se confirmó que el aislamiento por tenant (RLS) funciona de verdad, no solo en el papel.

## Módulos completos (orden de commits en `main`)

| Commit | Qué es |
|---|---|
| `af5726c` | Scaffold del monorepo Nx (api NestJS+Fastify, web Next.js, Prisma+RLS) |
| `330d664` | Contexto de tenant (transacción por request) + guards RBAC |
| `8de24c5` | Login, JWT, `JwtAuthGuard` |
| `accae3c` | Logo/branding |
| `a205e83` | **Inventario** — artículos/variantes, stock por depósito, auditoría vía triggers |
| `afbc443` | **Facturación** — multi-moneda, descuentos, notas de crédito, bloqueo fiscal tras CAE |
| `0861c95` | **Cuentas a Cobrar** — antigüedad de saldos, deuda por cliente |
| `f81a305` | **Contabilidad** — partida doble, balance de sumas y saldos, asientos inmutables |
| `2ce6502` | **Impuestos** — tasas versionadas, delegables al contador |
| `ce29eee` | **Reportes** (Resultados, Ventas, Financiero) |
| `7c0c952` | Fix: `DatabaseModule` necesitaba ser `@Global()` — encontrado recién al levantar contra una base real |

## Decisiones de arquitectura (para no repetir el porqué después)

- **RLS multitenancy**: cada tabla tiene `tenantId`; las políticas filtran por `current_setting('app.tenant_id')`. **Falla cerrado** — probado hoy: sin `tenant_id` seteado, o con el de otro tenant, no se ve nada.
- **Auditoría + bloqueos fiscales**: triggers de Postgres, no middleware de la app (así no se puede esquivar desde ningún cliente/conexión).
- **Entre módulos**: nunca se importa el `Service` de otro módulo. O se consulta la tabla directo vía `getTenantDb()` (RLS igual protege), o se compone a nivel `apps/api` (ver `SalesService`, que junta Facturación+Inventario).
- **`ModuleAccessGuard` + `UserModuleAccess`**: permisos granulares por módulo, pensado específicamente para el contador externo.

## Setup local de ESTA máquina (Windows, sin Docker)

Docker Desktop no corre en este Windows (build 18362, muy vieja para WSL2). Se instaló PostgreSQL nativo en su lugar:

- Quedaron **dos instancias** instaladas sin querer: PostgreSQL 18 en el puerto 5432 (instalada a mano, usuario `postgres`/`postgres`, sin usar), y PostgreSQL 16 en el puerto **5433** (instalada por mí vía winget — **esta es la que usamos**).
- `.env` (gitignored, no viaja con git) ya apunta al puerto 5433.
- Rol `plexo_app` creado a mano corriendo `docker/postgres-init/01-init-roles.sql`.
- Base `plexo` creada, las 7 migraciones aplicadas, seed corrido.
- Login de prueba: `tenantId=79dcca57-3830-4f17-af13-c000c0c0d0df`, `owner@demo.plexo` / `changeme123`.

**Si retomás en otra computadora**: si tiene Docker andando, usar el `docker-compose.yml` normal del repo. Si no, repetir el proceso de Postgres nativo (instalar, crear base `plexo`, correr `docker/postgres-init/01-init-roles.sql`, `npx prisma migrate deploy`, seed) y ajustar tu propio `.env` — no se sincroniza entre máquinas.

## Módulos / features completos (actualización 2026-07-20/21)

| Commit | Qué es |
|---|---|
| `b4ab08e` | **Tablero en tiempo real** — login, dashboard con KPIs, stock por depósito, últimas facturas, gráfico de ventas 7 días, alertas de stock bajo mínimo. WebSockets socket.io (port 3001) con salas por tenant. TanStack Query + recharts en frontend. |
| `de65fc3` | Fix: CORS habilitado para `localhost:4200` en la API Fastify |
| `67a0ed9` | Fix: login guardaba `res.data.access_token` (no existe) en vez de `res.data.accessToken` — el token quedaba como string `"undefined"` y todo el dashboard fallaba con 401. Encontrado al probar el tablero por primera vez contra una base real. |
| `f3334ec` | **Frontend — pantalla de Inventario** (`apps/web/src/app/inventory`): tabla de artículos/variantes con buscador en tiempo real (client-side) y filtro por categoría, stock consolidado por depósito (columnas dinámicas según los depósitos que existan), modal para registrar movimientos de stock (atómico, vía el endpoint ya existente `POST /inventory/movements`). Se extrajo `AppShell` (`apps/web/src/components/AppShell.tsx`) como layout compartido con nav — el Tablero ahora lo usa también. Backend: se agregó `GET /inventory/categories` (no existía) y se enriqueció `GET /inventory/articles` para traer categoría + stock por depósito por variante (antes no traía nada de stock). |
| (este commit) | **Auto-posteo contable** (lo más crítico del roadmap): `AccountingService.postInvoiceJournalEntry()` (`libs/modules/accounting`) resuelve (o crea, si no existen) 3 cuentas del sistema por código fijo — `1.1.02` Deudores por Ventas (ASSET), `4.1.01` Ventas (INCOME), `2.1.03` IVA Débito Fiscal (LIABILITY) — y postea el asiento estándar: débito AR por el total, crédito Ventas por el subtotal, crédito IVA por el impuesto (omitida si no hay impuesto). Siempre balanceado por construcción (`total = subtotal + taxTotal`); se salta el posteo entero si el total es cero. `SalesService` (`apps/api/src/app/sales`) ahora inyecta también `AccountingService` y llama a esto justo después de crear la factura — mismo patrón que ya usaba para componer Facturación+Inventario, mismo `getTenantDb()` compartido, así que es atómico gratis (si el asiento no balancea o inventario falla, se revierte todo junto). Probado end-to-end: `getIncomeStatement` (que antes daba vacío siempre) ahora refleja ventas reales, con y sin IVA. |

**Nota sobre Tremor**: el brief pedía Tremor para estos componentes, pero `@tremor/react` tiene como peer dependency `react@^18` y el proyecto está en React 19 — instalarlo rompía peer deps. Se construyó con Tailwind puro, seteando el mismo estilo (dark, slate/indigo) que ya usa el Tablero.

**Datos de demo**: el seed (`libs/shared/database/prisma/seed.ts`) solo crea tenant + usuario, nada de inventario/moneda/clientes. Para poder probar la pantalla de Inventario y el auto-posteo se cargaron a mano vía API (no vía script versionado) depósitos, categorías, artículos con y sin impuesto, una moneda base y un cliente, sólo en la base local de esta máquina — no persiste en git ni afecta otras máquinas.

**Alcance de esta iteración del auto-posteo — lo que falta**:
- Sólo cubre la emisión de **Facturas** (vía `POST /api/sales/invoices`, el único endpoint que hoy crea invoices). Las **notas de crédito** (`POST /api/invoicing/credit-notes`) todavía NO revierten el asiento — un comprobante acreditado sigue reconocido como ingreso en el estado de resultados. Es un hueco real, documentado a propósito en vez de resuelto apurado: requiere decidir si se compone en `apps/api` igual que ventas (nuevo endpoint `POST /api/sales/credit-notes` que junte `InvoicingService.createCreditNote` + una reversión contable) o si se deja como está. Recomendado como siguiente paso si se sigue por acá.
- Las cuentas del plan (`1.1.02`, `4.1.01`, `2.1.03`) son códigos por convención, no configurables desde ningún lado todavía — si un tenant ya tenía cuentas propias con esos códigos, se reusan; si no, se crean automáticamente la primera vez.
- No hay costo de mercadería (COGS) — `getIncomeStatement` sigue sin gastos del lado de ventas, sólo ingresos.

**Bugs preexistentes encontrados (no arreglados, fuera de alcance, confirmados con `git stash` que ya fallaban en `main` antes de este trabajo)**:
- `inventory.service.spec.ts`: 2 tests rotos (`recordMovement` — el mock no incluye `stockLedger.findUnique`).
- `invoicing.service.spec.ts`: 1 test roto (`createInvoice` — el mock no inyecta `EventEmitter2`).

## Pendiente / próximos pasos

1. Proveedor de email real (hoy: stub que solo loguea en consola, ya con un `EmailSender` port/adapter armado en `libs/modules/invoicing` — sólo falta la implementación real Resend/SMTP). Facturación y Cuentas a Cobrar deberían poder enviar comprobantes/alertas de vencimiento por este medio.
2. Notas de crédito no revierten el asiento contable todavía (ver nota arriba) — el hueco más importante que deja esta iteración.
3. Cron jobs reales (NestJS `@nestjs/schedule` o similar) — `refreshOverdueStatuses` de Cuentas a Cobrar es manual por ahora.
4. Integración AFIP real (hoy: CAE falso, `StubElectronicInvoicingService`).
5. Frontend: siguen faltando las pantallas de Facturación, Cuentas a Cobrar, Contabilidad, Impuestos y Reportes — Inventario fue la primera. Corregir además el mojibake pre-existente en nombres con tildes (p. ej. "Dep�sito Central") — es un problema de encoding en los datos ya sembrados, no del código.
6. Arreglar los 3 tests preexistentes rotos (ver nota arriba).

## Para retomar

```bash
cd erp_plexo
git pull
npm install
npx prisma generate
# Postgres: en esta máquina ya está configurado (ver arriba). En otra, levantar según corresponda.
npx nx serve api            # http://localhost:3000/api  (WebSocket en :3001)
cd apps/web && npx next dev -p 4200   # http://localhost:4200
```

Login de prueba (esta PC): `tenantId=79dcca57-3830-4f17-af13-c000c0c0d0df`, `owner@demo.plexo` / `changeme123`. (El `tenantId=f307123c-...` anotado antes acá corresponde al seed de la otra máquina donde se hizo el tablero — cada máquina tiene su propia base local, el tenantId no viaja con git.)
