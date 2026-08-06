'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

// forwardRef so react-hook-form's register() can attach directly
// (register('email') spreads {ref, onChange, onBlur, name} onto the input).
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { hasError, className = '', ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`w-full rounded-lg border bg-white/80 dark:bg-slate-900/60 backdrop-blur px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition focus:ring-2 focus:ring-indigo-500/40 ${
        hasError
          ? 'border-red-400 dark:border-red-500 focus:border-red-500'
          : 'border-slate-300 dark:border-slate-700 focus:border-indigo-500'
      } ${className}`}
      {...props}
    />
  );
});
