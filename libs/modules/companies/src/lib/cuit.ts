const CHECK_DIGIT_MULTIPLIERS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function normalizeCuit(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** AFIP's mod-11 check digit for CUIT/CUIL - lets the form and the AFIP
 * lookup fail fast on a mistyped number instead of round-tripping to
 * AFIP's padrón first. */
export function isValidCuit(raw: string): boolean {
  const cuit = normalizeCuit(raw);
  if (cuit.length !== 11) {
    return false;
  }

  const digits = cuit.split('').map(Number);
  const sum = digits
    .slice(0, 10)
    .reduce((acc, digit, i) => acc + digit * CHECK_DIGIT_MULTIPLIERS[i], 0);
  const remainder = sum % 11;
  const checkDigit = remainder === 0 ? 0 : 11 - remainder;
  if (checkDigit === 10) {
    return false;
  }
  return checkDigit === digits[10];
}
