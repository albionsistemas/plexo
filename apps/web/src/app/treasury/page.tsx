'use client';

import { companiesApi } from '@/lib/companies';
import { reportsApi } from '@/lib/reports';
import {
  CHECK_KIND_LABELS,
  describeCheckStatus,
  treasuryApi,
  type Check,
  type CheckKind,
  type CheckStatus,
} from '@/lib/treasury';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';
import DateRangeFilter from '../reports/DateRangeFilter';
import DepositCheckModal from './DepositCheckModal';
import RejectCheckModal from './RejectCheckModal';

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

const STATUS_OPTIONS: CheckStatus[] = [
  'PORTFOLIO',
  'DEPOSITED',
  'ENDORSED',
  'ISSUED',
  'CLEARED',
  'REJECTED',
  'VOIDED',
];

export default function TreasuryPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<CheckStatus | ''>('');
  const [kind, setKind] = useState<CheckKind | ''>('');
  const [bankName, setBankName] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [depositing, setDepositing] = useState<Check | null>(null);
  const [rejecting, setRejecting] = useState<Check | null>(null);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const checksQuery = useQuery({
    queryKey: ['checks', { status, kind, bankName, dueFrom, dueTo }],
    queryFn: () =>
      treasuryApi.listChecks({
        status: status || undefined,
        kind: kind || undefined,
        bankName: bankName || undefined,
        dueFrom: dueFrom || undefined,
        dueTo: dueTo || undefined,
      }),
  });
  const checks = checksQuery.data ?? [];

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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Cartera de Cheques</h1>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          Estado
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as CheckStatus | '')}>
            <option value="">Todos</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {describeCheckStatus(s).label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          Tipo
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as CheckKind | '')}>
            <option value="">Todos</option>
            <option value="THIRD_PARTY">{CHECK_KIND_LABELS.THIRD_PARTY}</option>
            <option value="OWN">{CHECK_KIND_LABELS.OWN}</option>
          </select>
        </label>
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

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        {checksQuery.isLoading ? (
          <div className="flex h-24 items-center justify-center text-slate-500">Cargando...</div>
        ) : checks.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-600">No hay cheques que coincidan con el filtro</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">Vencimiento</th>
                <th className="pb-2 pr-4">Tipo</th>
                <th className="pb-2 pr-4">Número / Banco</th>
                <th className="pb-2 pr-4">Cliente / Proveedor</th>
                <th className="pb-2 pr-4">Cuenta</th>
                <th className="pb-2 pr-4 text-right">Monto</th>
                <th className="pb-2 pr-4">Estado</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {checks.map((check) => {
                const badge = describeCheckStatus(check.status);
                // Endosado: prioriza a quién se le entregó (supplierId) por
                // sobre quién lo trajo originalmente (customerId) - ambos
                // quedan poblados en ese estado, ver CheckService.endorseCheck.
                const companyId =
                  check.status === 'ENDORSED'
                    ? (check.supplierId ?? check.customerId)
                    : (check.customerId ?? check.supplierId);
                const canDeposit = check.kind === 'THIRD_PARTY' && check.status === 'PORTFOLIO';
                const canClear =
                  (check.kind === 'THIRD_PARTY' && check.status === 'DEPOSITED') ||
                  (check.kind === 'OWN' && check.status === 'ISSUED');
                const canReject =
                  check.kind === 'THIRD_PARTY' &&
                  (check.status === 'PORTFOLIO' || check.status === 'DEPOSITED' || check.status === 'ENDORSED');

                return (
                  <tr key={check.id} className="border-b border-slate-200/50 dark:border-slate-800/50 align-top">
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                      {new Date(check.dueDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                    </td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{CHECK_KIND_LABELS[check.kind]}</td>
                    <td className="py-2 pr-4">
                      <p className="text-slate-800 dark:text-slate-200">{check.number}</p>
                      <p className="text-xs text-slate-500">{check.bankName}</p>
                    </td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                      {companyId ? (companyNameById.get(companyId) ?? '—') : '—'}
                    </td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                      {check.financialAccountId ? (accountNameById.get(check.financialAccountId) ?? '—') : '—'}
                    </td>
                    <td className="py-2 pr-4 text-right font-medium text-slate-900 dark:text-slate-100">
                      ${Number(check.amount).toFixed(2)}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.colorClass}`}>
                        {badge.label}
                      </span>
                      {check.status === 'REJECTED' && check.rejectionReason && (
                        <p className="mt-1 text-xs text-slate-500">{check.rejectionReason}</p>
                      )}
                    </td>
                    <td className="py-2 text-right">
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
                              Acreditar
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {depositing && (
        <DepositCheckModal check={depositing} accounts={accounts} onClose={() => setDepositing(null)} />
      )}
      {rejecting && <RejectCheckModal check={rejecting} onClose={() => setRejecting(null)} />}
    </div>
  );
}
