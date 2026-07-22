'use client';

import { reportsApi } from '@/lib/reports';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import DateRangeFilter from './DateRangeFilter';
import { currentMonthRange } from './dateRange';

export default function SalesTab() {
  const [{ from, to }, setRange] = useState(currentMonthRange());

  const byCustomerQuery = useQuery({
    queryKey: ['reports-sales-by-customer', from, to],
    queryFn: () => reportsApi.getSalesByCustomer({ from, to }),
  });
  const byProductQuery = useQuery({
    queryKey: ['reports-sales-by-product', from, to],
    queryFn: () => reportsApi.getSalesByProduct({ from, to }),
  });

  const byCustomer = byCustomerQuery.data ?? [];
  const byProduct = byProductQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <DateRangeFilter
        from={from}
        to={to}
        onFromChange={(value) => setRange((r) => ({ ...r, from: value }))}
        onToChange={(value) => setRange((r) => ({ ...r, to: value }))}
      />

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Ventas por cliente</h2>
        {byCustomerQuery.isLoading ? (
          <div className="flex h-24 items-center justify-center text-slate-500">Cargando...</div>
        ) : byCustomer.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-600">Sin ventas en el período</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">Cliente</th>
                <th className="pb-2 pr-4 text-right">Facturas</th>
                <th className="pb-2 text-right">Total vendido</th>
              </tr>
            </thead>
            <tbody>
              {byCustomer.map((row) => (
                <tr key={row.customerId} className="border-b border-slate-200/50 dark:border-slate-800/50">
                  <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">{row.customerName}</td>
                  <td className="py-2 pr-4 text-right text-slate-600 dark:text-slate-400">{row.invoiceCount}</td>
                  <td className="py-2 text-right font-medium text-slate-900 dark:text-slate-100">
                    ${Number(row.totalSales).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Ventas por producto</h2>
        {byProductQuery.isLoading ? (
          <div className="flex h-24 items-center justify-center text-slate-500">Cargando...</div>
        ) : byProduct.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-600">Sin ventas en el período</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">SKU</th>
                <th className="pb-2 pr-4">Artículo</th>
                <th className="pb-2 pr-4 text-right">Cantidad</th>
                <th className="pb-2 text-right">Ingresos</th>
              </tr>
            </thead>
            <tbody>
              {byProduct.map((row) => (
                <tr key={row.articleVariantId} className="border-b border-slate-200/50 dark:border-slate-800/50">
                  <td className="py-2 pr-4 font-mono text-xs text-slate-600 dark:text-slate-400">{row.sku}</td>
                  <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">{row.articleName}</td>
                  <td className="py-2 pr-4 text-right text-slate-600 dark:text-slate-400">{row.quantitySold}</td>
                  <td className="py-2 text-right font-medium text-slate-900 dark:text-slate-100">
                    ${Number(row.revenue).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
