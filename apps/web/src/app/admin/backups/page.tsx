'use client';

import { adminBackupsApi, type BackupStatus } from '@/lib/admin';
import { useQuery } from '@tanstack/react-query';

const STATUS_LABELS: Record<BackupStatus, string> = {
  PENDING: 'En curso',
  COMPLETED: 'Completado',
  FAILED: 'Falló',
};

const STATUS_COLORS: Record<BackupStatus, string> = {
  PENDING: 'bg-amber-900/50 text-amber-300',
  COMPLETED: 'bg-green-900/50 text-green-300',
  FAILED: 'bg-red-900/50 text-red-300',
};

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

// Sólo lectura a propósito - sin botón de "Restaurar backup" (ver
// PROGRESS.md): un restore pisa TODOS los tenants de la plataforma de una,
// no algo para un click en esta primera versión.
export default function AdminBackupsPage() {
  const { data: backups, isLoading } = useQuery({
    queryKey: ['admin-backups'],
    queryFn: () => adminBackupsApi.list(60),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-white">Backups</h1>
      <p className="text-sm text-slate-500">
        Corrida diaria automática. Sólo lectura — no hay restauración desde acá.
      </p>

      <div className="rounded-xl border border-slate-800 bg-slate-900">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Cargando backups...</p>
        ) : !backups || backups.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Todavía no corrió ningún backup.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                  <th className="p-3">Inicio</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-right">Tamaño</th>
                  <th className="p-3">Archivo</th>
                  <th className="p-3">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => (
                  <tr key={backup.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="p-3 whitespace-nowrap text-slate-400">
                      {new Date(backup.startedAt).toLocaleString('es-AR')}
                    </td>
                    <td className="p-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[backup.status]}`}>
                        {STATUS_LABELS[backup.status]}
                      </span>
                    </td>
                    <td className="p-3 text-right text-slate-300">{formatBytes(backup.sizeBytes)}</td>
                    <td className="p-3 font-mono text-xs text-slate-500">{backup.filePath ?? '—'}</td>
                    <td className="p-3 text-xs text-slate-500">{backup.errorMessage ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
