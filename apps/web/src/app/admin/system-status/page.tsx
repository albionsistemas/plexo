'use client';

import { adminSystemStatusApi, type SystemStatusItem } from '@/lib/admin';
import { useQuery } from '@tanstack/react-query';

/**
 * "¿Está configurado o no?" para cada integración externa opcional que
 * este servidor lee de su .env - nunca "¿el token todavía es válido?"
 * (eso requeriría pegarle en vivo a cada proveedor, ver el doc comment
 * de AdminSystemStatusService del lado del backend). Refetch cada 60s -
 * suficiente para notar un cambio de .env tras un restart del server,
 * sin pegarle a esto en cada render.
 */
export default function AdminSystemStatusPage() {
  const { data: items, isLoading } = useQuery({
    queryKey: ['admin-system-status'],
    queryFn: adminSystemStatusApi.getStatus,
    refetchInterval: 60_000,
  });

  const missingCount = items?.filter((i) => !i.configured).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-white">Configuración del sistema</h1>
      <p className="text-xs text-slate-500">
        Estado de las variables de entorno de cada integración externa opcional (nunca se muestra el
        valor, sólo si está presente) - ver AdminSystemStatusService. No es un chequeo en vivo contra
        el proveedor: &quot;Configurado&quot; significa que las credenciales están cargadas, no que
        todavía sean válidas.
      </p>

      {isLoading || !items ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : (
        <>
          {missingCount > 0 && (
            <div className="rounded-xl border border-amber-900 bg-amber-950/40 p-4 text-sm text-amber-300">
              {missingCount} integración{missingCount !== 1 ? 'es' : ''} sin configurar en esta máquina.
            </div>
          )}
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <StatusRow key={item.key} item={item} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatusRow({ item }: { item: SystemStatusItem }) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-xl border p-4 ${
        item.configured ? 'border-slate-800 bg-slate-900' : 'border-red-900 bg-red-950/30'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.configured ? 'bg-green-500' : 'bg-red-500'}`}
          aria-hidden
        />
        <div>
          <p className="text-sm font-medium text-slate-200">{item.label}</p>
          {item.detail && <p className="mt-0.5 text-xs text-red-300">{item.detail}</p>}
        </div>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
          item.configured ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
        }`}
      >
        {item.configured ? 'Configurado' : 'Falta configurar'}
      </span>
    </div>
  );
}
