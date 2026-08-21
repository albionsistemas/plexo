'use client';

import ArticlePicker from '@/components/ArticlePicker';
import { inventoryApi, MOVEMENT_TYPES, type MovementType, type Warehouse } from '@/lib/inventory';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  warehouses: Warehouse[];
  onClose: () => void;
}

const selectClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

/** Freeform stock entry - NOT the way to receive against an Orden de
 * Compra anymore (see PurchaseOrderDetailPanel's "Recibir mercadería" /
 * ReceiveGoodsModal, which caps quantity at what's actually pending and
 * reads cost from the order itself). This modal used to also offer an
 * "Orden de Compra (opcional)" picker for PURCHASE_IN - it let anyone
 * type any quantity against any order with no validation at all, which
 * is exactly the bug that flow was built to close, so it was removed
 * (2026-07-29) rather than left as a parallel, unguarded path. The
 * backend rejects purchaseOrderId/goodsReceiptLineId on this endpoint
 * too (InventoryController.recordMovement) - this isn't just a UI
 * change, the loophole is closed server-side. */
export default function StockMovementModal({ warehouses, onClose }: Props) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    articleVariantId: '',
    warehouseId: warehouses[0]?.id ?? '',
    type: 'PURCHASE_IN' as MovementType,
    quantity: '',
    unitCost: '',
  });
  const [error, setError] = useState('');

  const needsCost = form.type === 'PURCHASE_IN' || form.type === 'PRODUCTION_IN';

  const mutation = useMutation({
    mutationFn: () =>
      inventoryApi.recordMovement({
        articleVariantId: form.articleVariantId,
        warehouseId: form.warehouseId,
        type: form.type,
        quantity: Number(form.quantity),
        unitCost: needsCost ? Number(form.unitCost) : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo registrar el movimiento';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.articleVariantId || !form.warehouseId || !form.quantity) {
      setError('Completá todos los campos');
      return;
    }
    if (Number(form.quantity) === 0) {
      setError('La cantidad no puede ser cero');
      return;
    }
    if (needsCost && !form.unitCost) {
      setError('Ingresá el costo unitario de la compra');
      return;
    }
    mutation.mutate();
  }

  const isAdjustment = form.type === 'ADJUSTMENT';
  const isPurchase = form.type === 'PURCHASE_IN';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nuevo movimiento de stock</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Artículo / variante">
            <ArticlePicker
              value={form.articleVariantId}
              onChange={(variantId) => setForm({ ...form, articleVariantId: variantId })}
            />
          </Field>

          <Field label="Depósito">
            <select
              className={selectClass}
              value={form.warehouseId}
              onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
              disabled={warehouses.length === 0}
            >
              {warehouses.length === 0 && <option value="">Sin depósitos cargados</option>}
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tipo de movimiento">
            <select
              className={selectClass}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as MovementType })}
            >
              {MOVEMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label={isAdjustment ? 'Cantidad (+ entrada / − salida)' : 'Cantidad'}>
            <input
              type="number"
              step="any"
              className={selectClass}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder={isAdjustment ? 'p. ej. -3 o 5' : 'p. ej. 10'}
            />
          </Field>

          {needsCost && (
            <Field label="Costo unitario">
              <input
                type="number"
                step="any"
                min="0"
                className={selectClass}
                value={form.unitCost}
                onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
                placeholder="p. ej. 100.50"
              />
            </Field>
          )}

          {isPurchase && (
            <p className="text-xs text-slate-500 dark:text-slate-500">
              ¿Esta compra viene de una Orden de Compra ya enviada? Usá "Recibir mercadería" desde el
              detalle de esa orden en Compras, no este formulario — ahí el sistema valida la cantidad
              contra lo pendiente y toma el costo de la orden.
            </p>
          )}

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
              disabled={mutation.isPending || warehouses.length === 0}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {mutation.isPending ? 'Guardando...' : 'Registrar'}
            </button>
          </div>
        </form>
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
