'use client';

import QuoteRequestFormModal from '@/app/purchases/QuoteRequestFormModal';
import { inventoryApi, resolveUploadUrl, type ReorderSuggestion } from '@/lib/inventory';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBasket } from 'lucide-react';
import { useState } from 'react';

/** Sugerencias de reposición (GET /inventory/reorder-suggestions) - antes
 * un endpoint huérfano sin ningún consumidor en el frontend (ver
 * PROGRESS.md). Compara mínimo vs. stock actual por DEPÓSITO individual
 * (mismo criterio que ya usa el widget "Alertas de stock" del Tablero) -
 * a diferencia de la vista Tabla de esta misma página, que resalta en
 * rojo comparando el TOTAL agregado entre depósitos, así que un artículo
 * puede aparecer acá sin estar marcado en rojo en la tabla (compensación
 * entre depósitos) y viceversa. */
export default function StockAlertsPanel() {
  const alertsQuery = useQuery({
    queryKey: ['inventory-reorder-suggestions'],
    queryFn: inventoryApi.listReorderSuggestions,
  });
  const [quoteRequestFor, setQuoteRequestFor] = useState<ReorderSuggestion | null>(null);

  const alerts = alertsQuery.data ?? [];

  if (alertsQuery.isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-slate-500">Cargando alertas...</div>
    );
  }

  if (alertsQuery.error) {
    return (
      <div className="flex h-40 items-center justify-center text-red-600 dark:text-red-400">
        Error al cargar las alertas de stock
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-slate-400 dark:text-slate-600">
        Sin alertas — todo está por encima del mínimo configurado en cada depósito.
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {alerts.map((a) => (
          <div
            key={`${a.warehouseId}:${a.articleVariantId}`}
            className="flex items-center gap-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
              {a.imageUrl ? (
                <img
                  src={resolveUploadUrl(a.imageUrl) ?? undefined}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <ShoppingBasket className="h-5 w-5 text-slate-400 dark:text-slate-600" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                {a.articleName}
                {a.variantLabel && <span className="text-slate-500"> · {a.variantLabel}</span>}
              </p>
              <p className="truncate text-xs text-slate-500">
                {a.sku} · {a.warehouseName}
              </p>
              {a.preferredSupplierName && (
                <p className="truncate text-xs text-slate-500">
                  Proveedor preferido: {a.preferredSupplierName}
                </p>
              )}
            </div>
            <div className="shrink-0 text-right text-xs text-red-700 dark:text-red-300">
              <p>
                {a.currentQuantity} / {a.minimumQuantity} mín
              </p>
              <p className="font-semibold">Pedir {a.suggestedQuantity}</p>
            </div>
            <button
              type="button"
              onClick={() => setQuoteRequestFor(a)}
              className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
            >
              Pedir cotización
            </button>
          </div>
        ))}
      </div>

      {quoteRequestFor && (
        <QuoteRequestFormModal
          initialLine={{
            articleVariantId: quoteRequestFor.articleVariantId,
            quantity: quoteRequestFor.suggestedQuantity,
          }}
          initialSupplierId={quoteRequestFor.preferredSupplierId ?? undefined}
          onClose={() => setQuoteRequestFor(null)}
        />
      )}
    </>
  );
}
