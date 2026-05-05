/**
 * Normalize a Russian phone number to E.164 format (+7XXXXXXXXXX).
 * Returns null if the input cannot be parsed as a valid 10-digit RU number.
 *
 * Accepts:
 *   "+7 (999) 123-45-67"
 *   "8 999 123 45 67"
 *   "9991234567"
 *   "+79991234567"
 */
export function normalizeRuPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
    return '+7' + digits.slice(1);
  }
  if (digits.length === 10) {
    return '+7' + digits;
  }
  return null;
}

/**
 * Mask a phone for display: +79991234567 -> +7 (999) ***-**-67
 */
export function maskPhone(phone: string): string {
  const m = phone.match(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  if (!m) return phone;
  return `+7 (${m[1]}) ***-**-${m[4]}`;
}
