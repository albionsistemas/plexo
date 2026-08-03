'use client';

import { useState } from 'react';
import CotizacionesTab from './CotizacionesTab';
import ConfiguracionTab from './ConfiguracionTab';

const TABS = [
  { id: 'cotizaciones', label: 'Cotizaciones' },
  { id: 'configuracion', label: 'Configuración' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function QuotesPage() {
  const [tab, setTab] = useState<TabId>('cotizaciones');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Cotizaciones</h1>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium transition ${
              tab === t.id
                ? 'border-b-2 border-indigo-500 text-slate-900 dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'cotizaciones' && <CotizacionesTab />}
      {tab === 'configuracion' && <ConfiguracionTab />}
    </div>
  );
}
