'use client';

import { vatBookApi, type VatBookEntry, type VatBookResult } from '@/lib/taxes';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import DateRangeFilter from '../reports/DateRangeFilter';
import { currentMonthRange } from '../reports/dateRange';

type BookKind = 'sales' | 'purchases';

const BOOK_TABS: { id: BookKind; label: string }[] = [
  { id: 'sales', label: 'IVA Ventas' },
  { id: 'purchases', label: 'IVA Compras' },
];

function money(value: number): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numberLabel(entry: VatBookEntry): string {
  return entry.pointOfSale ? `${entry.pointOfSale}-${entry.number}` : entry.number;
}

const thClass = 'pb-2 pr-4 text-right whitespace-nowrap';
const tdClass = 'py-2 pr-4 text-right whitespace-nowrap tabular-nums';

const PAGE_SIZE = 50;

export default function VatBookTab() {
  const [kind, setKind] = useState<BookKind>('sales');
  const [{ from, to }, setRange] = useState(currentMonthRange());
  const [page, setPage] = useState(1);
  const [citiSkippedCount, setCitiSkippedCount] = useState<number | null>(null);

  const query = useQuery({
    queryKey: ['vat-book', kind, from, to],
    queryFn: () => (kind === 'sales' ? vatBookApi.getSales({ from, to }) : vatBookApi.getPurchases({ from, to })),
  });

  const result: VatBookResult | undefined = query.data;
  const entries = result?.entries ?? [];
  // Paginado en el cliente, no en el servidor - el backend ya trae todo
  // el período en una sola respuesta (necesario de todos modos para que
  // "Totales acumulados" sume el período completo, no sólo la página
  // visible, y para que Excel/PDF exporten todo sin otro viaje al
  // servidor). Un mes real de una PyME entra cómodo en memoria.
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedEntries = entries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function switchKind(next: BookKind) {
    setKind(next);
    setPage(1);
    setCitiSkippedCount(null);
  }

  async function handleExportExcel() {
    if (kind === 'sales') await vatBookApi.downloadSalesExcel({ from, to });
    else await vatBookApi.downloadPurchasesExcel({ from, to });
  }

  async function handlePrintPdf() {
    if (kind === 'sales') await vatBookApi.openSalesPdf({ from, to });
    else await vatBookApi.openPurchasesPdf({ from, to });
  }

  async function handleDownloadCitiCbte() {
    if (kind === 'sales') {
      await vatBookApi.downloadVentasCbteCiti({ from, to });
      setCitiSkippedCount(null);
    } else {
      setCitiSkippedCount(await vatBookApi.downloadComprasCbteCiti({ from, to }));
    }
  }

  async function handleDownloadCitiAlicuotas() {
    if (kind === 'sales') {
      await vatBookApi.downloadVentasAlicuotasCiti({ from, to });
      setCitiSkippedCount(null);
    } else {
      setCitiSkippedCount(await vatBookApi.downloadComprasAlicuotasCiti({ from, to }));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {BOOK_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => switchKind(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              kind === t.id
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter
          from={from}
          to={to}
          onFromChange={(value) => {
            setRange((r) => ({ ...r, from: value }));
            setPage(1);
            setCitiSkippedCount(null);
          }}
          onToChange={(value) => {
            setRange((r) => ({ ...r, to: value }));
            setPage(1);
            setCitiSkippedCount(null);
          }}
          onPreset={(r) => {
            setRange(r);
            setPage(1);
            setCitiSkippedCount(null);
          }}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={entries.length === 0}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Exportar Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={handlePrintPdf}
            disabled={entries.length === 0}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Imprimir / Exportar PDF
          </button>
          <span className="mx-1 self-center text-slate-300 dark:text-slate-700">|</span>
          <span className="self-center text-xs text-slate-500">Libro de IVA Digital (RG 4597):</span>
          <button
            type="button"
            onClick={handleDownloadCitiCbte}
            disabled={entries.length === 0}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Cabecera (.txt)
          </button>
          <button
            type="button"
            onClick={handleDownloadCitiAlicuotas}
            disabled={entries.length === 0}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Alícuotas (.txt)
          </button>
        </div>
      </div>

      {kind === 'purchases' && (
        <p className="text-xs text-slate-500">
          Los comprobantes de compra cargados sin desglose de alícuota (o de antes de esta función) caen en la
          columna "IVA Otras".
        </p>
      )}

      {kind === 'purchases' && citiSkippedCount !== null && citiSkippedCount > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {citiSkippedCount} comprobante{citiSkippedCount === 1 ? '' : 's'} de compra quedó
          {citiSkippedCount === 1 ? '' : 'aron'} afuera del archivo (falta Tipo/Punto de Venta/Número, es en
          moneda distinta de ARS, o tiene una línea de IVA sin alícuota cargada).
        </p>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        {query.isLoading ? (
          <div className="flex h-24 items-center justify-center text-slate-500">Cargando...</div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-600">Sin comprobantes en el período</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                  <th className="pb-2 pr-4 whitespace-nowrap">Fecha</th>
                  <th className="pb-2 pr-4 whitespace-nowrap">Comprobante</th>
                  <th className="pb-2 pr-4 whitespace-nowrap">Número</th>
                  <th className="pb-2 pr-4 whitespace-nowrap">Razón Social</th>
                  <th className="pb-2 pr-4 whitespace-nowrap">Tipo Doc</th>
                  <th className="pb-2 pr-4 whitespace-nowrap">CUIT/DNI</th>
                  <th className="pb-2 pr-4 whitespace-nowrap">Cond. IVA</th>
                  <th className={thClass}>Neto Grav.</th>
                  <th className={thClass}>Exento</th>
                  <th className={thClass}>No Grav.</th>
                  <th className={thClass}>IVA 21%</th>
                  <th className={thClass}>IVA 10,5%</th>
                  <th className={thClass}>IVA 27%</th>
                  <th className={thClass}>IVA Otras</th>
                  <th className={thClass}>Percepciones</th>
                  <th className={thClass}>IVA Total</th>
                  <th className={thClass}>Total</th>
                </tr>
              </thead>
              <tbody>
                {pagedEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={`border-b border-slate-200/50 dark:border-slate-800/50 ${
                      entry.isCreditNote ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <td className="py-2 pr-4 whitespace-nowrap">{entry.date}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{entry.documentType}</td>
                    <td className="py-2 pr-4 whitespace-nowrap font-mono text-xs">{numberLabel(entry)}</td>
                    <td className="py-2 pr-4">{entry.counterpartyName}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{entry.counterpartyDocType}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{entry.counterpartyTaxId ?? '—'}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{entry.taxCondition ?? '—'}</td>
                    <td className={tdClass}>{money(entry.netTaxed)}</td>
                    <td className={tdClass}>{money(entry.netExempt)}</td>
                    <td className={tdClass}>{money(entry.netUntaxed)}</td>
                    <td className={tdClass}>{money(entry.vat21)}</td>
                    <td className={tdClass}>{money(entry.vat10_5)}</td>
                    <td className={tdClass}>{money(entry.vat27)}</td>
                    <td className={tdClass}>{money(entry.vatOther)}</td>
                    <td className={tdClass}>{money(entry.perceptions)}</td>
                    <td className={tdClass}>{money(entry.vatTotal)}</td>
                    <td className={`${tdClass} font-medium text-slate-900 dark:text-slate-100`}>
                      {money(entry.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {result && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-slate-700 font-semibold text-slate-900 dark:text-slate-100">
                    <td className="py-2 pr-4" colSpan={7}>
                      Totales
                    </td>
                    <td className={tdClass}>{money(result.totals.netTaxed)}</td>
                    <td className={tdClass}>{money(result.totals.netExempt)}</td>
                    <td className={tdClass}>{money(result.totals.netUntaxed)}</td>
                    <td className={tdClass}>{money(result.totals.vat21)}</td>
                    <td className={tdClass}>{money(result.totals.vat10_5)}</td>
                    <td className={tdClass}>{money(result.totals.vat27)}</td>
                    <td className={tdClass}>{money(result.totals.vatOther)}</td>
                    <td className={tdClass}>{money(result.totals.perceptions)}</td>
                    <td className={tdClass}>{money(result.totals.vatTotal)}</td>
                    <td className={tdClass}>{money(result.totals.total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        {pageCount > 1 && (
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-xs text-slate-500">
              Página {currentPage} de {pageCount} ({entries.length} comprobantes)
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={currentPage === pageCount}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
