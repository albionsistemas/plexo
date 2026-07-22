'use client';

import { invoicingApi } from '@/lib/invoicing';
import { useQuery } from '@tanstack/react-query';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  ISSUED: 'Emitida',
  PARTIALLY_PAID: 'Pago parcial',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

export default function ResumenTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['invoices'],
    queryFn: invoicingApi.listInvoices,
  });

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-slate-500">Cargando...</div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex h-40 items-center justify-center text-red-600 dark:text-red-400">
        Error al cargar el resumen
      </div>
    );
  }

  const totalFacturado = data.reduce((sum, inv) => sum + Number(inv.total), 0);
  const totalCobrado = data.reduce((sum, inv) => sum + (Number(inv.total) - Number(inv.balanceDue)), 0);
  const totalPendiente = data.reduce((sum, inv) => sum + Number(inv.balanceDue), 0);

  const countByStatus = data.reduce<Record<string, number>>((acc, inv) => {
    acc[inv.status] = (acc[inv.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Facturas emitidas" value={`${data.length}`} />
        <KpiCard label="Total facturado" value={`$${totalFacturado.toFixed(2)}`} />
        <KpiCard label="Total cobrado" value={`$${totalCobrado.toFixed(2)}`} />
        <KpiCard label="Saldo pendiente" value={`$${totalPendiente.toFixed(2)}`} />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-400">Facturas por estado</h2>
        {data.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-600">Sin facturas todavía</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {Object.entries(countByStatus).map(([status, count]) => (
              <div
                key={status}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2"
              >
                <p className="text-xs text-slate-500">{STATUS_LABELS[status] ?? status}</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{count}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
      <p className="text-xs text-slate-600 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}
