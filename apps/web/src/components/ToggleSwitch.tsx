'use client';

/** Reused 3x across the Catálogos tab (transporte/forma de pago/plazo de
 * entrega) - worth extracting unlike the app's usual one-off modal
 * boilerplate, since it's the exact same control three times in the same
 * screen. */
export default function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
        checked ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition ${
          checked ? 'translate-x-[18px]' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
