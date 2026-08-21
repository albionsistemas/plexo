'use client';

import { inventoryApi, resolveUploadUrl } from '@/lib/inventory';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { FileArchive, FileText } from 'lucide-react';
import { useState } from 'react';

interface Props {
  article: {
    id: string;
    name: string;
    description: string | null;
    brochureUrl: string | null;
    attachmentZipUrl: string | null;
  };
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

/** "Dato extra" del artículo (descripción larga + folleto PDF + adjunto
 * ZIP) - a propósito en su propio modal, no en el panel principal de
 * Inventario, ni en el alta rápida de ArticleFormModal. Sin <form> (mismo
 * criterio que ArticleFormModal tras el bug de forms anidados encontrado
 * esa sesión) - cada acción es su propio botón con su propia mutation. */
export default function ArticleDetailsModal({ article, onClose }: Props) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState(article.description ?? '');
  const [descriptionSaved, setDescriptionSaved] = useState(false);
  const [brochureFile, setBrochureFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [error, setError] = useState('');

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
  }

  const descriptionMutation = useMutation({
    mutationFn: () =>
      inventoryApi.updateArticle(article.id, { description: description.trim() === '' ? null : description }),
    onSuccess: () => {
      invalidate();
      setDescriptionSaved(true);
      setTimeout(() => setDescriptionSaved(false), 1500);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo guardar la descripción';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const brochureUploadMutation = useMutation({
    mutationFn: (f: File) => inventoryApi.uploadArticleBrochure(article.id, f),
    onSuccess: () => {
      invalidate();
      setBrochureFile(null);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo subir el folleto';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const brochureRemoveMutation = useMutation({
    mutationFn: () => inventoryApi.removeArticleBrochure(article.id),
    onSuccess: invalidate,
  });

  const zipUploadMutation = useMutation({
    mutationFn: (f: File) => inventoryApi.uploadArticleAttachmentZip(article.id, f),
    onSuccess: () => {
      invalidate();
      setZipFile(null);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo subir el archivo ZIP';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const zipRemoveMutation = useMutation({
    mutationFn: () => inventoryApi.removeArticleAttachmentZip(article.id),
    onSuccess: invalidate,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Detalles de {article.name}</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-slate-600 dark:text-slate-400">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Notas, detalles técnicos, especificaciones... (opcional, no se muestra en el catálogo)"
              className={inputClass}
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => descriptionMutation.mutate()}
                disabled={descriptionMutation.isPending}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {descriptionMutation.isPending ? 'Guardando...' : 'Guardar descripción'}
              </button>
              {descriptionSaved && <span className="text-xs text-green-600 dark:text-green-400">Guardado</span>}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-slate-300 dark:border-slate-700 p-3">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <FileText className="h-4 w-4" />
              Folleto (PDF)
            </div>
            {article.brochureUrl && (
              <a
                href={resolveUploadUrl(article.brochureUrl) ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Ver folleto actual
              </a>
            )}
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setBrochureFile(e.target.files?.[0] ?? null)}
              className="text-sm text-slate-700 dark:text-slate-300"
            />
            <div className="flex justify-between gap-3">
              {article.brochureUrl && !brochureFile ? (
                <button
                  type="button"
                  onClick={() => brochureRemoveMutation.mutate()}
                  disabled={brochureRemoveMutation.isPending}
                  className="rounded-lg border border-red-300 dark:border-red-800 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
                >
                  {brochureRemoveMutation.isPending ? 'Quitando...' : 'Quitar folleto'}
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => brochureFile && brochureUploadMutation.mutate(brochureFile)}
                disabled={!brochureFile || brochureUploadMutation.isPending}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {brochureUploadMutation.isPending ? 'Subiendo...' : 'Subir folleto'}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-slate-300 dark:border-slate-700 p-3">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <FileArchive className="h-4 w-4" />
              Adjunto (ZIP)
            </div>
            {article.attachmentZipUrl && (
              <a
                href={resolveUploadUrl(article.attachmentZipUrl) ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Descargar ZIP actual
              </a>
            )}
            <input
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              onChange={(e) => setZipFile(e.target.files?.[0] ?? null)}
              className="text-sm text-slate-700 dark:text-slate-300"
            />
            <div className="flex justify-between gap-3">
              {article.attachmentZipUrl && !zipFile ? (
                <button
                  type="button"
                  onClick={() => zipRemoveMutation.mutate()}
                  disabled={zipRemoveMutation.isPending}
                  className="rounded-lg border border-red-300 dark:border-red-800 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
                >
                  {zipRemoveMutation.isPending ? 'Quitando...' : 'Quitar ZIP'}
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => zipFile && zipUploadMutation.mutate(zipFile)}
                disabled={!zipFile || zipUploadMutation.isPending}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {zipUploadMutation.isPending ? 'Subiendo...' : 'Subir ZIP'}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 dark:text-slate-400 transition hover:text-slate-800 dark:hover:text-slate-200"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
