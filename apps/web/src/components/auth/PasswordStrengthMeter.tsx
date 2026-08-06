'use client';

interface Rule {
  label: string;
  test: (value: string) => boolean;
}

const RULES: Rule[] = [
  { label: 'Mínimo 8 caracteres', test: (v) => v.length >= 8 },
  { label: 'Al menos un número', test: (v) => /\d/.test(v) },
  { label: 'Al menos un símbolo', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

const LEVEL_COLOR = ['bg-red-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500'];
const LEVEL_LABEL = ['Muy débil', 'Débil', 'Buena', 'Fuerte'];

/** Used by Signup and Reset Password (both are "choose a new password"
 * moments) - purely a UX nudge, the real minimum (8 chars) is still
 * enforced by the zod schema/backend DTO regardless of what this shows. */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const passedCount = RULES.filter((rule) => rule.test(password)).length;
  const level = password.length === 0 ? 0 : passedCount;

  return (
    <div className="mt-1.5">
      <div className="flex gap-1">
        {RULES.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < level ? LEVEL_COLOR[level] : 'bg-slate-200 dark:bg-slate-700'
            }`}
          />
        ))}
      </div>
      {password.length > 0 && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{LEVEL_LABEL[level]}</p>
      )}
    </div>
  );
}
