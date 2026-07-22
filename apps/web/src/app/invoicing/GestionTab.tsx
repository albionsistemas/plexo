'use client';

import InvoiceDetailPanel from '@/components/InvoiceDetailPanel';
import { invoicingApi, type Invoice } from '@/lib/invoicing';
import { getSocket } from '@/lib/socket';
import { useDensity } from '@/providers/DensityProvider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import CreditNoteModal from './CreditNoteModal';
import NewInvoiceModal from './NewInvoiceModal';
import ReceiptModal from './ReceiptModal';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  ISSUED: 'Emitida',
  PARTIALLY_PAID: 'Pago parcial',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
  ISSUED: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
  PARTIALLY_PAID: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300',
  PAID: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  OVERDUE: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',
  CANCELLED: 'bg-slate-200 dark:bg-slate-800 text-slate-500',
};

export default function GestionTab() {
  const queryClient = useQueryClient();
  const { density } = useDensity();
  const cellY = density === 'compact' ? 'py-1' : 'py-2';
  const headY = density === 'compact' ? 'pb-1' : 'pb-2';
  const [search, setSearch] = useState('');
  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false);
  const [receiptFor, setReceiptFor] = useState<Invoice | null>(null);
  const [creditNoteFor, setCreditNoteFor] = useState<Invoice | null>(null);
  const [detailFor, setDetailFor] = useState<Invoice | null>(null);

  const invoicesQuery = useQuery({
    queryKey: ['invoices'],
    queryFn: invoicingApi.listInvoices,
  });

  useEffect(() => {
    const socket = getSocket();
    socket.on('invoice.created', () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    });
    return () => {
      socket.off('invoice.created');
    };
  }, [queryClient]);

  const invoices = invoicesQuery.data ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const rows =
    normalizedSearch === ''
      ? invoices
      : invoices.filter(
          (inv) =>
            inv.customerName.toLowerCase().includes(normalizedSearch) ||
            inv.number.includes(normalizedSearch),
        );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {rows.length} factura{rows.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => setNewInvoiceOpen(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          + Nueva factura
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por cliente o número..."
        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500 sm:max-w-sm"
      />

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        {invoicesQuery.isLoading ? (
          <div className="flex h-40 items-center justify-center text-slate-500">
            Cargando facturas...
          </div>
        ) : invoicesQuery.error ? (
          <div className="flex h-40 items-center justify-center text-red-600 dark:text-red-400">
            Error al cargar las facturas
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-slate-400 dark:text-slate-600">
            Sin facturas que coincidan
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                  <th className={`${headY} pr-4`}>Número</th>
                  <th className={`${headY} pr-4`}>Cliente</th>
                  <th className={`${headY} pr-4`}>Fecha</th>
                  <th className={`${headY} pr-4 text-right`}>Total</th>
                  <th className={`${headY} pr-4 text-right`}>Saldo</th>
                  <th className={`${headY} pr-4`}>Estado</th>
                  <th className={headY}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-200/40 dark:hover:bg-slate-800/40">
                    <td className={`${cellY} pr-4 font-mono text-xs text-slate-600 dark:text-slate-400`}>
                      {inv.documentLetter}-{inv.number}
                    </td>
                    <td className={`${cellY} pr-4 text-slate-800 dark:text-slate-200`}>{inv.customerName}</td>
                    <td className={`${cellY} pr-4 text-slate-600 dark:text-slate-400`}>
                      {new Date(inv.issueDate).toLocaleDateString('es-AR')}
                    </td>
                    <td className={`${cellY} pr-4 text-right text-slate-800 dark:text-slate-200`}>
                      ${Number(inv.total).toFixed(2)}
                    </td>
                    <td className={`${cellY} pr-4 text-right text-slate-600 dark:text-slate-400`}>
                      ${Number(inv.balanceDue).toFixed(2)}
                    </td>
                    <td className={`${cellY} pr-4`}>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[inv.status] ?? 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}
                      >
                        {STATUS_LABELS[inv.status] ?? inv.status}
                      </span>
                    </td>
                    <td className={cellY}>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setDetailFor(inv)}
                          className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                        >
                          Ver detalle
                        </button>
                        {Number(inv.balanceDue) > 0 && inv.status !== 'CANCELLED' && (
                          <button
                            onClick={() => setReceiptFor(inv)}
                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                          >
                            Cobrar
                          </button>
                        )}
                        {inv.afipCae && inv.status !== 'CANCELLED' && (
                          <button
                            onClick={() => setCreditNoteFor(inv)}
                            className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                          >
                            Nota de crédito
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {newInvoiceOpen && <NewInvoiceModal onClose={() => setNewInvoiceOpen(false)} />}
      {receiptFor && <ReceiptModal invoice={receiptFor} onClose={() => setReceiptFor(null)} />}
      {creditNoteFor && (
        <CreditNoteModal invoice={creditNoteFor} onClose={() => setCreditNoteFor(null)} />
      )}
      {detailFor && <InvoiceDetailPanel invoice={detailFor} onClose={() => setDetailFor(null)} />}
    </div>
  );
}
