'use client';

import { inventoryApi, resolveUploadUrl } from '@/lib/inventory';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';

interface Props {
  article: { id: string; name: string; imageUrl: string | null };
  onClose: () => void;
}

export default function ArticleImageModal({ article, onClose }: Props) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(resolveUploadUrl(article.imageUrl));
  const [error, setError] = useState('');

  // Revoke the object URL for a locally-picked file when it's replaced or
  // this modal unmounts - it's only needed for the preview, not the
  // uploaded copy (that gets its own server-side URL back on save).
  useEffect(() => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
  }

  const uploadMutation = useMutation({
    mutationFn: (f: File) => inventoryApi.uploadArticleImage(article.id, f),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo subir la imagen';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => inventoryApi.removeArticleImage(article.id),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Imagen de {article.name}</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        <div className="mb-4 flex h-40 items-center justify-center overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-slate-500">Sin imagen</span>
          )}
        </div>

        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mb-4 w-full text-sm text-slate-700 dark:text-slate-300"
        />

        {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-between gap-3">
          {article.imageUrl && !file ? (
            <button
              type="button"
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
              className="rounded-lg border border-red-300 dark:border-red-800 px-3 py-2 text-sm text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
            >
              {removeMutation.isPending ? 'Quitando...' : 'Quitar imagen'}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => file && uploadMutation.mutate(file)}
            disabled={!file || uploadMutation.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {uploadMutation.isPending ? 'Subiendo...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
