const { describe, expect, it } = globalThis;
import { matchesCustomerSearch } from '../src/utils/customer-search.ts';

const customer = {
  code: 'CUS-001',
  name: 'Nguyễn An',
  phone: '+84912345678',
  email: 'an@example.com',
  preferredBranch: 'Costume Studio Quận 1',
  history: [],
  interactions: [],
};

describe('matchesCustomerSearch', () => {
  it('finds a customer by name, email, or code', () => {
    expect(matchesCustomerSearch(customer, 'nguyễn an')).toBe(true);
    expect(matchesCustomerSearch(customer, 'AN@EXAMPLE.COM')).toBe(true);
    expect(matchesCustomerSearch(customer, 'CUS-001')).toBe(true);
  });

  it('matches local and +84 phone formats, including partial searches', () => {
    expect(matchesCustomerSearch(customer, '0912 345 678')).toBe(true);
    expect(matchesCustomerSearch({ ...customer, phone: '0912345678' }, '+84 912 345 678')).toBe(
      true,
    );
    expect(matchesCustomerSearch(customer, '0912')).toBe(true);
  });

  it('does not match short non-phone fragments against phone numbers', () => {
    expect(matchesCustomerSearch(customer, '84')).toBe(false);
  });
});
