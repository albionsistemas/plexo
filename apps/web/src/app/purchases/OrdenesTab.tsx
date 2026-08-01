'use client';

import { describeReceiptStatus, purchaseOrdersApi } from '@/lib/purchases';
import { useQuery } from '@tanstack/react-query';
import { PackageCheck } from 'lucide-react';
import { useState } from 'react';
import PurchaseOrderDetailPanel from './PurchaseOrderDetailPanel';
import PurchaseOrderFormModal from './PurchaseOrderFormModal';
import ReceiveGoodsModal from './ReceiveGoodsModal';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  CANCELLED: 'Cancelada',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
  SENT: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  CANCELLED: 'bg-slate-200 dark:bg-slate-800 text-slate-500',
};

const CHANNEL_LABELS: Record<string, string> = { EMAIL: 'Email', WHATSAPP: 'WhatsApp' };

export default function OrdenesTab() {
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [receivingId, setReceivingId] = useState<string | null>(null);

  const { data: purchaseOrders, isLoading } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => purchaseOrdersApi.list(),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Nueva orden
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : !purchaseOrders || purchaseOrders.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-600">Todavía no hay órdenes de compra</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-left text-slate-500">
                <th className="p-3">Número</th>
                <th className="p-3">Proveedor</th>
                <th className="p-3">Fecha</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Enviada vía</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((po) => (
                <tr key={po.id} className="border-b border-slate-200/50 dark:border-slate-800/50">
                  <td className="p-3 font-mono text-xs text-slate-700 dark:text-slate-300">{po.number}</td>
                  <td className="p-3 text-slate-800 dark:text-slate-200">{po.supplier.name}</td>
                  <td className="p-3 text-slate-600 dark:text-slate-400">
                    {new Date(po.createdAt).toLocaleDateString('es-AR')}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[po.status]}`}>
                        {STATUS_LABELS[po.status] ?? po.status}
                      </span>
                      {(() => {
                        const receipt = describeReceiptStatus(po);
                        return (
                          receipt && (
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${receipt.colorClass}`}>
                              {receipt.label}
                            </span>
                          )
                        );
                      })()}
                    </div>
                  </td>
                  <td className="p-3 text-slate-600 dark:text-slate-400">
                    {po.sentVia ? CHANNEL_LABELS[po.sentVia] ?? po.sentVia : '—'}
                  </td>
                  <td className="p-3 text-right text-slate-800 dark:text-slate-200">
                    ${Number(po.total).toFixed(2)} {po.currency.code}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-2 text-xs">
                      {po.status === 'SENT' && po.lines.some((l) => Number(l.pendingQuantity) > 0) && (
                        <button
                          onClick={() => setReceivingId(po.id)}
                          title="Recibir mercadería"
                          className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
                        >
                          <PackageCheck className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setDetailId(po.id)}
                        className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                      >
                        Ver
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && <PurchaseOrderFormModal onClose={() => setCreating(false)} />}
      {detailId && <PurchaseOrderDetailPanel purchaseOrderId={detailId} onClose={() => setDetailId(null)} />}
      {receivingId && <ReceiveGoodsLoader purchaseOrderId={receivingId} onClose={() => setReceivingId(null)} />}
    </div>
  );
}

/** El ícono de "Recibir mercadería" del listado sólo tiene el resumen de la
 * orden (sin líneas con articleVariant/unitCost) - ReceiveGoodsModal necesita
 * el detalle completo, así que lo trae primero. Misma queryKey que usa
 * PurchaseOrderDetailPanel/ReceiveGoodsModal, así que si la orden ya se vio
 * en esta sesión sale de caché al instante. */
function ReceiveGoodsLoader({ purchaseOrderId, onClose }: { purchaseOrderId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['purchase-order-detail', purchaseOrderId],
    queryFn: () => purchaseOrdersApi.get(purchaseOrderId),
  });

  if (isLoading || !data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <p className="text-sm text-slate-300">Cargando...</p>
      </div>
    );
  }

  return <ReceiveGoodsModal purchaseOrder={data} onClose={onClose} />;
}
