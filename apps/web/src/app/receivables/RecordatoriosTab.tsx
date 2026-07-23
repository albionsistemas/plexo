'use client';

import { remindersApi, tenantSettingsApi, type TenantSettings } from '@/lib/tenantSettings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';

const PRESETS = [3, 5, 10];

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

function pillClass(active: boolean): string {
  return `rounded-lg px-3 py-1.5 text-xs font-medium transition ${
    active
      ? 'bg-indigo-600 text-white'
      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
  }`;
}

/** Server sends a fixed instant (next 01:00); this only formats the
 * countdown to it and re-renders every minute (see the interval in
 * ReminderStatusCard) - it doesn't refetch that instant itself. */
function formatRemaining(targetIso: string, now: Date): string {
  const diffMs = new Date(targetIso).getTime() - now.getTime();
  if (diffMs <= 0) return 'en curso';
  const totalMinutes = Math.round(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours === 0 ? `en ${minutes} min` : `en ${hours} h ${minutes} min`;
}

function errorMessage(err: AxiosError<{ message?: string | string[] }>, fallback: string): string {
  const message = err.response?.data?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

export default function RecordatoriosTab() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: tenantSettingsApi.get,
  });

  function invalidateBoth() {
    void queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
    // ReminderStatusCard reads the same interval via a separate query
    // (reminders-status also carries nextCronRunAt, which tenant-settings
    // doesn't) - without this it'd show the old value until its own 60s
    // refetch fires.
    void queryClient.invalidateQueries({ queryKey: ['reminders-status'] });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {isLoading || !settings ? (
        <div className="text-slate-500">Cargando...</div>
      ) : (
        <ArReminderCard settings={settings} onSaved={invalidateBoth} />
      )}
      <ReminderStatusCard />
    </div>
  );
}

function ArReminderCard({
  settings,
  onSaved,
}: {
  settings: TenantSettings;
  onSaved: () => void;
}) {
  const initialDays = settings.arReminderIntervalDays;
  const [enabled, setEnabled] = useState(initialDays !== null);
  const [preset, setPreset] = useState<number | 'custom'>(
    initialDays && (PRESETS as number[]).includes(initialDays)
      ? initialDays
      : initialDays
        ? 'custom'
        : PRESETS[0],
  );
  const [customDays, setCustomDays] = useState(
    initialDays && !(PRESETS as number[]).includes(initialDays) ? String(initialDays) : '',
  );
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      if (!enabled) {
        return tenantSettingsApi.update({ arReminderIntervalDays: null });
      }
      const days = preset === 'custom' ? Number(customDays) : preset;
      return tenantSettingsApi.update({ arReminderIntervalDays: days });
    },
    onSuccess: () => {
      setMessage('Guardado');
      onSaved();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setError(errorMessage(err, 'No se pudo guardar la preferencia'));
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setError('');
    if (enabled && preset === 'custom' && (!customDays.trim() || Number(customDays) < 1)) {
      setError('Ingresá una cantidad de días válida (1 o más)');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6">
      <h2 className="mb-4 text-sm font-medium text-slate-600 dark:text-slate-400">
        Recordatorio de facturas vencidas
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Recordar facturas vencidas de forma recurrente (por defecto se avisa una sola vez)
        </label>

        {enabled && (
          <div className="flex flex-col gap-2 pl-6">
            <p className="text-sm text-slate-600 dark:text-slate-400">Revisar cuentas a cobrar cada</p>
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setPreset(days)}
                  className={pillClass(preset === days)}
                >
                  {days} días
                </button>
              ))}
              <button type="button" onClick={() => setPreset('custom')} className={pillClass(preset === 'custom')}>
                Otra
              </button>
              {preset === 'custom' && (
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={customDays}
                  onChange={(e) => setCustomDays(e.target.value)}
                  placeholder="días"
                  className={`${inputClass} w-20`}
                />
              )}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {mutation.isPending ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  );
}

function ReminderStatusCard() {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  const { data: status } = useQuery({
    queryKey: ['reminders-status'],
    queryFn: remindersApi.getStatus,
    refetchInterval: 60_000,
  });
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const runNowMutation = useMutation({
    mutationFn: remindersApi.runNow,
    onSuccess: (result) => {
      setActionError('');
      setActionMessage(
        `Ejecutado: ${result.becomingOverdue} recién vencida(s), ${result.recurring} recordatorio(s) recurrente(s) enviados`,
      );
      void queryClient.invalidateQueries({ queryKey: ['reminders-status'] });
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setActionMessage('');
      setActionError(errorMessage(err, 'No se pudo ejecutar el recordatorio'));
    },
  });

  const resetMutation = useMutation({
    mutationFn: remindersApi.reset,
    onSuccess: (result) => {
      setActionError('');
      setActionMessage(`Conteo reiniciado para ${result.reset} factura(s) vencida(s), sin enviar mails`);
      void queryClient.invalidateQueries({ queryKey: ['reminders-status'] });
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setActionMessage('');
      setActionError(errorMessage(err, 'No se pudo reiniciar el conteo'));
    },
  });

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6">
      <h2 className="mb-4 text-sm font-medium text-slate-600 dark:text-slate-400">
        Estado del recordatorio automático
      </h2>
      {!status ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400">Recordatorio recurrente</span>
            <span className="text-slate-800 dark:text-slate-200">
              {status.recurringEnabled
                ? `Cada ${status.arReminderIntervalDays} días`
                : 'Desactivado (solo alerta única)'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400">Próxima corrida del cron</span>
            <span className="text-slate-800 dark:text-slate-200">
              {formatRemaining(status.nextCronRunAt, now)} (todos los días a la 01:00)
            </span>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
        <button
          type="button"
          onClick={() => runNowMutation.mutate()}
          disabled={runNowMutation.isPending}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          {runNowMutation.isPending ? 'Ejecutando...' : 'Ejecutar recordatorio ahora'}
        </button>
        <button
          type="button"
          onClick={() => resetMutation.mutate()}
          disabled={resetMutation.isPending}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          {resetMutation.isPending ? 'Reiniciando...' : 'Reiniciar conteo (sin enviar mails)'}
        </button>
      </div>
      {actionError && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{actionError}</p>}
      {actionMessage && <p className="mt-3 text-xs text-slate-500 dark:text-slate-500">{actionMessage}</p>}
    </div>
  );
}
