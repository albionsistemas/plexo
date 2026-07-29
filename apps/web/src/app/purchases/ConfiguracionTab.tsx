'use client';

import { PDF_STYLES, purchasePreferencesApi, type PdfStyle } from '@/lib/purchases';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

export default function ConfiguracionTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['purchase-preferences'],
    queryFn: purchasePreferencesApi.get,
  });

  const [quoteRequestPrefix, setQuoteRequestPrefix] = useState('');
  const [purchaseOrderPrefix, setPurchaseOrderPrefix] = useState('');
  const [pdfStyle, setPdfStyle] = useState<PdfStyle>('MODERNO');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!data) return;
    setQuoteRequestPrefix(data.quoteRequestPrefix);
    setPurchaseOrderPrefix(data.purchaseOrderPrefix);
    setPdfStyle(data.purchaseDocumentPdfStyle);
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      purchasePreferencesApi.update({
        quoteRequestPrefix,
        purchaseOrderPrefix,
        purchaseDocumentPdfStyle: pdfStyle,
      }),
    onSuccess: () => {
      setError('');
      setMessage('Guardado');
      void queryClient.invalidateQueries({ queryKey: ['purchase-preferences'] });
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setMessage('');
      const msg = err.response?.data?.message ?? 'No se pudo guardar';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    },
  });

  if (isLoading || !data) {
    return <p className="text-sm text-slate-500">Cargando...</p>;
  }

  function preview(prefix: string, nextNumber: number): string {
    return `${prefix || '···'}-${String(nextNumber).padStart(6, '0')}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6">
        <h2 className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">
          Numeración de tus documentos
        </h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-500">
          Cada usuario elige cómo identifica sus propios pedidos y órdenes — cada uno lleva su
          numeración correlativa por separado.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">
              Prefijo de Pedidos de Cotización
            </label>
            <input
              className={inputClass}
              value={quoteRequestPrefix}
              onChange={(e) => setQuoteRequestPrefix(e.target.value.toUpperCase())}
              placeholder="PED"
              maxLength={12}
            />
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Así se verá: {preview(quoteRequestPrefix, data.quoteRequestNextNumber)}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">
              Prefijo de Órdenes de Compra
            </label>
            <input
              className={inputClass}
              value={purchaseOrderPrefix}
              onChange={(e) => setPurchaseOrderPrefix(e.target.value.toUpperCase())}
              placeholder="OC"
              maxLength={12}
            />
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Así se verá: {preview(purchaseOrderPrefix, data.purchaseOrderNextNumber)}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6">
        <h2 className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">
          Estilo preferido de PDF
        </h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-500">
          Se usa por defecto al generar el PDF de un pedido u orden — se puede cambiar puntualmente
          al descargar.
        </p>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PDF_STYLES.map((style) => (
            <button
              key={style.value}
              type="button"
              onClick={() => setPdfStyle(style.value)}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-center transition ${
                pdfStyle === style.value
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <PdfStyleMockup style={style.value} />
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200">{style.label}</span>
              <span className="text-[10px] text-slate-500 dark:text-slate-500">{style.description}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}
      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {mutation.isPending ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </div>
  );
}

/** Cheap CSS-only mini mockup, not an actual PDF render - just enough to
 * tell the 5 styles apart visually when picking one. */
function PdfStyleMockup({ style }: { style: PdfStyle }) {
  switch (style) {
    case 'MODERNO':
      return (
        <div className="h-16 w-12 rounded border border-slate-300 dark:border-slate-700 bg-white p-1 dark:bg-slate-950">
          <div className="mb-1 h-2 rounded-sm bg-indigo-600" />
          <div className="h-0.5 w-2/3 rounded-sm bg-slate-300 dark:bg-slate-700" />
          <div className="mt-1 h-0.5 w-full rounded-sm bg-slate-200 dark:bg-slate-800" />
          <div className="mt-0.5 h-0.5 w-full rounded-sm bg-slate-200 dark:bg-slate-800" />
        </div>
      );
    case 'COMPACTO':
      return (
        <div className="h-16 w-12 border border-slate-400 bg-white p-1 dark:bg-slate-950">
          <div className="mb-0.5 h-0.5 w-full bg-slate-800 dark:bg-slate-300" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="mt-0.5 h-0.5 w-full bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
      );
    case 'TRADICIONAL':
      return (
        <div className="flex h-16 w-12 flex-col items-center border-2 border-slate-900 bg-white p-1 dark:border-slate-300 dark:bg-slate-950">
          <div className="mb-1 h-1.5 w-8 bg-slate-900 dark:bg-slate-300" />
          <div className="mt-auto h-4 w-full border border-slate-900 dark:border-slate-300" />
        </div>
      );
    case 'NATURAL':
      return (
        <div className="h-16 w-12 rounded-lg border border-amber-200 bg-amber-50 p-1">
          <div className="mb-1 h-2 rounded-md bg-amber-300" />
          <div className="h-3 w-full rounded-md bg-amber-100" />
        </div>
      );
    case 'LETRAS_GRANDES':
      return (
        <div className="flex h-16 w-12 flex-col justify-center gap-1 border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-950">
          <div className="h-2 w-full rounded-sm bg-slate-800 dark:bg-slate-200" />
          <div className="h-2 w-full rounded-sm bg-slate-800 dark:bg-slate-200" />
        </div>
      );
  }
}
