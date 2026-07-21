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
| (este commit) | **Frontend — pantalla de Inventario** (`apps/web/src/app/inventory`): tabla de artículos/variantes con buscador en tiempo real (client-side) y filtro por categoría, stock consolidado por depósito (columnas dinámicas según los depósitos que existan), modal para registrar movimientos de stock (atómico, vía el endpoint ya existente `POST /inventory/movements`). Se extrajo `AppShell` (`apps/web/src/components/AppShell.tsx`) como layout compartido con nav — el Tablero ahora lo usa también. Backend: se agregó `GET /inventory/categories` (no existía) y se enriqueció `GET /inventory/articles` para traer categoría + stock por depósito por variante (antes no traía nada de stock). |

**Nota sobre Tremor**: el brief pedía Tremor para estos componentes, pero `@tremor/react` tiene como peer dependency `react@^18` y el proyecto está en React 19 — instalarlo rompía peer deps. Se construyó con Tailwind puro, seteando el mismo estilo (dark, slate/indigo) que ya usa el Tablero.

**Datos de demo**: el seed (`libs/shared/database/prisma/seed.ts`) solo crea tenant + usuario, nada de inventario. Para poder probar la pantalla se cargaron a mano vía API (no vía script versionado) 2 depósitos, 2 categorías, 3 artículos con 4 variantes y stock inicial, sólo en la base local de esta máquina — no persiste en git ni afecta otras máquinas.

**Bug preexistente encontrado (no arreglado, fuera de alcance)**: `inventory.service.spec.ts` tiene 2 tests que ya fallaban en `main` antes de este trabajo (`recordMovement` — el mock de test no incluye `stockLedger.findUnique`, que el código sí llama al final para el evento `stock.updated`). Confirmado con `git stash` que falla igual sin estos cambios.

## Pendiente / próximos pasos

1. Proveedor de email real (hoy: stub que solo loguea en consola). Facturación y Cuentas a Cobrar deberían poder enviar comprobantes/alertas de vencimiento por este medio.
2. **Auto-posteo contable (crítico)**: cada emisión de comprobante fiscal debería generar el asiento contable correspondiente, atómico, en la misma transacción de Prisma. Sin esto, Reportes de Resultados (`getIncomeStatement`) da vacío — `getRevenueSummary` es el respaldo que sí funciona hoy.
3. Cron jobs reales (NestJS `@nestjs/schedule` o similar) — `refreshOverdueStatuses` de Cuentas a Cobrar es manual por ahora.
4. Integración AFIP real (hoy: CAE falso, `StubElectronicInvoicingService`).
5. Frontend: siguen faltando las pantallas de Facturación, Cuentas a Cobrar, Contabilidad, Impuestos y Reportes — Inventario fue la primera (ver arriba). Corregir además el mojibake pre-existente en nombres con tildes (p. ej. "Dep�sito Central") — es un problema de encoding en los datos ya sembrados, no del código.
6. Arreglar los 2 tests preexistentes rotos en `inventory.service.spec.ts` (ver nota arriba).

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
