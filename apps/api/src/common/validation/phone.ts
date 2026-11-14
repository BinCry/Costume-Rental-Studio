import { z } from 'zod';

export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => {
    const compact = value.replace(/[\s()-]/g, '');
    if (/^0\d{9}$/.test(compact)) return `+84${compact.slice(1)}`;
    if (/^84\d{9}$/.test(compact)) return `+${compact}`;
    return compact;
  })
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Use a valid E.164 phone number'));

/**
 * Digits to look for in a stored E.164 phone when a search box holds a phone number.
 * A local 0… number becomes 84…, so 0123 456 finds +84123456789. Text queries give ''.
 */
export function phoneSearchDigits(search: string): string {
  if (!/^[+\d\s().-]+$/.test(search)) return '';
  return search.replace(/\D/g, '').replace(/^0/, '84');
}
