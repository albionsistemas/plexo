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
- **Venta sin factura ("asiento manual por ahora")**: `POST /inventory/movements` permite un `SALE_OUT` sin `invoiceId` — stock que sale sin pasar por Facturación (venta informal, ajuste que hace de venta, etc.). Esto NO dispara el auto-posteo contable a propósito: Inventario solo conoce cantidades, nunca precio/moneda, así que no hay con qué generar un asiento correcto ahí. Decisión (2026-07-21): por ahora esos casos requieren que alguien postee el asiento a mano vía `POST /accounting/journal-entries` (ya existe). Si esto resulta ser un flujo frecuente, la alternativa es forzar que toda venta pase por `SalesService`/Facturación (con un "ticket interno" sin CAE real) para tener una sola fuente de verdad — pero eso le agrega fricción a la venta informal, por eso no se hizo todavía.
- **Enumerar tenants para trabajos de sistema (crons)**: nada en la app (rol `plexo_app`) podía listar `tenants` — tiene RLS forzado igual que todo lo demás, y hasta ahora nada lo necesitaba (login siempre recibe el tenantId del formulario). El primer cron (recordatorios de Cuentas a Cobrar) sí necesita recorrer "todos los tenants". Decisión (con el usuario, 2026-07-21): función Postgres `list_tenant_ids()` `SECURITY DEFINER` (migración `20260726000000_list_tenant_ids_function`), dueña del rol admin/migración, con `GRANT EXECUTE` a `plexo_app` — el mismo patrón que `audit_log_capture()` ya usaba. Sólo expone "listar ids", nada más; `plexo_app` sigue sin poder leer `tenants` directo (verificado con psql). Cualquier cron futuro que necesite recorrer tenants reusa esta misma función.
- **Avatar de usuario = solo URL** (decisión con el usuario, 2026-07-21): no hay ninguna infraestructura de almacenamiento de archivos en el proyecto. En vez de sumar upload real (S3/disco), el perfil solo guarda una URL (`User.avatarUrl`); sin ella, el frontend genera un avatar con las iniciales del nombre/email. Revisar esta decisión si en algún momento se necesita upload real.
- **`UserActivityLog` vs `AuditLog`**: son cosas distintas a propósito. `AuditLog` (ya existía) es un log de cambios de fila vía triggers de Postgres — no tiene ni puede tener IP/user-agent (eso no existe a nivel trigger). `UserActivityLog` (nuevo) es a nivel aplicación: quién, cuándo, desde qué IP, qué acción, éxito o fallo. Se llena desde dos lugares: `ActivityLogInterceptor` (`libs/shared/database`, registrado junto a `TenantContextInterceptor`) para todo request mutante (POST/PUT/PATCH/DELETE) autenticado, y directamente en `AuthService.login()` para intentos de login (éxito y fallo) porque el login corre ANTES de que exista cualquier contexto de tenant/usuario que el interceptor pueda enganchar. Deliberadamente no cubre GETs (sería puro ruido) ni acciones de un cron/sistema (esos no tienen un usuario ni un request HTTP detrás). Cada escritura del log corre en su PROPIA transacción (`withTenantContext` separada), no la misma que la acción de negocio — si la acción de negocio falla y su transacción se revierte, el registro de "esto falló" tiene que sobrevivir igual; si compartieran transacción, un fallo real se llevaría puesto también el rastro de que ocurrió.

## Setup local de ESTA máquina (Windows, sin Docker)

Docker Desktop no corre en este Windows (build 18362, muy vieja para WSL2). Se instaló PostgreSQL nativo en su lugar:

- Quedaron **dos instancias** instaladas sin querer: PostgreSQL 18 en el puerto 5432 (instalada a mano, usuario `postgres`/`postgres`, sin usar), y PostgreSQL 16 en el puerto **5433** (instalada por mí vía winget — **esta es la que usamos**).
- `.env` (gitignored, no viaja con git) ya apunta al puerto 5433.
- Rol `plexo_app` creado a mano corriendo `docker/postgres-init/01-init-roles.sql`.
- Base `plexo` creada, las 9 migraciones aplicadas (la última, `profile_and_activity_log`, agregada 2026-07-21), seed corrido.
- Login de prueba: `tenantId=79dcca57-3830-4f17-af13-c000c0c0d0df`, `owner@demo.plexo` / `changeme123`. También existe `colega@demo.plexo` / `changeme123` (mismo tenant, rol SALES) — se creó a mano (no vía seed) sólo para probar presencia online entre dos usuarios reales; sólo en esta base local.

**Si retomás en otra computadora**: si tiene Docker andando, usar el `docker-compose.yml` normal del repo. Si no, repetir el proceso de Postgres nativo (instalar, crear base `plexo`, correr `docker/postgres-init/01-init-roles.sql`, `npx prisma migrate deploy`, seed) y ajustar tu propio `.env` — no se sincroniza entre máquinas.

## Módulos / features completos (actualización 2026-07-20/21)

| Commit | Qué es |
|---|---|
| `b4ab08e` | **Tablero en tiempo real** — login, dashboard con KPIs, stock por depósito, últimas facturas, gráfico de ventas 7 días, alertas de stock bajo mínimo. WebSockets socket.io (port 3001) con salas por tenant. TanStack Query + recharts en frontend. |
| `de65fc3` | Fix: CORS habilitado para `localhost:4200` en la API Fastify |
| `67a0ed9` | Fix: login guardaba `res.data.access_token` (no existe) en vez de `res.data.accessToken` — el token quedaba como string `"undefined"` y todo el dashboard fallaba con 401. Encontrado al probar el tablero por primera vez contra una base real. |
| `f3334ec` | **Frontend — pantalla de Inventario** (`apps/web/src/app/inventory`): tabla de artículos/variantes con buscador en tiempo real (client-side) y filtro por categoría, stock consolidado por depósito (columnas dinámicas según los depósitos que existan), modal para registrar movimientos de stock (atómico, vía el endpoint ya existente `POST /inventory/movements`). Se extrajo `AppShell` (`apps/web/src/components/AppShell.tsx`) como layout compartido con nav — el Tablero ahora lo usa también. Backend: se agregó `GET /inventory/categories` (no existía) y se enriqueció `GET /inventory/articles` para traer categoría + stock por depósito por variante (antes no traía nada de stock). |
| `36ce6d1` | **Auto-posteo contable** (lo más crítico del roadmap): `AccountingService.postInvoiceJournalEntry()` (`libs/modules/accounting`) resuelve (o crea, si no existen) 3 cuentas del sistema por código fijo — `1.1.02` Deudores por Ventas (ASSET), `4.1.01` Ventas (INCOME), `2.1.03` IVA Débito Fiscal (LIABILITY) — y postea el asiento estándar: débito AR por el total, crédito Ventas por el subtotal, crédito IVA por el impuesto (omitida si no hay impuesto). Siempre balanceado por construcción (`total = subtotal + taxTotal`); se salta el posteo entero si el total es cero. `SalesService` (`apps/api/src/app/sales`) ahora inyecta también `AccountingService` y llama a esto justo después de crear la factura — mismo patrón que ya usaba para componer Facturación+Inventario, mismo `getTenantDb()` compartido, así que es atómico gratis (si el asiento no balancea o inventario falla, se revierte todo junto). Probado end-to-end: `getIncomeStatement` (que antes daba vacío siempre) ahora refleja ventas reales, con y sin IVA. |
| `d01bdf2` | Doc: decisión de dejar la venta sin factura (`SALE_OUT` directo sin `invoiceId`) con asiento manual por ahora — ver decisión de arquitectura arriba. |
| `ff3ea58` | **Notas de crédito ahora revierten el asiento** — cierra el hueco que dejaba la iteración anterior. `AccountingService.reverseInvoiceJournalEntry(invoiceId)` busca el `JournalEntry` por `invoiceId` (es `@unique` en el modelo) y lo revierte reusando `createReversingEntry` (swap DEBIT/CREDIT). No-op si la factura nunca tuvo asiento (total cero, o previa al auto-posteo). **Cambio de API**: `POST /api/invoicing/credit-notes` se eliminó (nada más lo llamaba — verificado, ni frontend ni tests) y se reemplazó por `POST /api/sales/credit-notes`, que compone `InvoicingService.createCreditNote` + la reversión contable en `SalesService.voidSale()` — mismo patrón/atomicidad que ya usaba `createSale()`. Se consolidó a un solo camino a propósito: si hubiera quedado el endpoint viejo en paralelo, alguien podría acreditar una factura sin que se revierta el asiento, reabriendo el mismo hueco que se acaba de cerrar. No toca stock (una nota de crédito no repone inventario todavía — fuera de alcance de este cierre puntual, ver pendientes). |
| `7d53b79` | **Email real (Resend)** — `ResendEmailSender` (`libs/modules/invoicing`) implementa el `EmailSender` port que ya existía (antes solo el stub de consola). Decisión (con el usuario, 2026-07-21): **configuración global por `.env`** (`RESEND_API_KEY` + `EMAIL_FROM`), igual que `JWT_SECRET` — no por-tenant, así que no hace falta sector de administración ni cifrado de secretos en la base todavía. Si no están seteadas, `InvoicingModule` cae solo al stub de consola con un warning (`RESEND_API_KEY/EMAIL_FROM not set...`) — dev/local sigue funcionando sin cuenta de Resend. Fallos de envío se loguean, no rompen la request. De paso arreglé el lint preexistente de `invoicing` (`@nestjs/event-emitter` faltaba en su `package.json`). **Confirmado con cuenta real** el mismo día: el usuario cargó su `RESEND_API_KEY` propio en el `.env` local (no versionado) y probamos el envío de verdad contra `albionsistemas@gmail.com` — llegaron los correos. |
| `e9a02f2` | **Cron jobs de Cuentas a Cobrar** — `ReceivablesSchedulerService` (`apps/api/src/app/scheduler`) corre `@Cron(CronExpression.EVERY_DAY_AT_1AM)`, recorre todos los tenants (vía `list_tenant_ids()`, ver decisión de arquitectura arriba) y, por cada uno, dentro de su propia transacción (`withTenantContext`, el mismo helper que ya usaba el login): primero llama al nuevo `ReceivablesService.listInvoicesBecomingOverdue()` (la misma condición que `refreshOverdueStatuses` está por voltear — status `ISSUED`/`PARTIALLY_PAID` con `dueDate` vencido — capturada ANTES del update para saber exactamente qué facturas "recién" vencen), corre `refreshOverdueStatuses()` para marcarlas `OVERDUE`, y manda una alerta por email (`InvoicingService.sendOverdueInvoiceAlert()`, nuevo método público que envuelve el `EmailSender` sin exponer el token fuera del módulo) a cada cliente con email cargado. Se alerta **una sola vez** por factura — al día siguiente ya no vuelve a aparecer en `listInvoicesBecomingOverdue` porque su status ya es `OVERDUE`, no un nag diario. Un tenant que falla se loguea y no aborta el resto del barrido. **Probado end-to-end de verdad**: cambié el cron a cada 10 segundos temporalmente, creé una factura con vencimiento pasado, vi el log marcarla `OVERDUE` en el siguiente tick y confirmé que no se re-alertó en los ticks siguientes — después revertí a diario antes de commitear. |
| (este commit) | **Perfil de usuario + presencia online + log de actividad**, tres piezas relacionadas: (1) `User` ganó `name`, `avatarUrl` (solo URL, ver decisión arriba), `showOnlinePresence` (opt-in, default `true`); nuevos `GET/PATCH /auth/me` y `POST /auth/change-password`; pantalla `/profile` (avatar con fallback de iniciales, datos de cuenta, toggle de presencia, cambio de contraseña) usando el `AppShell` compartido. (2) **Presencia online**: `DashboardGateway` (el WebSocket que ya existía) ahora trackea en memoria qué usuarios de cada tenant están conectados (`Map<tenantId, Map<userId, {socketIds}>>` — varias pestañas del mismo usuario cuentan como una sola presencia, offline recién cuando se cierra la última), emite `presence.online`/`presence.offline` a los demás del tenant y `presence.snapshot` al que se conecta. Respeta el toggle: si `showOnlinePresence=false`, el usuario se une igual a la sala (recibe stock/facturas) pero nunca aparece como online para nadie. `AppShell` muestra "N compañeros en línea" en el header. (3) **Log de actividad** (`user_activity_log`, ver decisión arriba): interceptor global para escrituras + logging directo de intentos de login (éxito/fallo) en `AuthService`. |

**Nota sobre Tremor**: el brief pedía Tremor para estos componentes, pero `@tremor/react` tiene como peer dependency `react@^18` y el proyecto está en React 19 — instalarlo rompía peer deps. Se construyó con Tailwind puro, seteando el mismo estilo (dark, slate/indigo) que ya usa el Tablero.

**Datos de demo**: el seed (`libs/shared/database/prisma/seed.ts`) solo crea tenant + usuario, nada de inventario/moneda/clientes. Para poder probar la pantalla de Inventario y el auto-posteo se cargaron a mano vía API (no vía script versionado) depósitos, categorías, artículos con y sin impuesto, una moneda base y un cliente, sólo en la base local de esta máquina — no persiste en git ni afecta otras máquinas.

**Alcance del auto-posteo — lo que sigue faltando**:
- Las cuentas del plan (`1.1.02`, `4.1.01`, `2.1.03`) son códigos por convención, no configurables desde ningún lado todavía — si un tenant ya tenía cuentas propias con esos códigos, se reusan; si no, se crean automáticamente la primera vez.
- No hay costo de mercadería (COGS) — `getIncomeStatement` sigue sin gastos del lado de ventas, sólo ingresos.
- Una nota de crédito revierte el asiento pero no repone el stock (ver arriba).
- Venta sin factura (`SALE_OUT` directo) sigue siendo asiento manual — decisión explícita, ver arriba.

**Bugs preexistentes encontrados (no arreglados, fuera de alcance, confirmados con `git stash`/`git log` que ya fallaban en `main` antes de este trabajo)**:
- `inventory.service.spec.ts`: 2 tests rotos (`recordMovement` — el mock no incluye `stockLedger.findUnique`).
- `invoicing.service.spec.ts`: 1 test roto (`createInvoice` — el mock no inyecta `EventEmitter2`).
- ~~`invoicing:lint`: error de `@nx/dependency-checks`~~ — arreglado de paso al tocar ese mismo `package.json` para el email real.
- `apps/web/specs/index.spec.tsx`: test scaffold de Nx para la home page, nunca actualizado cuando `page.tsx` empezó a hacer `redirect('/login')` (commit `b4ab08e`, no tocado desde entonces).

**Verificado end-to-end (perfil/presencia/actividad)**: probado en Chrome (perfil, avatar con iniciales, guardado de nombre) y con dos usuarios reales conectados por WebSocket a la vez (`owner@demo.plexo` + un `colega@demo.plexo` creado sólo para esta prueba, local, no seedeado) — confirmado que un tercer usuario ve el broadcast `presence.online`/`presence.offline` del otro, que varias conexiones del mismo usuario no disparan falsos "offline", y que la tabla `user_activity_log` efectivamente registra login (éxito y fallo, con IP) y un `PATCH /auth/me` real. Durante esta prueba encontré y arreglé un catch silencioso en `recordLoginAttempt` que se tragaba errores sin loguear nada — ahora loguea con `Logger.error` como el resto del código.

**Email real ya configurado en esta máquina**: `RESEND_API_KEY`/`EMAIL_FROM` están en el `.env` local (gitignored, no viaja con git) con una cuenta real del usuario, `from` sandbox `onboarding@resend.dev`. **En otra máquina hay que repetir el alta** (cuenta en resend.com + API key) — ver `.env.example` para el formato.

**Alcance de los cron jobs — lo que sigue faltando**:
- Sólo cubre Cuentas a Cobrar (vencimientos). AFIP/otros procesos periódicos, si aparecen, reusarían el mismo `list_tenant_ids()` + `withTenantContext` pero necesitan su propio `@Cron`.
- La alerta es una sola vez al cruzar a `OVERDUE`, no un recordatorio recurrente mientras siga impaga — si se quiere nag periódico (cada 7 días, por ejemplo) hay que diseñarlo aparte, no reutiliza `listInvoicesBecomingOverdue` tal cual.
- Verificado a mano (cron acelerado a 10s temporalmente, revertido antes de commitear) en esta base local; no corrió todavía en un ciclo diario real.

## Pendiente / próximos pasos

1. Integración AFIP real (hoy: CAE falso, `StubElectronicInvoicingService`).
2. Frontend: siguen faltando las pantallas de Facturación, Cuentas a Cobrar, Contabilidad, Impuestos y Reportes — Inventario y Perfil son las únicas hasta ahora. Corregir además el mojibake pre-existente en nombres con tildes (p. ej. "Dep�sito Central", "Germán" guardado como "Germ�n") — es un problema de encoding en los datos ya sembrados/tipeados, no del código.
3. Arreglar los tests preexistentes rotos que quedan (ver nota arriba: 2 en inventory, 1 en invoicing, 1 en web).
4. Notas de crédito no reponen stock (ver nota arriba).
5. Si algún día hace falta que cada tenant mande desde su propia cuenta/dominio: pasar de la config global por `.env` a un sector de administración con configuración por tenant — requiere modelo de configuración + cifrado de secretos en la base, no es trivial, no se hizo ahora a propósito (decisión 2026-07-21).
6. Cron: alertas recurrentes (no solo una vez) y otros trabajos periódicos que necesiten `list_tenant_ids()` (ver nota arriba).
7. **Súper-admin de plataforma** (charlado con el usuario 2026-07-21, explícitamente pospuesto): gestión de cuentas/planes de tenancy, variables globales vía UI, informes de uso de la plataforma (no de negocio por tenant), backups, importación desde Excel, cobro a los tenants (hoy Cuentas a Cobrar es para que CADA TENANT le cobre a SUS clientes, no para que la plataforma le cobre a los tenants). Nada de esto existe todavía — es, en la práctica, un segundo producto separado del ERP que cada tenant usa.
8. Log de actividad: sólo cubre requests mutantes autenticados + login. No cubre acciones de cron/sistema (no hay usuario/request HTTP detrás) ni lecturas (GET).
9. Presencia online: no hay UI para ver el listado completo de quién está online, sólo el contador "N compañeros en línea" en el header — si se quiere el listado con nombres, ya viaja en el evento `presence.snapshot`/`presence.online`, sólo falta la UI.

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
