'use client';

import { inventoryApi } from '@/lib/inventory';
import { goodsReceiptsApi, type PurchaseOrderDetail } from '@/lib/purchases';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  purchaseOrder: PurchaseOrderDetail;
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Recepción de mercadería (remito) contra una OC ya enviada - a
 * diferencia de "Nuevo movimiento" en Inventario (que no valida cantidad
 * ni acumula entregas parciales), acá el tope de cada línea es lo que
 * realmente falta recibir, y no hay campo de costo: ya vive en
 * PurchaseOrderLine.unitCost, un remito nunca trae precio. */
export default function ReceiveGoodsModal({ purchaseOrder, onClose }: Props) {
  const queryClient = useQueryClient();

  const warehousesQuery = useQuery({
    queryKey: ['inventory-warehouses'],
    queryFn: inventoryApi.listWarehouses,
  });
  const warehouses = warehousesQuery.data ?? [];

  const pendingLines = purchaseOrder.lines.filter((l) => Number(l.pendingQuantity) > 0);

  const [warehouseId, setWarehouseId] = useState('');
  const [supplierDocNumber, setSupplierDocNumber] = useState('');
  const [receivedAt, setReceivedAt] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(pendingLines.map((l) => [l.id, Number(l.pendingQuantity)])),
  );
  const [error, setError] = useState('');

  if (!warehouseId && warehouses[0]) setWarehouseId(warehouses[0].id);

  const mutation = useMutation({
    mutationFn: async () => {
      const lines = pendingLines
        .map((l) => ({ purchaseOrderLineId: l.id, quantity: quantities[l.id] ?? 0 }))
        .filter((l) => l.quantity > 0);
      const receipt = await goodsReceiptsApi.create({
        purchaseOrderId: purchaseOrder.id,
        warehouseId,
        supplierDocNumber: supplierDocNumber || undefined,
        receivedAt,
        notes: notes || undefined,
        lines,
      });
      if (file) {
        await goodsReceiptsApi.uploadAttachment(receipt.id, file);
      }
      return receipt;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-order-detail', purchaseOrder.id] });
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo registrar la recepción';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!warehouseId) {
      setError('Elegí un depósito');
      return;
    }
    const toReceive = pendingLines.filter((l) => (quantities[l.id] ?? 0) > 0);
    if (toReceive.length === 0) {
      setError('Ingresá una cantidad mayor a cero en al menos una línea');
      return;
    }
    const overLine = toReceive.find((l) => (quantities[l.id] ?? 0) > Number(l.pendingQuantity));
    if (overLine) {
      setError(
        `${overLine.articleVariant.article.name}: no podés recibir más de lo pendiente (${overLine.pendingQuantity})`,
      );
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Recibir mercadería — {purchaseOrder.number}
          </h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        {pendingLines.length === 0 ? (
          <p className="py-10 text-center text-slate-500">Esta orden ya está recibida por completo.</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Depósito">
                <select className={inputClass} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fecha de recepción">
                <input
                  type="date"
                  className={inputClass}
                  value={receivedAt}
                  onChange={(e) => setReceivedAt(e.target.value)}
                />
              </Field>
              <Field label="Remito / comprobante de proveedor">
                <input
                  type="text"
                  className={inputClass}
                  placeholder="p. ej. 0001-00012345"
                  value={supplierDocNumber}
                  onChange={(e) => setSupplierDocNumber(e.target.value)}
                />
              </Field>
              <Field label="Foto o escaneo del remito">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  capture="environment"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-slate-700 dark:text-slate-300"
                />
              </Field>
            </div>

            <Field label="Notas">
              <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-600 dark:text-slate-400">
                Líneas pendientes — la cantidad no puede superar lo pendiente
              </label>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-left text-slate-500">
                      <th className="p-2">Artículo</th>
                      <th className="p-2 text-right">Pedido</th>
                      <th className="p-2 text-right">Recibido</th>
                      <th className="p-2 text-right">Pendiente</th>
                      <th className="p-2 text-right">A recibir ahora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingLines.map((line) => (
                      <tr key={line.id} className="border-b border-slate-200/50 dark:border-slate-800/50">
                        <td className="p-2">
                          <p className="text-slate-800 dark:text-slate-200">{line.articleVariant.article.name}</p>
                          <p className="font-mono text-[10px] text-slate-500">{line.articleVariant.sku}</p>
                        </td>
                        <td className="p-2 text-right text-slate-700 dark:text-slate-300">{line.quantity}</td>
                        <td className="p-2 text-right text-slate-700 dark:text-slate-300">
                          {line.receivedQuantity}
                        </td>
                        <td className="p-2 text-right text-slate-700 dark:text-slate-300">
                          {line.pendingQuantity}
                        </td>
                        <td className="p-2 text-right">
                          <input
                            type="number"
                            min={0}
                            max={Number(line.pendingQuantity)}
                            step="any"
                            className={`${inputClass} w-24 text-right`}
                            value={quantities[line.id] ?? 0}
                            onChange={(e) =>
                              setQuantities((prev) => ({ ...prev, [line.id]: Number(e.target.value) }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                {mutation.isPending ? 'Registrando...' : 'Registrar recepción'}
              </button>
            </div>
          </form>
        )}
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
