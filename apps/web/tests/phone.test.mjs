const { describe, expect, it } = globalThis;
const { isValidPhone, matchesCustomerSearch, normalizePhone, samePhone } = await import(
  '../src/utils/phone.ts'
);

describe('phone normalization', () => {
  it('turns the supported local and international forms into E.164', () => {
    expect(normalizePhone('0123456789')).toBe('+84123456789');
    expect(normalizePhone('0123 456 789')).toBe('+84123456789');
    expect(normalizePhone('(012) 345-6789')).toBe('+84123456789');
    expect(normalizePhone('84123456789')).toBe('+84123456789');
    expect(normalizePhone('+84 123 456 789')).toBe('+84123456789');
    expect(normalizePhone('+84123456789')).toBe('+84123456789');
  });
});

describe('phone validation', () => {
  it('accepts the number the server stores for a profile, not only the 0… form', () => {
    expect(isValidPhone('+84123456789')).toBe(true);
    expect(isValidPhone('0123456789')).toBe(true);
    expect(isValidPhone('0900 000 000')).toBe(true);
    expect(isValidPhone('+14155552671')).toBe(true);
  });

  it('rejects numbers the server would reject', () => {
    for (const value of ['', '   ', '123', '01234', '0123456789012', 'abc', '+0123456789'])
      expect(isValidPhone(value), value).toBe(false);
  });
});

describe('phone comparison', () => {
  it('treats different spellings of one number as the same number', () => {
    expect(samePhone('0123456789', '+84 123 456 789')).toBe(true);
    expect(samePhone('84123456789', '0123456789')).toBe(true);
  });

  it('does not match different or empty numbers', () => {
    expect(samePhone('0123456789', '0123456780')).toBe(false);
    expect(samePhone('', '')).toBe(false);
  });
});

describe('customer search', () => {
  const customer = { name: 'Chou Nguyen', phone: '+84123456789', code: 'CUS-0001' };

  it('finds a customer stored as +84… when staff type the number as 0…', () => {
    expect(matchesCustomerSearch(customer, '0123456789')).toBe(true);
    expect(matchesCustomerSearch(customer, '0123')).toBe(true);
    expect(matchesCustomerSearch(customer, '+84123456789')).toBe(true);
    expect(matchesCustomerSearch(customer, '123 456')).toBe(true);
  });

  it('still searches by name and code, and an empty query matches everyone', () => {
    expect(matchesCustomerSearch(customer, 'chou')).toBe(true);
    expect(matchesCustomerSearch(customer, 'cus-0001')).toBe(true);
    expect(matchesCustomerSearch(customer, '')).toBe(true);
  });

  it('finds a customer by email, ignoring case', () => {
    const withEmail = { ...customer, email: 'Chou.Nguyen@Example.com' };
    expect(matchesCustomerSearch(withEmail, 'chou.nguyen@example.com')).toBe(true);
    expect(matchesCustomerSearch(withEmail, 'example.com')).toBe(true);
    expect(matchesCustomerSearch(withEmail, 'other@example.com')).toBe(false);
  });

  it('does not match other customers or turn text into a phone search', () => {
    expect(matchesCustomerSearch(customer, '0999')).toBe(false);
    expect(matchesCustomerSearch(customer, 'xyz')).toBe(false);
    expect(matchesCustomerSearch(customer, 'chou1')).toBe(false);
  });
});
