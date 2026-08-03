'use client';

import { resolveUploadUrl } from '@/lib/inventory';
import { cartApi, CART_QUERY_KEY, type CartLine } from '@/lib/inventoryCart';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, ShoppingBasket, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import PurchaseRequestCheckoutModal from './PurchaseRequestCheckoutModal';
import QuoteCheckoutModal from './QuoteCheckoutModal';

interface Props {
  open: boolean;
  onClose: () => void;
  lines: CartLine[];
}

/** Right-anchored slide-over - first of its kind in this codebase (every
 * existing modal is a centered `fixed inset-0 bg-black/60` dialog, see
 * CompanyFormModal.tsx), so it deliberately reuses that same backdrop/panel
 * skeleton rather than introducing a second modal library/pattern - just
 * anchored to the right edge instead of centered. */
export default function CartDrawer({ open, onClose, lines }: Props) {
  const queryClient = useQueryClient();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [checkoutModal, setCheckoutModal] = useState<'purchase' | 'quote' | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });

  const updateQuantity = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => cartApi.updateQuantity(id, quantity),
    onSuccess: invalidate,
  });
  const removeItem = useMutation({ mutationFn: (id: string) => cartApi.removeItem(id), onSuccess: invalidate });
  const clear = useMutation({
    mutationFn: () => cartApi.clear(),
    onSuccess: () => {
      invalidate();
      setConfirmingClear(false);
    },
  });

  if (!open) return null;

  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalAmount = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  return (
    <>
      <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
        <div
          className="flex h-full w-full max-w-md flex-col bg-white dark:bg-slate-900 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Listado de artículos</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lines.length} artículo{lines.length !== 1 ? 's' : ''} · {totalQuantity} unidades
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {lines.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
                <ShoppingBasket className="h-10 w-10 text-slate-300 dark:text-slate-700" />
                <p className="max-w-[16rem] text-sm text-slate-500 dark:text-slate-400">
                  Todavía no agregaste artículos. Andá a Inventario → Catálogo para empezar a armar tu listado.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {lines.map((line) => (
                  <li
                    key={line.id}
                    className="flex gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3"
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
                      {line.imageUrl ? (
                        <img
                          src={resolveUploadUrl(line.imageUrl) ?? undefined}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <ShoppingBasket className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {line.articleName}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {line.sku}
                        {line.categoryName ? ` · ${line.categoryName}` : ''}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() =>
                              updateQuantity.mutate({ id: line.id, quantity: Math.max(1, line.quantity - 1) })
                            }
                            className="flex h-6 w-6 items-center justify-center rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            aria-label="Restar"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-7 text-center text-sm text-slate-800 dark:text-slate-200">
                            {line.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity.mutate({ id: line.id, quantity: line.quantity + 1 })}
                            className="flex h-6 w-6 items-center justify-center rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            aria-label="Sumar"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          ${line.lineTotal.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeItem.mutate(line.id)}
                      className="self-start text-slate-400 hover:text-red-600"
                      aria-label="Quitar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {lines.length > 0 && (
            <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 px-5 py-4">
              <div className="flex justify-between text-sm font-medium text-slate-900 dark:text-slate-100">
                <span>Total</span>
                <span>${totalAmount.toFixed(2)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setCheckoutModal('purchase')}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
                >
                  Pedido de costos
                </button>
                <button
                  onClick={() => setCheckoutModal('quote')}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
                >
                  Proponer venta
                </button>
                <button
                  onClick={() => void cartApi.openPdf()}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Exportar PDF
                </button>
                {confirmingClear ? (
                  <button
                    onClick={() => clear.mutate()}
                    disabled={clear.isPending}
                    className="rounded-lg border border-red-300 dark:border-red-800 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    {clear.isPending ? 'Vaciando...' : '¿Confirmar?'}
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmingClear(true)}
                    onBlur={() => setConfirmingClear(false)}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Vaciar lista
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {checkoutModal === 'purchase' && (
        <PurchaseRequestCheckoutModal lines={lines} onClose={() => setCheckoutModal(null)} />
      )}
      {checkoutModal === 'quote' && <QuoteCheckoutModal lines={lines} onClose={() => setCheckoutModal(null)} />}
    </>
  );
}
