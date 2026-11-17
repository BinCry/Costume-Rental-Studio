import type { Customer } from '../fixtures/studio';
import { normalizePhone } from './phone';

function phoneSearchForms(value: string) {
  const digits = normalizePhone(value).replace(/\D/g, '');
  const forms = new Set([digits]);
  if (digits.startsWith('84') && digits.length > 2) forms.add(`0${digits.slice(2)}`);
  if (digits.startsWith('0') && digits.length > 1) forms.add(`84${digits.slice(1)}`);
  return [...forms].filter(Boolean);
}

export function matchesCustomerSearch(customer: Customer, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase('vi');
  if (!normalizedQuery) return true;

  const searchableText = `${customer.name} ${customer.email} ${customer.code} ${customer.preferredBranch}`
    .toLocaleLowerCase('vi');
  if (searchableText.includes(normalizedQuery)) return true;

  const queryPhoneForms = phoneSearchForms(query).filter((form) => form.length >= 3);
  return queryPhoneForms.some((phoneQuery) =>
    phoneSearchForms(customer.phone).some((phone) => phone.includes(phoneQuery)),
  );
}
