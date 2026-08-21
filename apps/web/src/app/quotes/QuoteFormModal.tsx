'use client';

import ArticlePicker from '@/components/ArticlePicker';
import CompanyFormModal from '@/components/CompanyFormModal';
import { companiesApi } from '@/lib/companies';
import { inventoryApi } from '@/lib/inventory';
import { invoicingApi } from '@/lib/invoicing';
import { quotesApi, type QuoteDetail, type QuoteLineInput } from '@/lib/quotes';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  quote?: QuoteDetail;
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

export default function QuoteFormModal({ quote, onClose }: Props) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(quote);

  const customersQuery = useQuery({
    queryKey: ['companies', 'CUSTOMER'],
    queryFn: () => companiesApi.list('CUSTOMER'),
  });
  const currenciesQuery = useQuery({
    queryKey: ['invoicing-currencies'],
    queryFn: invoicingApi.listCurrencies,
  });
  const articlesQuery = useQuery({
    queryKey: ['inventory-articles'],
    queryFn: () => inventoryApi.listArticles(),
  });

  const customers = customersQuery.data ?? [];
  const currencies = currenciesQuery.data ?? [];

  const [customerId, setCustomerId] = useState(quote?.customer.id ?? '');
  const [currencyId, setCurrencyId] = useState(quote?.currency.id ?? '');
  const [validUntil, setValidUntil] = useState(quote?.validUntil ? quote.validUntil.slice(0, 10) : '');
  const [notes, setNotes] = useState(quote?.notes ?? '');
  const [lines, setLines] = useState<QuoteLineInput[]>(
    quote?.lines.map((l) => ({
      articleVariantId: '',
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      notes: l.notes ?? undefined,
    })) ?? [{ articleVariantId: '', quantity: 1, unitPrice: 0 }],
  );
  const [linesResolved, setLinesResolved] = useState(!isEdit);
  if (!linesResolved && quote && (articlesQuery.data?.length ?? 0) > 0) {
    const bySku = new Map((articlesQuery.data ?? []).flatMap((a) => a.variants.map((v) => [v.sku, v.id])));
    setLines((prev) =>
      prev.map((line, i) => {
        const original = quote.lines[i];
        return original && !line.articleVariantId
          ? { ...line, articleVariantId: bySku.get(original.articleVariant.sku) ?? '' }
          : line;
      }),
    );
    setLinesResolved(true);
  }

  const [error, setError] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  const ready = !customersQuery.isLoading && !currenciesQuery.isLoading;
  const firstCustomer = customers[0];
  const firstCurrency = currencies[0];
  if (ready && !customerId && firstCustomer) setCustomerId(firstCustomer.id);
  if (ready && !currencyId && firstCurrency) setCurrencyId(firstCurrency.id);

  const mutation = useMutation({
    mutationFn: () => {
      const dto = { customerId, currencyId, validUntil: validUntil || undefined, notes: notes || undefined, lines };
      return quote ? quotesApi.update(quote.id, dto) : quotesApi.create(dto);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo guardar la cotización';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function updateLine(index: number, patch: Partial<QuoteLineInput>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, { articleVariantId: '', quantity: 1, unitPrice: 0 }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!customerId || !currencyId) {
      setError('Completá cliente y moneda');
      return;
    }
    if (lines.some((l) => !l.articleVariantId || l.quantity <= 0)) {
      setError('Cada línea necesita un artículo y una cantidad mayor a cero');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {isEdit ? `Editar cotización ${quote?.number}` : 'Nueva cotización'}
          </h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        {!ready ? (
          <div className="py-10 text-center text-slate-500">Cargando...</div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Cliente"
                action={
                  <button
                    type="button"
                    onClick={() => setCreatingCustomer(true)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                  >
                    + nuevo cliente
                  </button>
                }
              >
                <select className={inputClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Moneda">
                <select className={inputClass} value={currencyId} onChange={(e) => setCurrencyId(e.target.value)}>
                  {currencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Válida hasta">
                <input
                  type="date"
                  className={inputClass}
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Notas">
              <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>

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
                  <ArticlePicker
                    className="flex-1"
                    value={line.articleVariantId}
                    onChange={(variantId, option) =>
                      updateLine(index, {
                        articleVariantId: variantId,
                        unitPrice: option ? option.unitPrice : line.unitPrice,
                      })
                    }
                  />
                  <input
                    type="number"
                    min={1}
                    step="any"
                    className={`${inputClass} w-20`}
                    value={line.quantity}
                    onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                    title="Cantidad"
                  />
                  <input
                    type="number"
                    min={0}
                    step="any"
                    className={`${inputClass} w-28`}
                    placeholder="Precio"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(index, { unitPrice: Number(e.target.value) })}
                    title="Precio unitario"
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
                {mutation.isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear cotización'}
              </button>
            </div>
          </form>
        )}
      </div>

      {creatingCustomer && (
        <CompanyFormModal
          lockedRole="CUSTOMER"
          onClose={() => setCreatingCustomer(false)}
          onSaved={(c) => setCustomerId(c.id)}
        />
      )}
    </div>
  );
}

function Field({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-sm text-slate-600 dark:text-slate-400">{label}</label>
        {action}
      </div>
      {children}
    </div>
  );
}
