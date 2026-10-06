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
