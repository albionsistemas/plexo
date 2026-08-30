'use client';

import { adminMercadoPagoApi, type MercadoPagoWebhookEvent } from '@/lib/admin';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

function StatCard({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${alert ? 'border-red-900 bg-red-950/40' : 'border-slate-800 bg-slate-900'}`}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${alert ? 'text-red-300' : 'text-white'}`}>{value}</p>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PAID: 'Pagado',
  CONNECTED: 'Conectado',
  EXPIRED: 'Vencido',
  REVOKED: 'Desautorizado',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Reembolsado',
  ERROR: 'Error',
  DISCONNECTED: 'Desconectado',
};

export default function AdminMercadoPagoPage() {
  const [showEvents, setShowEvents] = useState(true);

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['admin-mercadopago-metrics'],
    queryFn: adminMercadoPagoApi.getMetrics,
    refetchInterval: 60_000,
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['admin-mercadopago-webhook-events'],
    queryFn: () => adminMercadoPagoApi.listFailedWebhookEvents(100),
    enabled: showEvents,
  });

  const invalidSignaturePct = metrics ? (metrics.webhooks.invalidSignatureRate * 100).toFixed(1) : '—';
  const connectorsNeedingReconnection =
    (metrics?.connectorsByStatus['EXPIRED'] ?? 0) + (metrics?.connectorsByStatus['REVOKED'] ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-white">Mercado Pago</h1>
      <p className="text-xs text-slate-500">
        Métricas derivadas de PaymentIntent/Connector (por tenant) y WebhookEvent (global) - ver
        AdminMercadoPagoService. Ventana de 7 días para los números de webhooks.
      </p>

      {metricsLoading || !metrics ? (
        <p className="text-sm text-slate-500">Cargando métricas...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <StatCard label="Links de cobro creados" value={String(metrics.paymentIntentsByStatus['PENDING'] + metrics.paymentIntentsByStatus['PAID'] + metrics.paymentIntentsByStatus['EXPIRED'] + metrics.paymentIntentsByStatus['CANCELLED'] + metrics.paymentIntentsByStatus['REFUNDED'] + metrics.paymentIntentsByStatus['ERROR'])} />
            <StatCard label="Pagos conciliados" value={String(metrics.paymentIntentsByStatus['PAID'])} />
            <StatCard
              label="Conectores que necesitan reconexión"
              value={String(connectorsNeedingReconnection)}
              alert={connectorsNeedingReconnection > 0}
            />
            <StatCard
              label="Tasa de firma inválida (7d)"
              value={`${invalidSignaturePct}%`}
              alert={metrics.webhooks.invalidSignatureRate > 0.05}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-sm font-medium text-slate-400">Links de cobro por estado</h2>
              <dl className="flex flex-col gap-1.5 text-sm">
                {Object.entries(metrics.paymentIntentsByStatus).map(([status, count]) => (
                  <div key={status} className="flex justify-between">
                    <dt className="text-slate-400">{STATUS_LABELS[status] ?? status}</dt>
                    <dd className="font-mono text-slate-200">{count}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-sm font-medium text-slate-400">Conectores por estado</h2>
              <dl className="flex flex-col gap-1.5 text-sm">
                {Object.entries(metrics.connectorsByStatus).map(([status, count]) => (
                  <div key={status} className="flex justify-between">
                    <dt className="text-slate-400">{STATUS_LABELS[status] ?? status}</dt>
                    <dd className="font-mono text-slate-200">{count}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-1 text-sm font-medium text-slate-400">Webhooks (últimos 7 días)</h2>
            <div className="mt-2 flex flex-wrap gap-6 text-sm text-slate-300">
              <span>Total: {metrics.webhooks.totalLast7Days}</span>
              <span>Firma inválida: {metrics.webhooks.invalidSignatureLast7Days}</span>
              <span>
                Latencia promedio de procesamiento:{' '}
                {metrics.webhooks.avgProcessingLatencyMs !== null
                  ? `${Math.round(metrics.webhooks.avgProcessingLatencyMs)} ms`
                  : 'sin datos'}
              </span>
            </div>
          </div>
        </>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900">
        <button
          onClick={() => setShowEvents((v) => !v)}
          className="flex w-full items-center justify-between p-4 text-left text-sm font-medium text-slate-400"
        >
          Eventos fallidos (firma inválida, huérfanos, errores de conciliación)
          <span className="text-xs text-slate-500">{showEvents ? 'Ocultar' : 'Mostrar'}</span>
        </button>
        {showEvents &&
          (eventsLoading ? (
            <p className="p-4 pt-0 text-sm text-slate-500">Cargando eventos...</p>
          ) : !events || events.length === 0 ? (
            <p className="p-4 pt-0 text-sm text-slate-500">Sin eventos fallidos.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-slate-800 text-left text-xs text-slate-500">
                    <th className="p-3">Recibido</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Firma</th>
                    <th className="p-3">Procesado</th>
                    <th className="p-3">Tenant</th>
                    <th className="p-3">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <WebhookEventRow key={event.id} event={event} />
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </div>
    </div>
  );
}

function WebhookEventRow({ event }: { event: MercadoPagoWebhookEvent }) {
  return (
    <tr className="border-b border-slate-800/50">
      <td className="p-3 whitespace-nowrap text-slate-400">
        {new Date(event.receivedAt).toLocaleString('es-AR')}
      </td>
      <td className="p-3 font-mono text-xs text-slate-400">{event.type}</td>
      <td className="p-3">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            event.signatureOk ? 'bg-slate-800 text-slate-400' : 'bg-red-900/50 text-red-300'
          }`}
        >
          {event.signatureOk ? 'Válida' : 'Inválida'}
        </span>
      </td>
      <td className="p-3">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            event.processed ? 'bg-green-900/50 text-green-300' : 'bg-amber-900/50 text-amber-300'
          }`}
        >
          {event.processed ? 'Sí' : 'No'}
        </span>
      </td>
      <td className="p-3 font-mono text-xs text-slate-500">{event.tenantId ?? '—'}</td>
      <td className="p-3 text-slate-300">{event.error ?? '—'}</td>
    </tr>
  );
}
