'use client';

import { activityLogApi, type TenantActivityEntry } from '@/lib/activityLog';
import CompanyListView from '@/components/CompanyListView';
import { formatCuitInput } from '@/lib/cuit';
import { INVOICE_PDF_FORMATS, invoicingPreferencesApi, type InvoicePdfFormat } from '@/lib/invoicing';
import { inventoryApi, type AutoReplenishmentResult } from '@/lib/inventory';
import {
  afipCertificateApi,
  emailDomainApi,
  tenantInfoApi,
  tenantSettingsApi,
  type AfipEnvironment,
  type DomainRecord,
  type EmailSenderMode,
  type ReminderTone,
  type TenantSettings,
  type TenantTaxCondition,
} from '@/lib/tenantSettings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';
import CurrencySettings from './CurrencySettings';
import MercadoPagoCard from './MercadoPagoCard';

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
        <>
          <EmailSettingsCard settings={settings} />
          <CurrencySettings />
          <CompanyListView
            role="BRANCH"
            editable
            title="Mis sucursales"
            newLabel="+ Nueva sucursal"
            variant="card"
          />
          <AfipCertificateCard settings={settings} />
          <MercadoPagoCard />
          <InvoicePdfCard settings={settings} />
          <WithholdingAgentCard settings={settings} />
          <InventoryPricingCard settings={settings} />
          <ReplenishmentCard />
        </>
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

/** Lee un input[type=file] como texto plano (FileReader, no upload a
 * disco) - el certificado/clave viajan como PEM en el body del POST y se
 * cifran recién en el backend (ver TenantSettingsService.
 * uploadAfipCertificate). Nunca tocan almacenamiento propio. */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo'));
    reader.readAsText(file);
  });
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/** Certificado/clave AFIP del tenant - reemplaza lo que antes eran
 * variables de entorno del proceso (un solo CUIT para toda la instancia,
 * ver companies.module.ts). Se pegan/suben como archivos .crt/.key, viajan
 * como texto y el backend los cifra (AES-256-GCM) antes de guardarlos; acá
 * nunca se ve ni se guarda el contenido descifrado más que en memoria
 * mientras se arma el POST. */
function AfipCertificateCard({ settings }: { settings: TenantSettings }) {
  const queryClient = useQueryClient();
  const [env, setEnv] = useState<AfipEnvironment>(settings.afipEnv);
  const [certPem, setCertPem] = useState('');
  const [keyPem, setKeyPem] = useState('');
  const [certFileName, setCertFileName] = useState('');
  const [keyFileName, setKeyFileName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [taxId, setTaxId] = useState(settings.tenantTaxId ?? '');
  const [taxIdMessage, setTaxIdMessage] = useState('');
  const [taxIdError, setTaxIdError] = useState('');
  const [ownTaxCondition, setOwnTaxCondition] = useState<TenantTaxCondition | ''>(
    settings.ownTaxCondition ?? '',
  );
  const [ownTaxConditionMessage, setOwnTaxConditionMessage] = useState('');

  function invalidateSettings() {
    void queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
  }

  const taxIdMutation = useMutation({
    mutationFn: () => tenantInfoApi.update(taxId),
    onSuccess: () => {
      setTaxIdError('');
      setTaxIdMessage('Guardado');
      invalidateSettings();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setTaxIdMessage('');
      setTaxIdError(errorMessage(err, 'No se pudo guardar el CUIT'));
    },
  });

  const ownTaxConditionMutation = useMutation({
    mutationFn: (value: TenantTaxCondition) => tenantSettingsApi.update({ ownTaxCondition: value }),
    onSuccess: () => {
      setOwnTaxConditionMessage('Guardado');
      invalidateSettings();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: () => afipCertificateApi.upload({ certPem, keyPem, env }),
    onSuccess: () => {
      setError('');
      setMessage('Certificado guardado');
      setCertPem('');
      setKeyPem('');
      setCertFileName('');
      setKeyFileName('');
      invalidateSettings();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setMessage('');
      setError(errorMessage(err, 'No se pudo guardar el certificado'));
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => afipCertificateApi.remove(),
    onSuccess: () => {
      setError('');
      setMessage('Certificado eliminado');
      invalidateSettings();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setError(errorMessage(err, 'No se pudo eliminar el certificado'));
    },
  });

  async function handleCertFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCertPem(await readFileAsText(file));
    setCertFileName(file.name);
  }

  async function handleKeyFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setKeyPem(await readFileAsText(file));
    setKeyFileName(file.name);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    uploadMutation.mutate();
  }

  const expiresInDays = settings.afipCertExpiresAt ? daysUntil(settings.afipCertExpiresAt) : null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6">
      <h2 className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">
        Certificado AFIP (facturación electrónica)
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        Certificado digital (.crt) y clave privada (.key) propios de esta empresa, autorizados para
        WSFE en el Administrador de Relaciones de Clave Fiscal de AFIP. El Punto de Venta se define
        por sucursal (ver &quot;Mis sucursales&quot; más arriba).
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-4">
        <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
          CUIT de la empresa
          <input
            type="text"
            value={taxId}
            onChange={(e) => setTaxId(formatCuitInput(e.target.value))}
            placeholder="30-71659554-9"
            className={`${inputClass} w-40`}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setTaxIdMessage('');
            taxIdMutation.mutate();
          }}
          disabled={!taxId.trim() || taxIdMutation.isPending}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          {taxIdMutation.isPending ? 'Guardando...' : 'Guardar CUIT'}
        </button>
        {taxIdError && <p className="text-xs text-red-600 dark:text-red-400">{taxIdError}</p>}
        {taxIdMessage && <p className="text-xs text-green-600 dark:text-green-400">{taxIdMessage}</p>}
        {!settings.tenantTaxId && (
          <p className="w-full text-xs text-amber-600 dark:text-amber-400">
            El certificado AFIP se registra a nombre de este CUIT - sin él, el certificado no queda
            realmente configurado aunque lo hayas subido.
          </p>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-4">
        <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
          Condición IVA propia
          <select
            value={ownTaxCondition}
            onChange={(e) => setOwnTaxCondition(e.target.value as TenantTaxCondition)}
            className={`${inputClass} w-56`}
          >
            <option value="" disabled>
              Sin configurar
            </option>
            <option value="RESPONSABLE_INSCRIPTO">Responsable Inscripto</option>
            <option value="MONOTRIBUTO">Monotributo</option>
            <option value="EXENTO">Exento</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setOwnTaxConditionMessage('');
            if (ownTaxCondition) ownTaxConditionMutation.mutate(ownTaxCondition);
          }}
          disabled={!ownTaxCondition || ownTaxConditionMutation.isPending}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          {ownTaxConditionMutation.isPending ? 'Guardando...' : 'Guardar condición IVA'}
        </button>
        {ownTaxConditionMessage && (
          <p className="text-xs text-green-600 dark:text-green-400">{ownTaxConditionMessage}</p>
        )}
        <p className="w-full text-xs text-slate-500">
          Determina qué letra de comprobante corresponde emitir (A/B/C) - Nueva factura la sugiere o
          la fuerza automáticamente en base a esto y a la condición IVA del cliente.
        </p>
      </div>

      <details className="mb-4 rounded-lg border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-600 dark:text-slate-400">
        <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300">
          ¿Cómo consigo el certificado AFIP? (guía paso a paso)
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <div>
            <p className="mb-1 font-medium text-slate-700 dark:text-slate-300">
              1. Generá la clave privada y el pedido de certificado (CSR)
            </p>
            <p className="mb-2">
              Con OpenSSL, en cualquier terminal (reemplazá el CUIT y el nombre):
            </p>
            <pre className="overflow-x-auto rounded-md bg-slate-200 dark:bg-slate-800 p-2 font-mono text-[11px]">
{`openssl req -new -newkey rsa:2048 -nodes \\
  -keyout empresa.key -out empresa.csr \\
  -subj "/C=AR/O=Nombre Empresa/CN=empresa/serialNumber=CUIT 20XXXXXXXXX"`}
            </pre>
            <p className="mt-1">
              Esto genera dos archivos: <span className="font-mono">empresa.key</span> (clave
              privada - nunca se sube a AFIP, sólo acá) y{' '}
              <span className="font-mono">empresa.csr</span> (pedido de certificado, ese sí va a
              AFIP).
            </p>
          </div>
          <div>
            <p className="mb-1 font-medium text-slate-700 dark:text-slate-300">
              2. Para probar primero (Homologación - recomendado)
            </p>
            <ol className="ml-4 list-decimal">
              <li>Entrá a AFIP con Clave Fiscal → &quot;Administrador de Relaciones de Clave Fiscal&quot;.</li>
              <li>
                Buscá el servicio &quot;WSASS&quot; (Administración de Certificados Digitales),
                sección de testing/homologación.
              </li>
              <li>
                Subí el <span className="font-mono">.csr</span> del paso 1 y descargá el{' '}
                <span className="font-mono">.crt</span> (se emite al toque, sin trámite adicional).
              </li>
              <li>Asociá ese certificado al web service &quot;wsfe&quot; para tu CUIT.</li>
              <li>
                Subí acá abajo el <span className="font-mono">.crt</span> descargado y el{' '}
                <span className="font-mono">.key</span> del paso 1, ambiente
                &quot;Homologación&quot;.
              </li>
            </ol>
          </div>
          <div>
            <p className="mb-1 font-medium text-slate-700 dark:text-slate-300">
              3. Para facturar de verdad (Producción)
            </p>
            <ol className="ml-4 list-decimal">
              <li>
                En &quot;Administrador de Relaciones de Clave Fiscal&quot; → &quot;Nueva
                Relación&quot; → servicio &quot;wsfe&quot; (Facturación Electrónica), representado
                tu propio CUIT.
              </li>
              <li>
                En esa relación, adjuntá el certificado de producción (mismo{' '}
                <span className="font-mono">.csr</span>, o generá uno nuevo con el comando de
                arriba).
              </li>
              <li>
                Subí acá el <span className="font-mono">.crt</span> de producción y su{' '}
                <span className="font-mono">.key</span>, ambiente &quot;Producción&quot;.
              </li>
            </ol>
          </div>
          <p className="italic text-slate-500">
            Homologación y Producción son certificados y trámites separados - no sirve el mismo
            certificado para los dos ambientes.
          </p>
        </div>
      </details>

      {settings.afipConfigured ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-4">
          <span className="rounded-full bg-green-100 dark:bg-green-900/40 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
            Certificado cargado
          </span>
          <span className="text-xs text-slate-600 dark:text-slate-400">
            Ambiente: {settings.afipEnv === 'PRODUCCION' ? 'Producción' : 'Homologación'}
          </span>
          {settings.afipCertExpiresAt && (
            <span className="text-xs text-slate-600 dark:text-slate-400">
              Vence el {new Date(settings.afipCertExpiresAt).toLocaleDateString('es-AR')}
              {expiresInDays !== null && expiresInDays <= 30 && (
                <span className="ml-1 font-medium text-amber-600 dark:text-amber-400">
                  ({expiresInDays <= 0 ? 'vencido' : `en ${expiresInDays} días`})
                </span>
              )}
            </span>
          )}
          <button
            type="button"
            onClick={() => removeMutation.mutate()}
            disabled={removeMutation.isPending}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {removeMutation.isPending ? 'Quitando...' : 'Quitar certificado'}
          </button>
        </div>
      ) : (
        <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
          Todavía no hay un certificado cargado - la emisión de comprobantes con CAE real no va a
          funcionar hasta que subas uno.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEnv('HOMOLOGACION')}
            className={pillClass(env === 'HOMOLOGACION')}
          >
            Homologación (sandbox)
          </button>
          <button
            type="button"
            onClick={() => setEnv('PRODUCCION')}
            className={pillClass(env === 'PRODUCCION')}
          >
            Producción
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
            Certificado (.crt / .pem)
            <input type="file" accept=".crt,.pem,.cer" onChange={handleCertFile} className="text-xs" />
            {certFileName && <span className="text-slate-500">{certFileName}</span>}
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
            Clave privada (.key)
            <input type="file" accept=".key,.pem" onChange={handleKeyFile} className="text-xs" />
            {keyFileName && <span className="text-slate-500">{keyFileName}</span>}
          </label>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}
        <button
          type="submit"
          disabled={!certPem || !keyPem || uploadMutation.isPending}
          className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {uploadMutation.isPending ? 'Guardando...' : 'Guardar certificado'}
        </button>
      </form>
    </div>
  );
}

/** El fisco (AFIP/ARBA/etc.) es quien otorga el carácter de agente de
 * retención, no es algo que se active solo - por eso estos 3 flags son un
 * checkbox explícito, no un default en true. Gatillan si puede
 * crearse/aplicarse un WithholdingRegime de ese taxType (ver /taxes ->
 * Retenciones y el formulario de pago en Compras). */
function WithholdingAgentCard({ settings }: { settings: TenantSettings }) {
  const queryClient = useQueryClient();
  const [incomeTax, setIncomeTax] = useState(settings.withholdingAgentIncomeTax);
  const [vat, setVat] = useState(settings.withholdingAgentVat);
  const [grossIncome, setGrossIncome] = useState(settings.withholdingAgentGrossIncome);
  const [message, setMessage] = useState('');

  const mutation = useMutation({
    mutationFn: (patch: Partial<{ withholdingAgentIncomeTax: boolean; withholdingAgentVat: boolean; withholdingAgentGrossIncome: boolean }>) =>
      tenantSettingsApi.update(patch),
    onSuccess: () => {
      setMessage('Guardado');
      void queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
    },
  });

  function toggle(
    field: 'withholdingAgentIncomeTax' | 'withholdingAgentVat' | 'withholdingAgentGrossIncome',
    current: boolean,
    setter: (v: boolean) => void,
  ) {
    setter(!current);
    setMessage('');
    mutation.mutate({ [field]: !current });
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6">
      <h2 className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">
        Retenciones a proveedores
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        Marcá sólo los impuestos para los que AFIP/ARBA (u otro organismo provincial) ya te otorgó el
        carácter de agente de retención. Habilita el catálogo de regímenes en Impuestos → Retenciones
        y la opción de retener al registrar un pago en Compras.
      </p>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={incomeTax}
            onChange={() => toggle('withholdingAgentIncomeTax', incomeTax, setIncomeTax)}
          />
          Somos agentes de retención de Ganancias
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={vat} onChange={() => toggle('withholdingAgentVat', vat, setVat)} />
          Somos agentes de retención de IVA
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={grossIncome}
            onChange={() => toggle('withholdingAgentGrossIncome', grossIncome, setGrossIncome)}
          />
          Somos agentes de retención de Ingresos Brutos (IIBB)
        </label>
      </div>
      {message && <p className="mt-3 text-xs text-green-600 dark:text-green-400">{message}</p>}
    </div>
  );
}

/** Sugerencia genérica de % de remarca para cuando un Article no tiene su
 * propio override (Inventario → editar artículo) - nunca recalcula un
 * precio ya cargado solo, sólo pre-completa el campo la próxima vez que
 * alguien cree o edite un artículo sin su propio %. */
/** Datos fiscales del emisor que van en el PDF de Facturación (ver
 * @plexo/invoicing/pdf) - CUIT/razón social ya se cargan en otro lado
 * (tenantInfoApi/Tenant.name), acá sólo lo que faltaba. El formato de
 * papel por defecto es una preferencia del USUARIO (User.invoicePdfFormat,
 * no TenantSettings) - mismo criterio que purchaseDocumentPdfStyle - por
 * eso usa su propia mutation/query en vez de tenantSettingsApi. */
function InvoicePdfCard({ settings }: { settings: TenantSettings }) {
  const queryClient = useQueryClient();
  const [fiscalAddress, setFiscalAddress] = useState(settings.fiscalAddress ?? '');
  const [grossIncomeNumber, setGrossIncomeNumber] = useState(settings.grossIncomeNumber ?? '');
  const [activityStartDate, setActivityStartDate] = useState(
    settings.activityStartDate ? settings.activityStartDate.slice(0, 10) : '',
  );
  const [message, setMessage] = useState('');

  const { data: preferences } = useQuery({
    queryKey: ['invoicing-preferences'],
    queryFn: invoicingPreferencesApi.get,
  });

  const saveFiscalDataMutation = useMutation({
    mutationFn: () =>
      tenantSettingsApi.update({
        fiscalAddress: fiscalAddress.trim() === '' ? null : fiscalAddress.trim(),
        grossIncomeNumber: grossIncomeNumber.trim() === '' ? null : grossIncomeNumber.trim(),
        activityStartDate: activityStartDate === '' ? null : activityStartDate,
      }),
    onSuccess: () => {
      setMessage('Guardado');
      void queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
    },
  });

  const formatMutation = useMutation({
    mutationFn: (invoicePdfFormat: InvoicePdfFormat) => invoicingPreferencesApi.update(invoicePdfFormat),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['invoicing-preferences'] }),
  });

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6">
      <h2 className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">
        Datos fiscales para la Factura
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        Domicilio, Ingresos Brutos e inicio de actividades del emisor - se imprimen en el PDF de
        Facturación (CUIT y razón social ya se cargan arriba, en Certificado AFIP).
      </p>
      <div className="grid grid-cols-2 gap-4">
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-slate-500">Domicilio fiscal</span>
          <input
            value={fiscalAddress}
            onChange={(e) => setFiscalAddress(e.target.value)}
            placeholder="Av. Siempre Viva 123, CABA"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Ingresos Brutos</span>
          <input
            value={grossIncomeNumber}
            onChange={(e) => setGrossIncomeNumber(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Inicio de actividades</span>
          <input
            type="date"
            value={activityStartDate}
            onChange={(e) => setActivityStartDate(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setMessage('');
            saveFiscalDataMutation.mutate();
          }}
          disabled={saveFiscalDataMutation.isPending}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {saveFiscalDataMutation.isPending ? 'Guardando...' : 'Guardar'}
        </button>
        {message && <p className="text-xs text-green-600 dark:text-green-400">{message}</p>}
      </div>

      {preferences && (
        <div className="mt-6 flex items-center gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
          <span className="text-xs text-slate-500">Formato de PDF por defecto</span>
          <select
            value={preferences.invoicePdfFormat}
            onChange={(e) => formatMutation.mutate(e.target.value as InvoicePdfFormat)}
            className={inputClass}
          >
            {INVOICE_PDF_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function InventoryPricingCard({ settings }: { settings: TenantSettings }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(settings.defaultMarkupPercent?.toString() ?? '');
  const [message, setMessage] = useState('');

  const mutation = useMutation({
    mutationFn: (defaultMarkupPercent: number | null) => tenantSettingsApi.update({ defaultMarkupPercent }),
    onSuccess: () => {
      setMessage('Guardado');
      void queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
    },
  });

  function handleSave() {
    setMessage('');
    mutation.mutate(value.trim() === '' ? null : Number(value));
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6">
      <h2 className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">
        Precios de Inventario
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        % de remarca sugerido por defecto para artículos que no tengan uno propio configurado (Inventario
        → editar artículo). Sólo pre-completa el precio de venta al cargar/editar - nunca lo cambia solo
        después.
      </p>
      <div className="flex items-center gap-3">
        <input
          type="number"
          min={0}
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="p. ej. 40"
          className={`${inputClass} w-32`}
        />
        <span className="text-sm text-slate-500">%</span>
        <button
          type="button"
          onClick={handleSave}
          disabled={mutation.isPending}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {mutation.isPending ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
      {message && <p className="mt-3 text-xs text-green-600 dark:text-green-400">{message}</p>}
    </div>
  );
}

/** Dispara a mano el mismo barrido que corre solo todos los días a las
 * 2am (InventoryReplenishmentSchedulerService) para las variantes con
 * "Automático" tildado en Inventario → Alertas de stock - útil para no
 * esperar hasta la próxima corrida después de activar el flag en alguna. */
function ReplenishmentCard() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: inventoryApi.runReplenishmentNow,
    onSuccess: (result: AutoReplenishmentResult) => {
      setError('');
      setMessage(
        result.created === 0 && result.skippedAlreadyToday === 0
          ? 'Sin novedades: ningún artículo con reposición automática activada está bajo su mínimo ahora mismo'
          : `${result.created} pedido(s) de cotización creado(s)` +
              (result.skippedAlreadyToday > 0
                ? `, ${result.skippedAlreadyToday} proveedor(es) ya tenían uno generado hoy`
                : ''),
      );
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setMessage('');
      setError(errorMessage(err, 'No se pudo ejecutar la reposición automática'));
    },
  });

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6">
      <h2 className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">
        Reposición automática de stock
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        Corre sola todos los días a la madrugada y genera un Pedido de Cotización por proveedor para
        las variantes marcadas &quot;Automático&quot; en Inventario → Alertas de stock. Usá este botón
        para ejecutarla ahora mismo en vez de esperar a la próxima corrida.
      </p>
      <button
        type="button"
        onClick={() => {
          setMessage('');
          setError('');
          mutation.mutate();
        }}
        disabled={mutation.isPending}
        className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
      >
        {mutation.isPending ? 'Ejecutando...' : 'Ejecutar reposición ahora'}
      </button>
      {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {message && <p className="mt-3 text-xs text-slate-500 dark:text-slate-500">{message}</p>}
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
            Compartido Oplex
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
                desde el remitente compartido de Oplex.
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
