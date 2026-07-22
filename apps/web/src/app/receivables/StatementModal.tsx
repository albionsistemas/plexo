'use client';

import InvoiceDetailPanel from '@/components/InvoiceDetailPanel';
import { receivablesApi } from '@/lib/receivables';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

interface Props {
  customerId: string;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  ISSUED: 'Emitida',
  PARTIALLY_PAID: 'Pago parcial',
  OVERDUE: 'Vencida',
};

export default function StatementModal({ customerId, onClose }: Props) {
  const { data: statement, isLoading } = useQuery({
    queryKey: ['customer-statement', customerId],
    queryFn: () => receivablesApi.getCustomerStatement(customerId),
  });
  const [detailFor, setDetailFor] = useState<{
    id: string;
    documentLetter: string;
    number: string;
  } | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {isLoading ? 'Estado de cuenta' : statement?.customerName}
          </h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        {isLoading || !statement ? (
          <div className="py-10 text-center text-slate-500">Cargando...</div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-500">Límite de crédito</p>
                <p className="text-slate-800 dark:text-slate-200">${Number(statement.creditLimit).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total adeudado</p>
                <p className="font-semibold text-red-600 dark:text-red-400">
                  ${Number(statement.totalOutstanding).toFixed(2)}
                </p>
              </div>
            </div>

            {statement.invoices.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-600">Sin facturas pendientes</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                    <th className="pb-2 pr-4">Número</th>
                    <th className="pb-2 pr-4">Vencimiento</th>
                    <th className="pb-2 pr-4 text-right">Saldo</th>
                    <th className="pb-2 pr-4">Estado</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {statement.invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-slate-200/50 dark:border-slate-800/50">
                      <td className="py-2 pr-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {inv.documentLetter}-{inv.number}
                      </td>
                      <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                        {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('es-AR') : '—'}
                      </td>
                      <td className="py-2 pr-4 text-right text-slate-800 dark:text-slate-200">
                        ${Number(inv.balanceDue).toFixed(2)}
                      </td>
                      <td className="py-2 pr-4 text-xs text-slate-600 dark:text-slate-400">
                        {STATUS_LABELS[inv.status] ?? inv.status}
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() =>
                            setDetailFor({
                              id: inv.id,
                              documentLetter: inv.documentLetter,
                              number: inv.number,
                            })
                          }
                          className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {detailFor && (
        <InvoiceDetailPanel
          invoice={{ ...detailFor, customerName: statement?.customerName ?? '' }}
          onClose={() => setDetailFor(null)}
        />
      )}
    </div>
  );
}
