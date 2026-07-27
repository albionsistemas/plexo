'use client';

import {
  quoteRequestsApi,
  type PurchaseOrderDetail,
  type QuoteRequestDetail,
} from '@/lib/purchases';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import QuoteRequestDetailPanel from './QuoteRequestDetailPanel';
import QuoteRequestFormModal from './QuoteRequestFormModal';
import SendPurchaseOrderDialog from './SendPurchaseOrderDialog';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  CONVERTED: 'Emitido a OC',
  CANCELLED: 'Cancelado',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
  CONVERTED: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  CANCELLED: 'bg-slate-200 dark:bg-slate-800 text-slate-500',
};

export default function PedidosTab() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<QuoteRequestDetail | null>(null);
  const [pendingSend, setPendingSend] = useState<PurchaseOrderDetail | null>(null);

  const { data: quoteRequests, isLoading } = useQuery({
    queryKey: ['quote-requests'],
    queryFn: () => quoteRequestsApi.list(),
  });

  const cloneMutation = useMutation({
    mutationFn: (id: string) => quoteRequestsApi.clone(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['quote-requests'] }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Nuevo pedido
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : !quoteRequests || quoteRequests.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-600">Todavía no hay pedidos de cotización</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-left text-slate-500">
                <th className="p-3">Número</th>
                <th className="p-3">Proveedor</th>
                <th className="p-3">Fecha</th>
                <th className="p-3">Estado</th>
                <th className="p-3 text-right">Total estimado</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {quoteRequests.map((qr) => (
                <tr key={qr.id} className="border-b border-slate-200/50 dark:border-slate-800/50">
                  <td className="p-3 font-mono text-xs text-slate-700 dark:text-slate-300">{qr.number}</td>
                  <td className="p-3 text-slate-800 dark:text-slate-200">{qr.supplier.name}</td>
                  <td className="p-3 text-slate-600 dark:text-slate-400">
                    {new Date(qr.createdAt).toLocaleDateString('es-AR')}
                  </td>
                  <td className="p-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[qr.status]}`}>
                      {STATUS_LABELS[qr.status] ?? qr.status}
                    </span>
                  </td>
                  <td className="p-3 text-right text-slate-800 dark:text-slate-200">
                    {qr.estimatedTotal != null ? `$${Number(qr.estimatedTotal).toFixed(2)}` : '—'}{' '}
                    {qr.currency.code}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-3 text-xs">
                      <button
                        onClick={() => setDetailId(qr.id)}
                        className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                      >
                        Ver
                      </button>
                      <button
                        onClick={() => cloneMutation.mutate(qr.id)}
                        disabled={cloneMutation.isPending}
                        className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-50"
                      >
                        Clonar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && <QuoteRequestFormModal onClose={() => setCreating(false)} />}
      {editing && <QuoteRequestFormModal quoteRequest={editing} onClose={() => setEditing(null)} />}
      {detailId && (
        <QuoteRequestDetailPanel
          quoteRequestId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(detail) => {
            setDetailId(null);
            setEditing(detail);
          }}
          onConverted={(purchaseOrder) => {
            setDetailId(null);
            setPendingSend(purchaseOrder);
          }}
        />
      )}
      {pendingSend && (
        <SendPurchaseOrderDialog
          purchaseOrder={{
            id: pendingSend.id,
            number: pendingSend.number,
            supplierId: pendingSend.supplier.id,
            supplierName: pendingSend.supplier.name,
            supplierEmail: pendingSend.supplier.email,
          }}
          onClose={() => setPendingSend(null)}
        />
      )}
    </div>
  );
}
