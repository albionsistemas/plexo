'use client';

import { reportsApi, type CashflowLineItem, type CashflowProjectionParams, type CashflowWeekBucket } from '@/lib/reports';
import { useTheme } from '@/providers/ThemeProvider';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const PERIODS: { id: '30' | '60' | '90'; label: string }[] = [
  { id: '30', label: '30 Días' },
  { id: '60', label: '60 Días' },
  { id: '90', label: '90 Días' },
];

function money(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function formatShort(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-AR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' });
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone?: 'positive' | 'negative' | 'neutral' }) {
  const color =
    tone === 'negative'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'positive'
        ? 'text-green-600 dark:text-green-400'
        : 'text-slate-900 dark:text-slate-100';
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{money(value)}</p>
    </div>
  );
}

function LineItemRows({ items, direction }: { items: CashflowLineItem[]; direction: 'in' | 'out' }) {
  if (items.length === 0) return null;
  return (
    <>
      {items.map((item) => (
        <tr key={`${item.type}-${item.id}`} className="border-b border-slate-200/40 dark:border-slate-800/40">
          <td className="py-1.5 pl-6 pr-4 text-xs text-slate-500">
            {item.type === 'INVOICE' ? 'Factura' : 'Cheque'}
          </td>
          <td className="py-1.5 pr-4 text-xs text-slate-700 dark:text-slate-300">{item.reference}</td>
          <td className="py-1.5 pr-4 text-xs text-slate-600 dark:text-slate-400">{item.counterparty ?? '—'}</td>
          <td className="py-1.5 pr-4 text-xs text-slate-500">{item.dueDate ? formatShort(item.dueDate) : '—'}</td>
          <td
            className={`py-1.5 pr-4 text-right text-xs font-medium ${
              direction === 'in' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {direction === 'in' ? '+' : '-'}
            {money(item.amount)}
          </td>
        </tr>
      ))}
    </>
  );
}

function WeekRow({ week, index, expanded, onToggle }: { week: CashflowWeekBucket; index: number; expanded: boolean; onToggle: () => void }) {
  const hasDetail =
    week.invoiceInflows.length + week.checkInflows.length + week.invoiceOutflows.length + week.checkOutflows.length > 0;

  return (
    <>
      <tr
        onClick={hasDetail ? onToggle : undefined}
        className={`border-b border-slate-200/50 dark:border-slate-800/50 ${hasDetail ? 'cursor-pointer hover:bg-slate-200/30 dark:hover:bg-slate-800/30' : ''}`}
      >
        <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">
          {hasDetail && <span className="mr-1 text-slate-400">{expanded ? '▾' : '▸'}</span>}
          Semana {index + 1} ({formatShort(week.weekStart)} - {formatShort(week.weekEnd)})
        </td>
        <td className="py-2 pr-4 text-right text-green-600 dark:text-green-400">{money(week.inflows)}</td>
        <td className="py-2 pr-4 text-right text-red-600 dark:text-red-400">{money(week.outflows)}</td>
        <td className="py-2 pr-4 text-right font-medium text-slate-800 dark:text-slate-200">{money(week.netChange)}</td>
        <td
          className={`py-2 pr-4 text-right font-semibold ${
            week.projectedBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          {money(week.projectedBalance)}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="p-0">
            <table className="w-full">
              <tbody>
                <LineItemRows items={week.invoiceInflows} direction="in" />
                <LineItemRows items={week.checkInflows} direction="in" />
                <LineItemRows items={week.invoiceOutflows} direction="out" />
                <LineItemRows items={week.checkOutflows} direction="out" />
                {!hasDetail && (
                  <tr>
                    <td className="py-1.5 pl-6 text-xs text-slate-500">Sin comprobantes en esta semana</td>
                  </tr>
                )}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

export default function CashflowTab() {
  const { theme } = useTheme();
  const [period, setPeriod] = useState<'30' | '60' | '90'>('30');
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  const params: CashflowProjectionParams = { period };
  const { data, isLoading, isError } = useQuery({
    queryKey: ['cashflow-projection', params],
    queryFn: () => reportsApi.getCashflowProjection(params),
  });

  function toggleWeek(weekStart: string) {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekStart)) next.delete(weekStart);
      else next.add(weekStart);
      return next;
    });
  }

  const chartData = (data?.weeks ?? []).map((w, i) => ({
    label: `S${i + 1}`,
    range: `${formatShort(w.weekStart)} - ${formatShort(w.weekEnd)}`,
    balance: w.projectedBalance,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                period === p.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              data &&
              reportsApi.downloadCashflowProjectionExcel(params, {
                fromDate: data.fromDate,
                toDate: data.toDate,
              })
            }
            disabled={!data}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Exportar Excel
          </button>
          <button
            onClick={() => window.print()}
            disabled={!data}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Imprimir / Exportar PDF
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center text-slate-500">Cargando...</div>
      ) : isError || !data ? (
        <p className="text-sm text-red-600 dark:text-red-400">No se pudo calcular la proyección de flujo de caja</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Saldo Actual" value={data.openingBalance} />
            <KpiCard label="Ingresos Proyectados" value={data.totalInflows} tone="positive" />
            <KpiCard label="Egresos Proyectados" value={data.totalOutflows} tone="negative" />
            <KpiCard
              label="Posición Neta al Cierre"
              value={data.closingBalance}
              tone={data.closingBalance < 0 ? 'negative' : 'neutral'}
            />
          </div>

          {data.hasNegativeWeek && (
            <p className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              El saldo proyectado cae por debajo de cero en al menos una semana dentro de este horizonte.
            </p>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
            <h2 className="mb-4 text-sm font-medium text-slate-600 dark:text-slate-400">
              Saldo proyectado por semana ({data.fromDate} a {data.toDate})
            </h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#1e293b' : '#e2e8f0'} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme === 'dark' ? '#94a3b8' : '#475569' }} />
                <YAxis tick={{ fontSize: 11, fill: theme === 'dark' ? '#94a3b8' : '#475569' }} width={70} />
                <ReferenceLine y={0} stroke={theme === 'dark' ? '#475569' : '#94a3b8'} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
                    border: `1px solid ${theme === 'dark' ? '#1e293b' : '#e2e8f0'}`,
                  }}
                  labelStyle={{ color: theme === 'dark' ? '#94a3b8' : '#475569' }}
                  formatter={(v) => [money(Number(v ?? 0)), 'Saldo proyectado']}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.range ?? ''}
                />
                <Bar dataKey="balance" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.balance < 0 ? '#dc2626' : '#6366f1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4 overflow-x-auto">
            <h2 className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-400">Auditoría por semana</h2>
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                  <th className="pb-2 pr-4">Semana</th>
                  <th className="pb-2 pr-4 text-right">Ingresos</th>
                  <th className="pb-2 pr-4 text-right">Egresos</th>
                  <th className="pb-2 pr-4 text-right">Neto</th>
                  <th className="pb-2 pr-4 text-right">Saldo proyectado</th>
                </tr>
              </thead>
              <tbody>
                {data.weeks.map((week, i) => (
                  <WeekRow
                    key={week.weekStart}
                    week={week}
                    index={i}
                    expanded={expandedWeeks.has(week.weekStart)}
                    onToggle={() => toggleWeek(week.weekStart)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
