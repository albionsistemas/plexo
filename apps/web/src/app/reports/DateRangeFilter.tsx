'use client';

interface Props {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}

const inputClass =
  'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500';

export default function DateRangeFilter({ from, to, onFromChange, onToChange }: Props) {
  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-slate-400">
        Desde
        <input
          type="date"
          className={inputClass}
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-400">
        Hasta
        <input type="date" className={inputClass} value={to} onChange={(e) => onToChange(e.target.value)} />
      </label>
    </div>
  );
}
