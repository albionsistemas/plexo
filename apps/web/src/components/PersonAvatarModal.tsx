'use client';

import { companiesApi, type Person } from '@/lib/companies';
import { resolveUploadUrl } from '@/lib/inventory';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';

interface Props {
  person: Person;
  companyId: string;
  onClose: () => void;
}

/** Same file-upload pattern as ArticleImageModal, plus two extra ways in
 * that don't need a file at all: pasting a URL (Person.avatarUrl already
 * accepted one before this modal existed) and pasting an image straight
 * from the clipboard (Ctrl+V) - requested explicitly so adding a contact
 * photo doesn't require saving a file to disk first, same gesture WhatsApp
 * uses in its own conversations. */
export default function PersonAvatarModal({ person, companyId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(resolveUploadUrl(person.avatarUrl));
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  // Ctrl+V anywhere while this modal is open, not just inside a specific
  // input - divs don't reliably receive paste events, a window-level
  // listener does regardless of what has focus.
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
      const pasted = item?.getAsFile();
      if (pasted) {
        setError('');
        setFile(pasted);
      }
    }
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['company', companyId] });
  }

  const uploadMutation = useMutation({
    mutationFn: (f: File) => companiesApi.uploadPersonAvatar(person.id, f),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo subir la imagen';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const urlMutation = useMutation({
    mutationFn: (url: string) => companiesApi.updatePerson(person.id, { avatarUrl: url }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo guardar la URL';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => companiesApi.removePersonAvatar(person.id),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const contactName = `${person.firstName} ${person.lastName ?? ''}`.trim();

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Foto de {contactName}</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        <div className="mx-auto mb-3 flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-slate-500">Sin foto</span>
          )}
        </div>
        <p className="mb-4 text-center text-xs text-slate-500">Pegá una imagen (Ctrl+V) o elegí un archivo</p>

        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mb-4 w-full text-sm text-slate-700 dark:text-slate-300"
        />

        <div className="mb-4 flex items-center gap-2 border-t border-slate-200 dark:border-slate-800 pt-4">
          <input
            type="text"
            placeholder="...o pegá una URL de imagen"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
          />
          <button
            type="button"
            onClick={() => urlInput.trim() && urlMutation.mutate(urlInput.trim())}
            disabled={!urlInput.trim() || urlMutation.isPending}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Usar URL
          </button>
        </div>

        {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-between gap-3">
          {person.avatarUrl && !file ? (
            <button
              type="button"
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
              className="rounded-lg border border-red-300 dark:border-red-800 px-3 py-2 text-sm text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
            >
              {removeMutation.isPending ? 'Quitando...' : 'Quitar foto'}
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
