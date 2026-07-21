# PLEXO — Estado del proyecto

Última actualización: 2026-07-20. Repo: `github.com/albionsistemas/plexo`, rama `main`.

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

## Módulos / features completos (actualización 2026-07-20)

| Commit | Qué es |
|---|---|
| (pendiente commit) | **Tablero en tiempo real** — login, dashboard con KPIs, stock por depósito, últimas facturas, gráfico de ventas 7 días, alertas de stock bajo mínimo. WebSockets socket.io (port 3001) con salas por tenant. TanStack Query + recharts en frontend. |

## Pendiente / próximos pasos

1. Proveedor de email real (hoy: stub que solo loguea en consola).
2. Integración AFIP real (hoy: CAE falso, `StubElectronicInvoicingService`).
3. Auto-posteo de asientos contables desde Facturación — sin esto, Reportes de Resultados (`getIncomeStatement`) da vacío. `getRevenueSummary` es el respaldo que sí funciona hoy.
4. Scheduler/cron real — `refreshOverdueStatuses` de Cuentas a Cobrar es manual por ahora.
5. Frontend: las pantallas de negocio (inventario, facturación, cuentas a cobrar, etc.) — solo existe el tablero hoy.

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

Login de prueba (esta PC, nuevo seed): `tenantId=f307123c-4bcd-438e-a580-0b4b92e4e293`, `owner@demo.plexo` / `changeme123`
