'use client';

import { currentMonthRange, currentQuarterRange, currentYearRange, previousMonthRange } from './dateRange';

interface Props {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onPreset: (range: { from: string; to: string }) => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

const PRESETS: { label: string; range: () => { from: string; to: string } }[] = [
  { label: 'Este mes', range: currentMonthRange },
  { label: 'Mes anterior', range: previousMonthRange },
  { label: 'Este trimestre', range: currentQuarterRange },
  { label: 'Este año', range: currentYearRange },
];

export default function DateRangeFilter({ from, to, onFromChange, onToChange, onPreset }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
        Desde
        <input
          type="date"
          className={inputClass}
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
        Hasta
        <input type="date" className={inputClass} value={to} onChange={(e) => onToChange(e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onPreset(p.range())}
            className="rounded-lg bg-slate-200 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 transition hover:text-slate-800 dark:hover:text-slate-200"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
