# Resumen de OPLEX — ERP integral multi-tenant

## Qué es

OPLEX (nombre comercial actual del proyecto, cuyo código y repositorio siguen llamándose internamente Plexo) es un ERP (Enterprise Resource Planning) SaaS multi-tenant pensado para pequeñas y medianas empresas argentinas. Cubre el ciclo completo de un negocio: inventario, ventas y facturación electrónica (AFIP), compras, cuentas a cobrar/pagar, contabilidad, impuestos y reportes gerenciales, todo dentro de una única aplicación web con aislamiento estricto de datos por empresa (tenant).

Es un monorepo Nx con dos aplicaciones principales: una API backend en NestJS/Fastify (`apps/api`) y un frontend en Next.js/React (`apps/web`), con una base de datos PostgreSQL administrada vía Prisma. El aislamiento multi-tenant no se resuelve solo a nivel de aplicación: cada tabla sensible tiene Row Level Security (RLS) nativo de Postgres, de modo que aunque una consulta tuviera un bug, la base de datos misma impide que un tenant vea datos de otro.

## Autenticación y onboarding

El acceso es moderno, tipo SaaS: signup público con verificación de email por código OTP, login en dos pasos (se resuelve automáticamente a qué empresa pertenece un email, y si el mismo email está en varias empresas se pide elegir cuál), recuperación de contraseña, y login social con Google, Microsoft y Apple (los botones se activan solos cuando el operador carga las credenciales correspondientes, si no dicen "Próximamente"). Todo el flujo tiene una estética cuidada (fondo animado de partículas, tarjetas con transición, medidor de fuerza de contraseña).

Cada usuario pertenece a una única empresa (tenant) y tiene un rol (OWNER, ADMIN, VENTAS, COMPRAS, INVENTARIO, etc.) que determina qué módulos puede ver y qué acciones puede ejecutar, controlado por guards de rol en el backend, no solo ocultando botones en el frontend.

## Tablero (Dashboard)

Es la pantalla de inicio tras loguearse. Muestra en tiempo real (vía WebSockets con salas por tenant, así que si dos usuarios de la misma empresa están conectados ven actualizaciones al instante): total facturado hoy, total cobrado hoy, alertas de stock bajo mínimo, un gráfico de ventas de los últimos 7 días, y un desglose de stock por depósito. También incluye un checklist de "primeros pasos" (crear la primera empresa, cargar el primer artículo, emitir la primera factura, completar el perfil) que ayuda a un usuario nuevo a orientarse.

## Inventario

Gestión de artículos con variantes (talles, colores, etc.), categorías, depósitos y movimientos de stock. Cada artículo puede tener imagen, marcarse como "servicio" (no maneja stock) o "publicado" (visible en catálogo). Hay importación masiva de artículos desde Excel, historial de precios, stock mínimo configurable con alertas, y sugerencias de reposición.

Sobre el inventario se construyó un **catálogo visual tipo e-commerce**: los artículos se pueden ver como grilla con imagen/precio/stock, y agregarse a un **carrito de compras interno** (uno persistente por usuario). Desde ese carrito se puede: repartir los artículos entre varios proveedores generando un Pedido de Cotización por cada uno, proponerle una venta a un cliente, o exportar todo a PDF — sin que ninguna de esas acciones vacíe el carrito automáticamente.

## Ventas y Facturación

Facturación con los tipos de comprobante argentinos (A, B, C, notas de crédito), soporte de IVA por línea, distintos "conceptos" de factura (Productos, Servicios, Mixto, cada uno con sus reglas AFIP), y multi-moneda con tipo de cambio. La integración con **AFIP (facturación electrónica real, WSFE)** está implementada de punta a punta: certificado y clave por tenant (cifrados), obtención de CAE real contra el webservice de AFIP, manejo de errores SOAP detallados en vez de mensajes genéricos. También hay padrón AFIP (búsqueda de datos fiscales por CUIT) para autocompletar al dar de alta un cliente.

Cada factura tiene un panel de detalle completo reutilizado en varias pantallas, y el registro de cobros postea automáticamente el asiento contable correspondiente (débito Caja / crédito Deudores por Ventas).

**Cotizaciones** es un módulo hermano de Ventas: presupuestos a clientes con numeración propia, ciclo Borrador→Enviada→Aceptada/Rechazada/Cancelada, envío por email o WhatsApp, y export a PDF con 5 estilos distintos elegibles por el usuario.

## Cuentas a Cobrar

Vista de saldos pendientes por cliente, reporte de antigüedad de deuda (aging), estado de cuenta detallado por cliente, y un sistema de **recordatorios automáticos recurrentes** (no solo una vez) configurables por tenant para avisar a clientes con facturas vencidas.

## Compras

Simétrico a Ventas pero del lado proveedor: Pedidos de Cotización a proveedores (con posibilidad de pedir cotización a varios proveedores a la vez y comparar precios artículo por artículo antes de elegir ganador), Órdenes de Compra, Recepción de Mercadería (que sí impacta stock real, a diferencia de la orden que es solo un documento), Facturas de Compra, y Devoluciones a Proveedor. Cada proveedor puede tener artículos preferidos y se guarda el historial de precios de compra. El envío de documentos a proveedores también admite email y WhatsApp, con varios estilos de PDF configurables por prefijo de numeración propio de cada usuario.

Las compras impactan Contabilidad correctamente: Cuentas a Pagar, IVA Crédito Fiscal, y una cuenta puente de "Mercadería Recibida No Facturada" (GRNI) para el caso normal en que la recepción física llega antes que la factura del proveedor.

## Cuentas a Pagar

Análogo a Cuentas a Cobrar pero para lo que la empresa le debe a sus proveedores: saldos, antigüedad de deuda, estado de cuenta por proveedor.

## Contabilidad

Plan de cuentas configurable, asientos contables (manuales y automáticos generados por Ventas/Compras/Cobros/Pagos), libro mayor por cuenta, balance de sumas y saldos (trial balance), y reversión de asientos. Queda fuera de alcance, a propósito, el Libro IVA Digital (RG 3685/ARCA) y la conciliación bancaria automática — ambos requieren integración fiscal/bancaria real que todavía no se hizo.

## Impuestos

Catálogo de impuestos con tasas versionadas en el tiempo (para que un cambio de alícuota no altere retroactivamente facturas viejas), delegable a un contador, y regímenes de retención (IIBB, etc.) también versionados.

## Reportes

Tres vistas gerenciales: **Resultados** (estado de resultados/P&L), **Ventas** (por cliente y por producto) y **Financiero** (libro de caja/banco con conciliación manual — un botón que marca movimientos como conciliados, no una integración bancaria real). Las tres comparten un filtro de rango de fechas con atajos ("Este mes", "Mes anterior", "Este trimestre", "Este año").

## Empresas

Gestión de clientes y proveedores (companies), cada uno con sus contactos (personas), avatar, condición fiscal ante AFIP, domicilio fiscal, y flag de si es proveedor preferido para ciertos artículos. Las empresas se desactivan en vez de borrarse (para no romper el historial de facturas ya emitidas); los contactos individuales sí se pueden borrar.

## Gestión de Equipo y perfil

Cada empresa puede invitar colegas por email (con un link de invitación que expira) o darlos de alta directo con clave temporal. Desde ahí se administra el rol de cada miembro, se puede suspender/reactivar una cuenta (con protecciones para no quedar sin ningún OWNER activo ni auto-suspenderse), resetear contraseñas de otros miembros, y ver un historial de actividad por usuario. El perfil propio permite cambiar contraseña, datos personales y ver la propia actividad.

## Motor de Planes y Suscripciones (SaaS Engine)

Cada tenant tiene un plan (Basic, Silver, Diamond) con límites y un estado de suscripción (trial, activa, etc.). El trial de un signup público arranca directamente en el plan Silver para mostrar el producto completo antes de que el usuario decida convertir o caer al plan gratuito. El cobro real (pasarela de pago) todavía no está integrado — es solo informativo por ahora.

## Backoffice SuperAdmin

Un panel separado (`/admin`, visible solo para emails configurados como administradores de plataforma) para gestionar la operación completa del SaaS: listado de todos los tenants con su plan/suscripción/cantidad de usuarios/facturas emitidas, capacidad de suspender/reactivar un tenant o "impersonarlo" (entrar como si fuera ese tenant para dar soporte), gestión de planes, un feed de actividad global, un visor de errores 5xx recientes, y gestión de backups. No incluye todavía cobro a los tenants por parte de la plataforma ni importación masiva desde Excel a nivel plataforma — eso quedó pospuesto a propósito.

## Funciones transversales

Además de los módulos de negocio, hay un conjunto de capacidades que atraviesan toda la app: presencia online (ver qué compañeros están conectados en el momento), un log de actividad que registra cada acción mutante (crear, editar, borrar) con diff campo a campo de qué cambió, envío de emails transaccionales (verificación, recuperación de contraseña, invitaciones, recordatorios de cobro) con remitente propio del tenant si tiene dominio verificado, exportación a PDF con varios estilos visuales para los documentos que se envían a terceros (cotizaciones, órdenes de compra), y enlaces directos a WhatsApp para mandar esos mismos documentos.

## Estado actual

El roadmap funcional original (9 pantallas: Inventario, Perfil, Facturación, Cuentas a Cobrar, Empresas, Contabilidad, Impuestos, Reportes y Tablero) está completo, y se sumaron por encima Compras, Cotizaciones, el carrito de Inventario, Auth/Onboarding completo, Gestión de Equipo y el Backoffice SuperAdmin — bastante más de lo planeado inicialmente. Lo más relevante que sigue pendiente es confirmar el "camino feliz" de AFIP (emitir una factura real con CAE verdadero, hoy solo probado contra un certificado de prueba que AFIP rechaza correctamente) y una Nota de Crédito de Compra como documento propio (hoy solo existe la devolución física de mercadería).
