'use client';

import { activityLogApi, type TenantActivityEntry } from '@/lib/activityLog';
import {
  emailDomainApi,
  tenantSettingsApi,
  type DomainRecord,
  type EmailSenderMode,
  type ReminderTone,
  type TenantSettings,
} from '@/lib/tenantSettings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

function pillClass(active: boolean): string {
  return `rounded-lg px-3 py-1.5 text-xs font-medium transition ${
    active
      ? 'bg-indigo-600 text-white'
      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
  }`;
}

function statusPillClass(status: string | null): string {
  if (status === 'verified') {
    return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400';
  }
  if (status === 'failed' || status === 'partially_failed') {
    return 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400';
  }
  return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400';
}

function statusLabel(status: string | null): string {
  switch (status) {
    case 'verified':
      return 'Verificado';
    case 'pending':
      return 'Pendiente';
    case 'failed':
      return 'Falló';
    case 'partially_verified':
      return 'Parcialmente verificado';
    case 'partially_failed':
      return 'Parcialmente fallido';
    case 'not_started':
      return 'Sin iniciar';
    default:
      return 'Sin registrar';
  }
}

function errorMessage(err: AxiosError<{ message?: string | string[] }>, fallback: string): string {
  const message = err.response?.data?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

const TONE_PREVIEWS: Record<ReminderTone, { label: string; preview: string }> = {
  FRIENDLY: {
    label: 'Amigable',
    preview:
      '"¡Hola! Te escribimos para recordarte que la factura venció y todavía figura un saldo pendiente..."',
  },
  NEUTRAL: {
    label: 'Neutral',
    preview: '"Tu factura está vencida desde el {fecha}. Saldo pendiente: ${monto}..."',
  },
  FIRM: {
    label: 'Firme',
    preview: '"Te pedimos que regularices el pago a la brevedad para evitar inconvenientes..."',
  },
};

export default function PreferencesPage() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: tenantSettingsApi.get,
  });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Preferencias</h1>
      {isLoading || !settings ? (
        <div className="text-slate-500">Cargando...</div>
      ) : (
        <EmailSettingsCard settings={settings} />
      )}
      <ActivityLogCard />
    </div>
  );
}

function formatChanges(changes: TenantActivityEntry['changes']): string {
  if (!changes || Object.keys(changes).length === 0) return '—';
  return Object.entries(changes)
    .map(([field, { from, to }]) => `${field}: ${from ?? '—'} → ${to ?? '—'}`)
    .join(', ');
}

function ActivityLogCard() {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data, isLoading } = useQuery({
    queryKey: ['activity-log', page],
    queryFn: () => activityLogApi.getTenant({ page, pageSize }),
  });

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6">
      <h2 className="mb-4 text-sm font-medium text-slate-600 dark:text-slate-400">
        Actividad del tenant
      </h2>
      {isLoading || !data ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : data.items.length === 0 ? (
        <p className="text-sm text-slate-500">Todavía no hay actividad registrada.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="pb-2 pr-4">Fecha/hora</th>
                  <th className="pb-2 pr-4">Usuario</th>
                  <th className="pb-2 pr-4">Entidad</th>
                  <th className="pb-2 pr-4">Cambios</th>
                  <th className="pb-2">IP</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-200 dark:border-slate-800">
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {new Date(entry.occurredAt).toLocaleString('es-AR')}
                    </td>
                    <td className="py-2 pr-4">{entry.userName ?? entry.userEmail ?? '—'}</td>
                    <td className="py-2 pr-4">
                      {entry.entityTypeLabel ?? '—'}
                      {entry.entityLabel ? ` ${entry.entityLabel}` : ''}
                    </td>
                    <td className="py-2 pr-4 font-mono break-all">{formatChanges(entry.changes)}</td>
                    <td className="py-2">{entry.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-xs text-slate-500">Página {page}</span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={data.items.length < pageSize}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function EmailSettingsCard({ settings }: { settings: TenantSettings }) {
  const queryClient = useQueryClient();

  const [emailSenderMode, setEmailSenderMode] = useState<EmailSenderMode>(settings.emailSenderMode);
  const [emailFromName, setEmailFromName] = useState(settings.emailFromName ?? '');
  const [emailFromLocalPart, setEmailFromLocalPart] = useState(settings.emailFromLocalPart ?? '');
  const [reminderTone, setReminderTone] = useState<ReminderTone>(settings.reminderTone);
  const [reminderCcEmail, setReminderCcEmail] = useState(settings.reminderCcEmail ?? '');
  const [domain, setDomain] = useState(settings.emailCustomDomain ?? '');

  const [records, setRecords] = useState<DomainRecord[] | null>(null);
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [domainError, setDomainError] = useState('');

  function invalidateSettings() {
    void queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      tenantSettingsApi.update({
        emailSenderMode,
        emailFromName,
        emailFromLocalPart,
        reminderTone,
        reminderCcEmail: reminderCcEmail.trim() || null,
      }),
    onSuccess: () => {
      setSaveError('');
      setSaveMessage('Guardado');
      invalidateSettings();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setSaveMessage('');
      setSaveError(errorMessage(err, 'No se pudo guardar la preferencia'));
    },
  });

  const registerMutation = useMutation({
    mutationFn: () => emailDomainApi.register(domain),
    onSuccess: (result) => {
      setDomainError('');
      setRecords(result.records);
      invalidateSettings();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setRecords(null);
      setDomainError(errorMessage(err, 'No se pudo registrar el dominio'));
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () => emailDomainApi.verify(),
    onSuccess: (result) => {
      setDomainError('');
      setRecords(result.records);
      invalidateSettings();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setDomainError(errorMessage(err, 'No se pudo verificar el dominio'));
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveMessage('');
    setSaveError('');
    saveMutation.mutate();
  }

  const previewAddress = `${emailFromLocalPart || 'usuario'}@${domain || 'tudominio.com'}`;
  const previewFrom = emailFromName ? `${emailFromName} <${previewAddress}>` : previewAddress;
  const isPendingVerification =
    emailSenderMode === 'CUSTOM_DOMAIN' && settings.domainStatus !== 'verified';

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6">
      <h2 className="mb-4 text-sm font-medium text-slate-600 dark:text-slate-400">
        Remitente de emails a clientes
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEmailSenderMode('CUSTOM_DOMAIN')}
            className={pillClass(emailSenderMode === 'CUSTOM_DOMAIN')}
          >
            Dominio propio (recomendado)
          </button>
          <button
            type="button"
            onClick={() => setEmailSenderMode('SHARED')}
            className={pillClass(emailSenderMode === 'SHARED')}
          >
            Compartido Plexo
          </button>
        </div>

        {emailSenderMode === 'CUSTOM_DOMAIN' && (
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                Dominio
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="tuempresa.com"
                  className={`${inputClass} w-48`}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                Usuario
                <input
                  type="text"
                  value={emailFromLocalPart}
                  onChange={(e) => setEmailFromLocalPart(e.target.value)}
                  placeholder="facturas"
                  className={`${inputClass} w-32`}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                Nombre para mostrar
                <input
                  type="text"
                  value={emailFromName}
                  onChange={(e) => setEmailFromName(e.target.value)}
                  placeholder="Facturación Tu Empresa"
                  className={`${inputClass} w-56`}
                />
              </label>
              <button
                type="button"
                onClick={() => registerMutation.mutate()}
                disabled={!domain.trim() || registerMutation.isPending}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                {registerMutation.isPending ? 'Generando...' : 'Generar registros DNS'}
              </button>
              {settings.emailCustomDomain && (
                <button
                  type="button"
                  onClick={() => verifyMutation.mutate()}
                  disabled={verifyMutation.isPending}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  {verifyMutation.isPending ? 'Verificando...' : 'Verificar ahora'}
                </button>
              )}
            </div>

            <p className="text-xs text-slate-500">
              Remitente final: <span className="font-mono">{previewFrom}</span>
            </p>

            {settings.emailCustomDomain && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-600 dark:text-slate-400">Estado del dominio:</span>
                <span className={`rounded-full px-2 py-0.5 font-medium ${statusPillClass(settings.domainStatus)}`}>
                  {statusLabel(settings.domainStatus)}
                </span>
              </div>
            )}

            {isPendingVerification && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Mientras el dominio no esté verificado, los emails a clientes se siguen enviando
                desde el remitente compartido de Plexo.
              </p>
            )}

            {domainError && <p className="text-xs text-red-600 dark:text-red-400">{domainError}</p>}

            {records && records.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="pb-2 pr-4">Tipo</th>
                      <th className="pb-2 pr-4">Nombre</th>
                      <th className="pb-2 pr-4">Valor</th>
                      <th className="pb-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record, i) => (
                      <tr key={i} className="border-t border-slate-200 dark:border-slate-800">
                        <td className="py-2 pr-4 font-mono">{record.type}</td>
                        <td className="py-2 pr-4 font-mono">{record.name}</td>
                        <td className="py-2 pr-4 font-mono break-all">{record.value}</td>
                        <td className="py-2">
                          <span className={`rounded-full px-2 py-0.5 font-medium ${statusPillClass(record.status)}`}>
                            {statusLabel(record.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Tono del recordatorio de facturas vencidas
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TONE_PREVIEWS) as ReminderTone[]).map((tone) => (
              <button
                key={tone}
                type="button"
                onClick={() => setReminderTone(tone)}
                className={pillClass(reminderTone === tone)}
              >
                {TONE_PREVIEWS[tone].label}
              </button>
            ))}
          </div>
          <p className="text-xs italic text-slate-500">{TONE_PREVIEWS[reminderTone].preview}</p>
        </div>

        <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-400">
          Email para copia (CC) del recordatorio de cobranza
          <input
            type="email"
            value={reminderCcEmail}
            onChange={(e) => setReminderCcEmail(e.target.value)}
            placeholder="cobranzas@tuempresa.com"
            className={`${inputClass} w-72`}
          />
          <span className="text-xs text-slate-500">
            Opcional. Cada recordatorio que se le manda al cliente también le llega en copia a este
            buzón, sin necesitar un dominio propio.
          </span>
        </label>

        {saveError && <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>}
        {saveMessage && <p className="text-sm text-green-600 dark:text-green-400">{saveMessage}</p>}
        <button
          type="submit"
          disabled={saveMutation.isPending}
          className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  );
}
