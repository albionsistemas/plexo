'use client';

import { invoicingApi, type Invoice } from '@/lib/invoicing';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  invoice: Invoice;
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

const METHODS = ['CASH', 'BANK_TRANSFER', 'CARD', 'CHECK'] as const;
const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  CHECK: 'Cheque',
};

export default function ReceiptModal({ invoice, onClose }: Props) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(invoice.balanceDue);
  const [method, setMethod] = useState<(typeof METHODS)[number]>('CASH');
  const [checkNumber, setCheckNumber] = useState('');
  const [checkBankName, setCheckBankName] = useState('');
  const [checkDrawerCuit, setCheckDrawerCuit] = useState('');
  const [checkFormat, setCheckFormat] = useState<'PHYSICAL' | 'ECHEQ'>('PHYSICAL');
  const [checkIssueDate, setCheckIssueDate] = useState('');
  const [checkDueDate, setCheckDueDate] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      invoicingApi.recordReceipt({
        invoiceId: invoice.id,
        amount: Number(amount),
        method,
        check:
          method === 'CHECK'
            ? {
                number: checkNumber,
                bankName: checkBankName,
                drawerCuit: checkDrawerCuit || undefined,
                format: checkFormat,
                issueDate: checkIssueDate,
                dueDate: checkDueDate,
              }
            : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['checks'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo registrar el cobro';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (Number(amount) <= 0) {
      setError('El monto debe ser mayor a cero');
      return;
    }
    if (method === 'CHECK') {
      if (!checkNumber.trim() || !checkBankName.trim() || !checkIssueDate || !checkDueDate) {
        setError('Completá número, banco, fecha de emisión y de vencimiento del cheque');
        return;
      }
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Registrar cobro</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          {invoice.documentLetter}-{invoice.number} · saldo pendiente ${invoice.balanceDue}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Monto</label>
            <input
              type="number"
              step="any"
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Método</label>
            <select
              className={inputClass}
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          {method === 'CHECK' && (
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs text-slate-500">
                  Número
                  <input
                    className={inputClass}
                    value={checkNumber}
                    onChange={(e) => setCheckNumber(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-500">
                  Banco
                  <input
                    className={inputClass}
                    value={checkBankName}
                    onChange={(e) => setCheckBankName(e.target.value)}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs text-slate-500">
                  CUIT librador (opcional)
                  <input
                    className={inputClass}
                    value={checkDrawerCuit}
                    onChange={(e) => setCheckDrawerCuit(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-500">
                  Formato
                  <select
                    className={inputClass}
                    value={checkFormat}
                    onChange={(e) => setCheckFormat(e.target.value as typeof checkFormat)}
                  >
                    <option value="PHYSICAL">Físico</option>
                    <option value="ECHEQ">eCheq</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs text-slate-500">
                  Fecha de emisión
                  <input
                    type="date"
                    className={inputClass}
                    value={checkIssueDate}
                    onChange={(e) => setCheckIssueDate(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-500">
                  Fecha de vencimiento
                  <input
                    type="date"
                    className={inputClass}
                    value={checkDueDate}
                    onChange={(e) => setCheckDueDate(e.target.value)}
                  />
                </label>
              </div>
            </div>
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 dark:text-slate-400 transition hover:text-slate-800 dark:hover:text-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {mutation.isPending ? 'Registrando...' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
