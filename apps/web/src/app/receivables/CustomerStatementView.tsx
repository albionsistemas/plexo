'use client';

import InvoiceDetailPanel from '@/components/InvoiceDetailPanel';
import { receivablesApi, type CustomerStatementEntry } from '@/lib/receivables';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import DateRangeFilter from '../reports/DateRangeFilter';

interface Props {
  customerId: string;
}

function money(value: string): string {
  return Number(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-AR', { timeZone: 'UTC' });
}

const TYPE_LABELS: Record<CustomerStatementEntry['type'], string> = {
  INVOICE: 'Factura',
  CREDIT_NOTE: 'Nota de Crédito',
  RECEIPT: 'Recibo',
};

// El documentNumber de una fila INVOICE viene armado por el backend como
// "${documentLetter} ${pointOfSale}-${number}" (ver invoiceDocumentNumber
// en receivables.service.ts) - se parsea de vuelta acá sólo para prellenar
// el header de InvoiceDetailPanel antes de que termine su propio fetch
// (ver el comentario de ese componente: "Only what the header needs before
// the full detail loads"). Si el formato no calza (no debería, es el mismo
// archivo el que lo arma), cae a mostrar el string entero como "number".
function parseInvoiceDocumentNumber(documentNumber: string): { documentLetter: string; number: string } {
  const match = documentNumber.match(/^(\S+) (.+)$/);
  return match ? { documentLetter: match[1], number: match[2] } : { documentLetter: '', number: documentNumber };
}

export default function CustomerStatementView({ customerId }: Props) {
  const [{ from, to }, setRange] = useState({ from: '', to: '' });
  const [pendingOnly, setPendingOnly] = useState(false);
  const [detailFor, setDetailFor] = useState<{ id: string; documentLetter: string; number: string } | null>(null);

  const query = useQuery({
    queryKey: ['customer-statement', customerId, from, to, pendingOnly],
    queryFn: () => receivablesApi.getCustomerStatement(customerId, { from, to, pendingOnly }),
  });
  const statement = query.data;
  const entries = statement?.entries ?? [];

  return (
    <div className="flex flex-col gap-4">
      {query.isLoading || !statement ? (
        <div className="flex h-24 items-center justify-center text-slate-500">Cargando...</div>
      ) : (
        <>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{statement.customerName}</h3>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">Saldo total vencido</p>
              <p className="text-lg font-semibold text-red-600 dark:text-red-400">${money(statement.totalOverdue)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Saldo total a vencer</p>
              <p className="text-lg font-semibold text-amber-600 dark:text-amber-400">
                ${money(statement.totalNotYetDue)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Total adeudado</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                ${money(statement.totalOutstanding)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Límite de crédito</p>
              <p className="text-lg font-semibold text-slate-700 dark:text-slate-300">${money(statement.creditLimit)}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <DateRangeFilter
              from={from}
              to={to}
              onFromChange={(value) => setRange((r) => ({ ...r, from: value }))}
              onToChange={(value) => setRange((r) => ({ ...r, to: value }))}
              onPreset={(r) => setRange(r)}
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />
                Mostrar solo comprobantes con saldo pendiente
              </label>
              <button
                type="button"
                onClick={() => receivablesApi.openCustomerStatementPdf(customerId, { from, to, pendingOnly })}
                disabled={entries.length === 0}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                Exportar PDF
              </button>
              <button
                type="button"
                onClick={() =>
                  receivablesApi.downloadCustomerStatementExcel(customerId, statement.customerName, {
                    from,
                    to,
                    pendingOnly,
                  })
                }
                disabled={entries.length === 0}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                Exportar Excel (.xlsx)
              </button>
            </div>
          </div>

          {entries.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-600">Sin movimientos en el período</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                    <th className="pb-2 pr-4 whitespace-nowrap">Fecha</th>
                    <th className="pb-2 pr-4">Tipo y Nro. de Comprobante</th>
                    <th className="pb-2 pr-4 whitespace-nowrap">Vencimiento</th>
                    <th className="pb-2 pr-4 text-right whitespace-nowrap">Debe</th>
                    <th className="pb-2 pr-4 text-right whitespace-nowrap">Haber</th>
                    <th className="pb-2 pr-4 text-right whitespace-nowrap">Saldo Acumulado</th>
                    <th className="pb-2 pr-4 whitespace-nowrap">Estado</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-b border-slate-200/50 dark:border-slate-800/50">
                      <td className="py-2 pr-4 whitespace-nowrap text-slate-600 dark:text-slate-400">
                        {formatDate(entry.date)}
                      </td>
                      <td className="py-2 pr-4">
                        <span className="text-xs text-slate-500">{TYPE_LABELS[entry.type]}</span>
                        <br />
                        {entry.documentNumber}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap text-slate-600 dark:text-slate-400">
                        {entry.dueDate ? formatDate(entry.dueDate) : '—'}
                      </td>
                      <td className="py-2 pr-4 text-right text-slate-800 dark:text-slate-200">
                        {Number(entry.debe) > 0 ? `$${money(entry.debe)}` : ''}
                      </td>
                      <td className="py-2 pr-4 text-right text-slate-800 dark:text-slate-200">
                        {Number(entry.haber) > 0 ? `$${money(entry.haber)}` : ''}
                      </td>
                      <td className="py-2 pr-4 text-right font-medium text-slate-900 dark:text-slate-100">
                        ${money(entry.balance)}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                        {entry.status ?? '—'}
                      </td>
                      <td className="py-2">
                        {entry.type === 'INVOICE' && (
                          <button
                            onClick={() =>
                              setDetailFor({ id: entry.id, ...parseInvoiceDocumentNumber(entry.documentNumber) })
                            }
                            className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                          >
                            Ver detalle
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {detailFor && (
        <InvoiceDetailPanel
          invoice={{ ...detailFor, customerName: statement?.customerName ?? '' }}
          onClose={() => setDetailFor(null)}
        />
      )}
    </div>
  );
}
