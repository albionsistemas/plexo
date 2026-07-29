'use client';

import { resolveUploadUrl } from '@/lib/inventory';
import { describePurchaseInvoiceStatus, purchaseInvoicesApi } from '@/lib/purchases';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';

interface Props {
  purchaseInvoiceId: string;
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

export default function PurchaseInvoiceDetailPanel({ purchaseInvoiceId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState('Transferencia');
  const [error, setError] = useState('');

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-invoice-detail', purchaseInvoiceId],
    queryFn: () => purchaseInvoicesApi.get(purchaseInvoiceId),
  });

  useEffect(() => {
    if (data) setAmount(Number(data.balanceDue));
  }, [data]);

  const paymentMutation = useMutation({
    mutationFn: () => purchaseInvoicesApi.recordPayment(purchaseInvoiceId, { amount, method }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-invoice-detail', purchaseInvoiceId] });
      void queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
      setPaying(false);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo registrar el pago';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div
        className={`flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl transition-transform duration-200 ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {data?.supplierInvoiceNumber ?? '...'}
            </h2>
            {data && <p className="text-xs text-slate-500">{data.supplierName}</p>}
          </div>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        {isLoading || !data ? (
          <div className="flex h-40 items-center justify-center text-slate-500">Cargando...</div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Estado">
                {(() => {
                  const status = describePurchaseInvoiceStatus(data.status);
                  return (
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${status.colorClass}`}>
                      {status.label}
                    </span>
                  );
                })()}
              </Info>
              <Info label="Orden de Compra">{data.purchaseOrder.number}</Info>
              <Info label="Fecha de factura">
                {new Date(data.supplierInvoiceDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
              </Info>
              {data.dueDate && (
                <Info label="Vencimiento">
                  {new Date(data.dueDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                </Info>
              )}
              <Info label="Creada por">{data.createdBy.name ?? data.createdBy.email}</Info>
              {data.attachmentUrl && (
                <Info label="Comprobante">
                  <a
                    href={resolveUploadUrl(data.attachmentUrl) ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                  >
                    Ver
                  </a>
                </Info>
              )}
            </div>

            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">IVA / Percepciones</h3>
              {data.taxLines.length === 0 ? (
                <p className="text-sm text-slate-500">Sin impuestos cargados</p>
              ) : (
                <div className="flex flex-col gap-1 text-sm">
                  {data.taxLines.map((line) => (
                    <div key={line.id} className="flex justify-between text-slate-700 dark:text-slate-300">
                      <span>{line.concept}</span>
                      <span>${Number(line.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-col gap-1 border-t border-slate-200 dark:border-slate-800 pt-2 text-sm">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Subtotal</span>
                  <span>${Number(data.subtotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-900 dark:text-slate-100">
                  <span>Total</span>
                  <span>${Number(data.total).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-amber-600 dark:text-amber-400">
                  <span>Saldo pendiente</span>
                  <span>${Number(data.balanceDue).toFixed(2)}</span>
                </div>
              </div>
            </section>

            {data.receiptLinks.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">Remitos cubiertos</h3>
                <ul className="flex flex-col gap-1 text-sm text-slate-700 dark:text-slate-300">
                  {data.receiptLinks.map((link) => (
                    <li key={link.id}>
                      {new Date(link.goodsReceipt.receivedAt).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                      {link.goodsReceipt.supplierDocNumber && ` — Remito ${link.goodsReceipt.supplierDocNumber}`}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.notes && (
              <section>
                <h3 className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">Notas</h3>
                <p className="text-sm text-slate-700 dark:text-slate-300">{data.notes}</p>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">Pagos</h3>
              {data.payments.length === 0 ? (
                <p className="text-sm text-slate-500">Sin pagos registrados</p>
              ) : (
                <div className="flex flex-col gap-1 text-sm">
                  {data.payments.map((p) => (
                    <div key={p.id} className="flex justify-between text-slate-700 dark:text-slate-300">
                      <span>
                        {new Date(p.paidAt).toLocaleDateString('es-AR')} — {p.method}
                      </span>
                      <span>${Number(p.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              {Number(data.balanceDue) > 0 &&
                (paying ? (
                  <div className="mt-3 flex flex-col gap-2 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min={0}
                        max={Number(data.balanceDue)}
                        step="any"
                        className={inputClass}
                        value={amount}
                        onChange={(e) => setAmount(Number(e.target.value))}
                      />
                      <input
                        type="text"
                        className={inputClass}
                        placeholder="Método (efectivo, transferencia...)"
                        value={method}
                        onChange={(e) => setMethod(e.target.value)}
                      />
                    </div>
                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setPaying(false)}
                        className="rounded-lg px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setError('');
                          paymentMutation.mutate();
                        }}
                        disabled={paymentMutation.isPending || !(amount > 0)}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                      >
                        {paymentMutation.isPending ? 'Registrando...' : 'Confirmar pago'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPaying(true)}
                    className="mt-3 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-green-500"
                  >
                    Registrar pago
                  </button>
                ))}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-slate-800 dark:text-slate-200">{children}</p>
    </div>
  );
}
