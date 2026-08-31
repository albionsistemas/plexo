'use client';

import { companiesApi } from '@/lib/companies';
import { inventoryApi } from '@/lib/inventory';
import {
  tiendanubeOrdersApi,
  type ConvertTiendanubeOrderMode,
  type TiendanubeOrder,
} from '@/lib/tiendanubeOrders';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  order: TiendanubeOrder;
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

const DOCUMENT_LETTERS = ['A', 'B', 'C', 'M'] as const;

export default function ConvertOrderModal({ order, onClose }: Props) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ConvertTiendanubeOrderMode>('INVOICE');
  const [warehouseId, setWarehouseId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [documentLetter, setDocumentLetter] = useState<(typeof DOCUMENT_LETTERS)[number]>('B');
  const [error, setError] = useState('');

  const branchesQuery = useQuery({ queryKey: ['companies', 'BRANCH'], queryFn: () => companiesApi.list('BRANCH') });
  const warehousesQuery = useQuery({ queryKey: ['inventory-warehouses'], queryFn: inventoryApi.listWarehouses });
  const branches = branchesQuery.data ?? [];
  const warehouses = warehousesQuery.data ?? [];

  const ready = !branchesQuery.isLoading && !warehousesQuery.isLoading;
  const firstBranch = branches[0];
  const firstWarehouse = warehouses[0];
  if (ready && !branchId && firstBranch) setBranchId(firstBranch.id);
  if (ready && !warehouseId && firstWarehouse) setWarehouseId(firstWarehouse.id);

  const mutation = useMutation({
    mutationFn: () =>
      tiendanubeOrdersApi.convert(order.id, {
        mode,
        warehouseId,
        ...(mode === 'INVOICE' ? { branchId, documentLetter } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tiendanube-orders'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo convertir la orden';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!warehouseId) {
      setError('Elegí el depósito de donde sale el stock');
      return;
    }
    if (mode === 'INVOICE' && !branchId) {
      setError('Elegí la sucursal/punto de venta que factura');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Convertir orden de Tiendanube</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          #{order.tiendanubeOrderNumber ?? order.tiendanubeOrderId} · {order.customer.name} · {order.currency}{' '}
          {order.total}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">¿Qué hacemos con esta orden?</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('INVOICE')}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                  mode === 'INVOICE'
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                    : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                Facturar (con CAE)
              </button>
              <button
                type="button"
                onClick={() => setMode('WITHOUT_INVOICE')}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                  mode === 'WITHOUT_INVOICE'
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                    : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                Crear venta sin facturar
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Depósito</label>
            <select className={inputClass} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {mode === 'INVOICE' && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-sm text-slate-600 dark:text-slate-400">Sucursal / punto de venta</label>
                <select className={inputClass} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.pointOfSaleNumber ?? 'sin PV'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm text-slate-600 dark:text-slate-400">Tipo de comprobante</label>
                <select
                  className={inputClass}
                  value={documentLetter}
                  onChange={(e) => setDocumentLetter(e.target.value as typeof documentLetter)}
                >
                  {DOCUMENT_LETTERS.map((letter) => (
                    <option key={letter} value={letter}>
                      Factura {letter}
                    </option>
                  ))}
                </select>
              </div>
              {/* Transparencia en el clic (pedido explícito del usuario): el
                  precio de línea guardado es el histórico de Tiendanube, que
                  siempre viene con IVA incluido - se le muestra al usuario
                  el total exacto que va a facturar antes de confirmar, no
                  después. */}
              <p className="rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950 px-3 py-2 text-xs text-indigo-700 dark:text-indigo-300">
                Se factura con <strong>IVA incluido</strong> (precio final de la tienda online) - total a facturar:{' '}
                <strong>
                  {order.currency} {order.total}
                </strong>
                .
              </p>
            </>
          )}

          {mode === 'WITHOUT_INVOICE' && (
            <p className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
              Se descuenta el stock de cada línea sin emitir factura ni CAE - la venta queda sin comprobante fiscal
              hasta que decidas facturarla a mano.
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
              disabled={mutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {mutation.isPending ? 'Convirtiendo...' : 'Convertir'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
