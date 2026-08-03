'use client';

import { quotesApi, type QuoteDetail } from '@/lib/quotes';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface Props {
  quote: QuoteDetail;
  onClose: () => void;
}

/** "Enviar por WhatsApp" - same "no delivery receipt" pattern as
 * PurchaseOrderFollowUpModal's WhatsApp button: opens a wa.me link with a
 * pre-filled message (built server-side, see QuoteService.buildWhatsappLink)
 * and the user attaches the PDF by hand inside WhatsApp; "enviado" here just
 * means the user confirmed they went through with it. */
export default function QuoteFollowUpModal({ quote, onClose }: Props) {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState('');
  const [opened, setOpened] = useState(false);

  const markSentMutation = useMutation({
    mutationFn: () => quotesApi.markSentWhatsapp(quote.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
      void queryClient.invalidateQueries({ queryKey: ['quote-detail', quote.id] });
      onClose();
    },
  });

  async function openWhatsapp() {
    const digits = phone.replace(/\D/g, '');
    if (!digits) return;
    const { url } = await quotesApi.whatsappLink(quote.id, phone);
    window.open(url, '_blank');
    setOpened(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Enviar por WhatsApp</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            ✕
          </button>
        </div>

        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">Número de WhatsApp</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+54 9 11..."
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
        />
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
          Se abre WhatsApp con el mensaje precargado. Adjuntá el PDF a mano y confirmá acá abajo que lo mandaste.
        </p>

        <div className="mt-4 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm text-slate-600 dark:text-slate-400">
            Cancelar
          </button>
          {!opened ? (
            <button
              onClick={() => void openWhatsapp()}
              disabled={!phone}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Abrir WhatsApp
            </button>
          ) : (
            <button
              onClick={() => markSentMutation.mutate()}
              disabled={markSentMutation.isPending}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {markSentMutation.isPending ? 'Confirmando...' : 'Confirmar enviado'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
