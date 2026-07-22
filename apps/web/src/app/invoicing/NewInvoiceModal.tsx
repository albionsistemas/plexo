'use client';

import { companiesApi } from '@/lib/companies';
import { inventoryApi } from '@/lib/inventory';
import { invoicingApi, type CreateSaleLineInput } from '@/lib/invoicing';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

const DOCUMENT_LETTERS = ['A', 'B', 'C', 'M'] as const;

export default function NewInvoiceModal({ onClose }: Props) {
  const queryClient = useQueryClient();

  const customersQuery = useQuery({
    queryKey: ['companies', 'CUSTOMER'],
    queryFn: () => companiesApi.list('CUSTOMER'),
  });
  const branchesQuery = useQuery({
    queryKey: ['companies', 'BRANCH'],
    queryFn: () => companiesApi.list('BRANCH'),
  });
  const warehousesQuery = useQuery({
    queryKey: ['inventory-warehouses'],
    queryFn: inventoryApi.listWarehouses,
  });
  const articlesQuery = useQuery({
    queryKey: ['inventory-articles'],
    queryFn: inventoryApi.listArticles,
  });
  const currenciesQuery = useQuery({
    queryKey: ['invoicing-currencies'],
    queryFn: invoicingApi.listCurrencies,
  });

  const customers = customersQuery.data ?? [];
  const branches = branchesQuery.data ?? [];
  const warehouses = warehousesQuery.data ?? [];
  const currencies = currenciesQuery.data ?? [];
  const variantOptions = (articlesQuery.data ?? []).flatMap((article) =>
    article.variants.map((variant) => ({
      id: variant.id,
      label: `${variant.sku} — ${article.name}`,
    })),
  );

  const [customerId, setCustomerId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [documentLetter, setDocumentLetter] = useState<(typeof DOCUMENT_LETTERS)[number]>('B');
  const [currencyId, setCurrencyId] = useState('');
  const [lines, setLines] = useState<CreateSaleLineInput[]>([{ articleVariantId: '', quantity: 1 }]);
  const [error, setError] = useState('');

  const ready = !customersQuery.isLoading && !branchesQuery.isLoading && !warehousesQuery.isLoading;

  // Fill selects with their first option once data arrives, since a plain
  // <select> with no matching value shows blank instead of a placeholder.
  const firstCustomer = customers[0];
  const firstBranch = branches[0];
  const firstWarehouse = warehouses[0];
  const firstCurrency = currencies[0];
  if (ready && !customerId && firstCustomer) setCustomerId(firstCustomer.id);
  if (ready && !branchId && firstBranch) setBranchId(firstBranch.id);
  if (ready && !warehouseId && firstWarehouse) setWarehouseId(firstWarehouse.id);
  if (ready && !currencyId && firstCurrency) setCurrencyId(firstCurrency.id);

  const mutation = useMutation({
    mutationFn: () =>
      invoicingApi.createSale({
        customerId,
        branchId,
        warehouseId,
        documentLetter,
        currencyId,
        lines,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo emitir la factura';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function updateLine(index: number, patch: Partial<CreateSaleLineInput>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, { articleVariantId: variantOptions[0]?.id ?? '', quantity: 1 }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!customerId || !branchId || !warehouseId || !currencyId) {
      setError('Completá todos los campos');
      return;
    }
    if (lines.some((l) => !l.articleVariantId || l.quantity <= 0)) {
      setError('Cada línea necesita un artículo y una cantidad mayor a cero');
      return;
    }
    mutation.mutate();
  }

  const missingData =
    ready && (customers.length === 0 || branches.length === 0 || warehouses.length === 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nueva factura</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        {!ready ? (
          <div className="py-10 text-center text-slate-500">Cargando...</div>
        ) : missingData ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Hace falta al menos un cliente (empresa con rol CUSTOMER), una sucursal (rol BRANCH) y un
            depósito antes de poder facturar.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cliente">
                <select
                  className={inputClass}
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Sucursal / punto de venta">
                <select
                  className={inputClass}
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.pointOfSaleNumber ?? 'sin PV'})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Depósito (para descontar stock)">
                <select
                  className={inputClass}
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tipo de comprobante">
                <select
                  className={inputClass}
                  value={documentLetter}
                  onChange={(e) => setDocumentLetter(e.target.value as typeof documentLetter)}
                >
                  {DOCUMENT_LETTERS.map((letter) => (
                    <option key={letter} value={letter}>
                      Factura {letter}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Moneda">
                <select
                  className={inputClass}
                  value={currencyId}
                  onChange={(e) => setCurrencyId(e.target.value)}
                >
                  {currencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-slate-600 dark:text-slate-400">Líneas</label>
                <button
                  type="button"
                  onClick={addLine}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                >
                  + agregar línea
                </button>
              </div>
              {lines.map((line, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    className={`${inputClass} flex-1`}
                    value={line.articleVariantId}
                    onChange={(e) => updateLine(index, { articleVariantId: e.target.value })}
                  >
                    <option value="">Elegí un artículo...</option>
                    {variantOptions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    step="any"
                    className={`${inputClass} w-24`}
                    value={line.quantity}
                    onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                  />
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="text-slate-500 hover:text-red-600 dark:hover:text-red-400"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

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
                {mutation.isPending ? 'Emitiendo...' : 'Emitir factura'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-slate-600 dark:text-slate-400">{label}</label>
      {children}
    </div>
  );
}
