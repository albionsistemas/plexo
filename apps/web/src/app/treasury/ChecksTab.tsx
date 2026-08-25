'use client';

import { companiesApi } from '@/lib/companies';
import { reportsApi } from '@/lib/reports';
import { describeCheckStatus, treasuryApi, type Check, type CheckStatus } from '@/lib/treasury';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useMemo, useState } from 'react';
import DateRangeFilter from '../reports/DateRangeFilter';
import DepositCheckModal from './DepositCheckModal';
import RejectCheckModal from './RejectCheckModal';

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { timeZone: 'UTC' });
}

function money(amount: string) {
  return `$${Number(amount).toFixed(2)}`;
}

/** Comparación por fecha calendario (YYYY-MM-DD), no por instante - evita
 * el mismo corrimiento de huso horario que ya se corrigió en la columna de
 * vencimiento (ver PROGRESS.md, sesión 2026-08-25). */
function isoDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

const SUB_TABS = [
  { id: 'portfolio', label: 'En Cartera' },
  { id: 'history', label: 'Depositados / Endosados' },
  { id: 'own', label: 'Cheques Propios Emitidos' },
] as const;
type SubTabId = (typeof SUB_TABS)[number]['id'];

const OWN_STATUS_OPTIONS: CheckStatus[] = ['ISSUED', 'CLEARED', 'VOIDED'];

export default function ChecksTab() {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<SubTabId>('portfolio');
  const [ownStatus, setOwnStatus] = useState<CheckStatus | ''>('');
  const [bankName, setBankName] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [depositing, setDepositing] = useState<Check | null>(null);
  const [rejecting, setRejecting] = useState<Check | null>(null);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Trae todo una sola vez (el volumen real de cheques de un tenant es
  // chico) y filtra/agrupa en cliente - mismos KPIs y pestañas siempre
  // consistentes entre sí, sin re-fetch por cada cambio de pestaña.
  const checksQuery = useQuery({ queryKey: ['checks'], queryFn: () => treasuryApi.listChecks() });
  const allChecks = useMemo(() => checksQuery.data ?? [], [checksQuery.data]);

  const companiesQuery = useQuery({ queryKey: ['companies', 'all'], queryFn: () => companiesApi.list() });
  const companyNameById = new Map((companiesQuery.data ?? []).map((c) => [c.id, c.name]));

  const accountsQuery = useQuery({ queryKey: ['financial-accounts'], queryFn: reportsApi.listFinancialAccounts });
  const accounts = accountsQuery.data ?? [];
  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));

  const clearMutation = useMutation({
    mutationFn: (id: string) => treasuryApi.markCleared(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checks'] });
      void queryClient.invalidateQueries({ queryKey: ['financial-accounts'] });
      setClearingId(null);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo acreditar el cheque';
      setError(Array.isArray(message) ? message.join(', ') : message);
      setClearingId(null);
    },
  });

  const kpis = useMemo(() => {
    const inPortfolio = allChecks.filter((c) => c.kind === 'THIRD_PARTY' && c.status === 'PORTFOLIO');
    const today = isoDateOnly(new Date());
    const in7Days = isoDateOnly(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const dueSoon = allChecks.filter((c) => {
      if (c.kind !== 'THIRD_PARTY' || (c.status !== 'PORTFOLIO' && c.status !== 'DEPOSITED')) return false;
      const due = c.dueDate.slice(0, 10);
      return due >= today && due <= in7Days;
    });
    const ownIssued = allChecks.filter((c) => c.kind === 'OWN' && c.status === 'ISSUED');
    const sum = (list: Check[]) => list.reduce((acc, c) => acc + Number(c.amount), 0);
    return {
      portfolioTotal: sum(inPortfolio),
      portfolioCount: inPortfolio.length,
      dueSoonTotal: sum(dueSoon),
      dueSoonCount: dueSoon.length,
      ownIssuedTotal: sum(ownIssued),
      ownIssuedCount: ownIssued.length,
    };
  }, [allChecks]);

  const bankDateFiltered = useMemo(() => {
    return allChecks.filter((c) => {
      if (bankName && !c.bankName.toLowerCase().includes(bankName.toLowerCase())) return false;
      if (dueFrom && c.dueDate.slice(0, 10) < dueFrom) return false;
      if (dueTo && c.dueDate.slice(0, 10) > dueTo) return false;
      return true;
    });
  }, [allChecks, bankName, dueFrom, dueTo]);

  const portfolioRows = bankDateFiltered.filter((c) => c.kind === 'THIRD_PARTY' && c.status === 'PORTFOLIO');
  const historyRows = bankDateFiltered.filter(
    (c) => c.kind === 'THIRD_PARTY' && c.status !== 'PORTFOLIO',
  );
  const ownRows = bankDateFiltered.filter((c) => c.kind === 'OWN' && (!ownStatus || c.status === ownStatus));

  function resolveCompanyName(check: Check) {
    // Endosado: prioriza a quién se le entregó (supplierId) por sobre
    // quién lo trajo originalmente (customerId) - ambos quedan poblados
    // en ese estado, ver CheckService.endorseCheck.
    const companyId =
      check.status === 'ENDORSED' ? (check.supplierId ?? check.customerId) : (check.customerId ?? check.supplierId);
    return companyId ? (companyNameById.get(companyId) ?? '—') : '—';
  }

  function ActionsCell({ check }: { check: Check }) {
    const canDeposit = check.kind === 'THIRD_PARTY' && check.status === 'PORTFOLIO';
    const canClear =
      (check.kind === 'THIRD_PARTY' && check.status === 'DEPOSITED') ||
      (check.kind === 'OWN' && check.status === 'ISSUED');
    const canReject =
      check.kind === 'THIRD_PARTY' &&
      (check.status === 'PORTFOLIO' || check.status === 'DEPOSITED' || check.status === 'ENDORSED');

    if (!canDeposit && !canClear && !canReject) return <span className="text-xs text-slate-500">—</span>;

    return (
      <div className="flex flex-wrap justify-end gap-2">
        {canDeposit && (
          <button
            onClick={() => setDepositing(check)}
            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 transition hover:text-indigo-700 dark:hover:text-indigo-300"
          >
            Depositar
          </button>
        )}
        {canClear &&
          (clearingId === check.id ? (
            <span className="flex items-center gap-2">
              <button
                onClick={() => clearMutation.mutate(check.id)}
                disabled={clearMutation.isPending}
                className="text-xs font-medium text-green-600 dark:text-green-400 disabled:opacity-50"
              >
                Confirmar
              </button>
              <button
                onClick={() => setClearingId(null)}
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Volver
              </button>
            </span>
          ) : (
            <button
              onClick={() => setClearingId(check.id)}
              className="text-xs font-medium text-green-600 dark:text-green-400 transition hover:text-green-700 dark:hover:text-green-300"
            >
              {check.kind === 'OWN' ? 'Acreditado en Banco' : 'Acreditar'}
            </button>
          ))}
        {canReject && (
          <button
            onClick={() => setRejecting(check)}
            className="text-xs font-medium text-red-600 dark:text-red-400 transition hover:text-red-700 dark:hover:text-red-300"
          >
            Rechazar
          </button>
        )}
      </div>
    );
  }

  function StatusBadge({ check }: { check: Check }) {
    const badge = describeCheckStatus(check.status);
    return (
      <>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.colorClass}`}>{badge.label}</span>
        {check.status === 'REJECTED' && check.rejectionReason && (
          <p className="mt-1 text-xs text-slate-500">{check.rejectionReason}</p>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Total en Cartera</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            ${kpis.portfolioTotal.toFixed(2)}
          </p>
          <p className="text-xs text-slate-500">{kpis.portfolioCount} cheque(s) sin depositar</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Por Vencer (7 días)</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600 dark:text-amber-400">
            ${kpis.dueSoonTotal.toFixed(2)}
          </p>
          <p className="text-xs text-slate-500">{kpis.dueSoonCount} cheque(s) de terceros</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Cheques Propios Emitidos</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            ${kpis.ownIssuedTotal.toFixed(2)}
          </p>
          <p className="text-xs text-slate-500">{kpis.ownIssuedCount} pendiente(s) de acreditar</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          Banco
          <input
            className={inputClass}
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="Filtrar por banco"
          />
        </label>
        <DateRangeFilter
          from={dueFrom}
          to={dueTo}
          onFromChange={setDueFrom}
          onToChange={setDueTo}
          onPreset={(range) => {
            setDueFrom(range.from);
            setDueTo(range.to);
          }}
        />
      </div>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-3 py-2 text-sm font-medium transition ${
              subTab === t.id
                ? 'border-b-2 border-indigo-500 text-slate-900 dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4 overflow-x-auto">
        {checksQuery.isLoading ? (
          <div className="flex h-24 items-center justify-center text-slate-500">Cargando...</div>
        ) : subTab === 'portfolio' ? (
          portfolioRows.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-600">Sin cheques de terceros en cartera</p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                  <th className="pb-2 pr-4">Emisión</th>
                  <th className="pb-2 pr-4">Vencimiento</th>
                  <th className="pb-2 pr-4">Banco</th>
                  <th className="pb-2 pr-4">CUIT Firmante</th>
                  <th className="pb-2 pr-4">Número</th>
                  <th className="pb-2 pr-4 text-right">Monto</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {portfolioRows.map((check) => (
                  <tr key={check.id} className="border-b border-slate-200/50 dark:border-slate-800/50">
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{formatDate(check.issueDate)}</td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{formatDate(check.dueDate)}</td>
                    <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{check.bankName}</td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{check.drawerCuit ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">{check.number}</td>
                    <td className="py-2 pr-4 text-right font-medium text-slate-900 dark:text-slate-100">
                      {money(check.amount)}
                    </td>
                    <td className="py-2 text-right">
                      <ActionsCell check={check} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : subTab === 'history' ? (
          historyRows.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-600">Sin movimientos históricos de cheques de terceros</p>
          ) : (
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                  <th className="pb-2 pr-4">Vencimiento</th>
                  <th className="pb-2 pr-4">Número / Banco</th>
                  <th className="pb-2 pr-4">Estado</th>
                  <th className="pb-2 pr-4">Depositado en / Endosado a</th>
                  <th className="pb-2 pr-4 text-right">Monto</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {historyRows.map((check) => (
                  <tr key={check.id} className="border-b border-slate-200/50 dark:border-slate-800/50 align-top">
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{formatDate(check.dueDate)}</td>
                    <td className="py-2 pr-4">
                      <p className="text-slate-800 dark:text-slate-200">{check.number}</p>
                      <p className="text-xs text-slate-500">{check.bankName}</p>
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge check={check} />
                    </td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                      {check.status === 'ENDORSED'
                        ? resolveCompanyName(check)
                        : check.financialAccountId
                          ? (accountNameById.get(check.financialAccountId) ?? '—')
                          : '—'}
                    </td>
                    <td className="py-2 pr-4 text-right font-medium text-slate-900 dark:text-slate-100">
                      {money(check.amount)}
                    </td>
                    <td className="py-2 text-right">
                      <ActionsCell check={check} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : ownRows.length === 0 ? (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end">
              <select
                className={inputClass}
                value={ownStatus}
                onChange={(e) => setOwnStatus(e.target.value as CheckStatus | '')}
              >
                <option value="">Todos los estados</option>
                {OWN_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {describeCheckStatus(s).label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-sm text-slate-400 dark:text-slate-600">Sin cheques propios emitidos</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end">
              <select
                className={inputClass}
                value={ownStatus}
                onChange={(e) => setOwnStatus(e.target.value as CheckStatus | '')}
              >
                <option value="">Todos los estados</option>
                {OWN_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {describeCheckStatus(s).label}
                  </option>
                ))}
              </select>
            </div>
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                  <th className="pb-2 pr-4">Emisión</th>
                  <th className="pb-2 pr-4">Vencimiento</th>
                  <th className="pb-2 pr-4">Número</th>
                  <th className="pb-2 pr-4">Banco</th>
                  <th className="pb-2 pr-4">Proveedor</th>
                  <th className="pb-2 pr-4">Cuenta</th>
                  <th className="pb-2 pr-4 text-right">Monto</th>
                  <th className="pb-2 pr-4">Estado</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {ownRows.map((check) => (
                  <tr key={check.id} className="border-b border-slate-200/50 dark:border-slate-800/50 align-top">
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{formatDate(check.issueDate)}</td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{formatDate(check.dueDate)}</td>
                    <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">{check.number}</td>
                    <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{check.bankName}</td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{resolveCompanyName(check)}</td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                      {check.financialAccountId ? (accountNameById.get(check.financialAccountId) ?? '—') : '—'}
                    </td>
                    <td className="py-2 pr-4 text-right font-medium text-slate-900 dark:text-slate-100">
                      {money(check.amount)}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge check={check} />
                    </td>
                    <td className="py-2 text-right">
                      <ActionsCell check={check} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {depositing && (
        <DepositCheckModal check={depositing} accounts={accounts} onClose={() => setDepositing(null)} />
      )}
      {rejecting && <RejectCheckModal check={rejecting} onClose={() => setRejecting(null)} />}
    </div>
  );
}
