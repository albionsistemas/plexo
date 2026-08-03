export function normalizeCuit(value: string): string {
  return value.replace(/\D/g, '');
}

/** Auto-formats while typing (XX-XXXXXXXX-X) - caps at 11 digits, doesn't
 * validate the check digit (that's isValidCuit on the backend, this is
 * purely visual so every user's CUIT looks the same in every table). */
export function formatCuitInput(value: string): string {
  const digits = normalizeCuit(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 10) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}
