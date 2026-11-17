// Mirrors apps/api/src/common/validation/phone.ts: the server stores every phone as E.164
// (0123456789 becomes +84123456789), so the web must accept and compare that form too.
export function normalizePhone(value: string): string {
  const compact = value.trim().replace(/[\s()-]/g, '');
  if (/^0\d{9}$/.test(compact)) return `+84${compact.slice(1)}`;
  if (/^84\d{9}$/.test(compact)) return `+${compact}`;
  return compact;
}

export function isValidPhone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(normalizePhone(value));
}

export function samePhone(a: string, b: string): boolean {
  const normalized = normalizePhone(a);
  return normalized !== '' && normalized === normalizePhone(b);
}

function phoneDigits(value: string): string {
  return value.replace(/\D/g, '').replace(/^0/, '84');
}

export function matchesCustomerSearch(
  customer: { name: string; phone: string; code: string; email?: string },
  query: string,
): boolean {
  const text = query.trim().toLocaleLowerCase('vi');
  if (!text) return true;
  const fields = [customer.name, customer.phone, customer.code, customer.email ?? ''];
  if (fields.some((field) => field.toLocaleLowerCase('vi').includes(text))) return true;
  // Only a query made of phone characters is also compared as a phone number.
  if (!/^[+\d\s().-]+$/.test(text)) return false;
  const digits = phoneDigits(text);
  return digits !== '' && phoneDigits(customer.phone).includes(digits);
}
