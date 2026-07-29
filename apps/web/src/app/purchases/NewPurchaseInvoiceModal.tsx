'use client';

import {
  purchaseInvoicesApi,
  purchaseOrdersApi,
  type PurchaseInvoiceTaxLineInput,
  type PurchaseInvoiceTaxLineType,
} from '@/lib/purchases';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const TAX_LINE_TYPE_LABELS: Record<PurchaseInvoiceTaxLineType, string> = {
  IVA_CREDITO: 'IVA Crédito',
  PERCEPCION: 'Percepción',
};

/**
 * Carga de la Factura de Compra del proveedor - cabecera, no línea por
 * artículo (ese detalle ya vive en la Orden/remito, ver PurchaseInvoiceService
 * en el backend). El usuario transcribe lo que dice el papel: subtotal, filas
 * de IVA/Percepciones, total. Los remitos elegidos cancelan el pasivo puente
 * (GRNI) - no se filtran acá los ya facturados (serían pocos en la práctica);
 * si se elige uno ya facturado, el backend lo rechaza con un 400 legible.
 */
export default function NewPurchaseInvoiceModal({ onClose }: Props) {
  const queryClient = useQueryClient();

  const ordersQuery = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => purchaseOrdersApi.list(),
  });
  const orders = (ordersQuery.data ?? []).filter((o) => o.status !== 'CANCELLED');

  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState('');
  const [subtotal, setSubtotal] = useState<number>(0);
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<string[]>([]);
  const [taxLines, setTaxLines] = useState<PurchaseInvoiceTaxLineInput[]>([]);
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');

  const orderDetailQuery = useQuery({
    queryKey: ['purchase-order-detail', purchaseOrderId],
    queryFn: () => purchaseOrdersApi.get(purchaseOrderId),
    enabled: !!purchaseOrderId,
  });
  const receipts = orderDetailQuery.data?.receipts ?? [];

  const taxTotal = taxLines.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const total = (Number(subtotal) || 0) + taxTotal;

  const mutation = useMutation({
    mutationFn: async () => {
      const invoice = await purchaseInvoicesApi.create({
        purchaseOrderId,
        supplierInvoiceNumber,
        supplierInvoiceDate,
        dueDate: dueDate || undefined,
        subtotal,
        goodsReceiptIds: selectedReceiptIds,
        taxLines: taxLines.filter((t) => t.concept && t.amount > 0),
        notes: notes || undefined,
      });
      if (file) {
        await purchaseInvoicesApi.uploadAttachment(invoice.id, file);
      }
      return invoice;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo registrar la factura';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!purchaseOrderId) {
      setError('Elegí una Orden de Compra');
      return;
    }
    if (!supplierInvoiceNumber.trim()) {
      setError('Ingresá el número de factura del proveedor');
      return;
    }
    if (!(subtotal > 0)) {
      setError('El subtotal debe ser mayor a cero');
      return;
    }
    mutation.mutate();
  }

  function updateTaxLine(index: number, patch: Partial<PurchaseInvoiceTaxLineInput>) {
    setTaxLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nueva Factura de Compra</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Orden de Compra">
            <select
              className={inputClass}
              value={purchaseOrderId}
              onChange={(e) => {
                setPurchaseOrderId(e.target.value);
                setSelectedReceiptIds([]);
              }}
            >
              <option value="">Elegir orden...</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.number} — {o.supplier.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Número de factura del proveedor">
              <input
                type="text"
                className={inputClass}
                placeholder="p. ej. 0001-00012345"
                value={supplierInvoiceNumber}
                onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
              />
            </Field>
            <Field label="Fecha de factura">
              <input
                type="date"
                className={inputClass}
                value={supplierInvoiceDate}
                onChange={(e) => setSupplierInvoiceDate(e.target.value)}
              />
            </Field>
            <Field label="Vencimiento (opcional)">
              <input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label="Subtotal (neto de impuestos)">
              <input
                type="number"
                min={0}
                step="any"
                className={inputClass}
                value={subtotal}
                onChange={(e) => setSubtotal(Number(e.target.value))}
              />
            </Field>
          </div>

          {purchaseOrderId && receipts.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-600 dark:text-slate-400">
                Remitos que cubre esta factura (opcional)
              </label>
              <div className="flex flex-col gap-1 rounded-lg border border-slate-200 dark:border-slate-800 p-2">
                {receipts.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={selectedReceiptIds.includes(r.id)}
                      onChange={(e) =>
                        setSelectedReceiptIds((prev) =>
                          e.target.checked ? [...prev, r.id] : prev.filter((id) => id !== r.id),
                        )
                      }
                    />
                    {new Date(r.receivedAt).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                    {r.supplierDocNumber ? ` — Remito ${r.supplierDocNumber}` : ''}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-slate-600 dark:text-slate-400">IVA / Percepciones</label>
              <button
                type="button"
                onClick={() => setTaxLines((prev) => [...prev, { type: 'IVA_CREDITO', concept: '', amount: 0 }])}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
              >
                + agregar fila
              </button>
            </div>
            {taxLines.map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  className={`${inputClass} w-40`}
                  value={line.type}
                  onChange={(e) => updateTaxLine(i, { type: e.target.value as PurchaseInvoiceTaxLineType })}
                >
                  {(Object.keys(TAX_LINE_TYPE_LABELS) as PurchaseInvoiceTaxLineType[]).map((t) => (
                    <option key={t} value={t}>
                      {TAX_LINE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Concepto, p. ej. IVA 21%"
                  className={`${inputClass} flex-1`}
                  value={line.concept}
                  onChange={(e) => updateTaxLine(i, { concept: e.target.value })}
                />
                <input
                  type="number"
                  min={0}
                  step="any"
                  placeholder="Monto"
                  className={`${inputClass} w-28 text-right`}
                  value={line.amount}
                  onChange={(e) => updateTaxLine(i, { amount: Number(e.target.value) })}
                />
                <button
                  type="button"
                  onClick={() => setTaxLines((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <Field label="Foto o escaneo de la factura">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-slate-700 dark:text-slate-300"
            />
          </Field>

          <Field label="Notas">
            <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          <p className="text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
            Total: ${total.toFixed(2)}
          </p>

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
              {mutation.isPending ? 'Registrando...' : 'Registrar factura'}
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
