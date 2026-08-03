'use client';

import { PDF_STYLES, quotePreferencesApi, type PdfStyle } from '@/lib/quotes';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

export default function ConfiguracionTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['quote-preferences'],
    queryFn: quotePreferencesApi.get,
  });

  const [quotePrefix, setQuotePrefix] = useState('');
  const [pdfStyle, setPdfStyle] = useState<PdfStyle>('MODERNO');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!data) return;
    setQuotePrefix(data.quotePrefix);
    setPdfStyle(data.quotePdfStyle);
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => quotePreferencesApi.update({ quotePrefix, quotePdfStyle: pdfStyle }),
    onSuccess: () => {
      setError('');
      setMessage('Guardado');
      void queryClient.invalidateQueries({ queryKey: ['quote-preferences'] });
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

  const preview = `${quotePrefix || '···'}-${String(data.quoteNextNumber).padStart(6, '0')}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6">
        <h2 className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">Numeración de tus cotizaciones</h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-500">
          Cada usuario elige cómo identifica sus propias cotizaciones — numeración correlativa por separado.
        </p>
        <div className="max-w-xs">
          <label className="text-sm text-slate-600 dark:text-slate-400">Prefijo</label>
          <input
            className={`${inputClass} mt-1 w-full`}
            value={quotePrefix}
            onChange={(e) => setQuotePrefix(e.target.value.toUpperCase())}
            placeholder="PRE"
            maxLength={12}
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">Así se verá: {preview}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6">
        <h2 className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">Estilo preferido de PDF</h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-500">
          Se usa por defecto al generar el PDF de una cotización — se puede cambiar puntualmente al descargar.
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
