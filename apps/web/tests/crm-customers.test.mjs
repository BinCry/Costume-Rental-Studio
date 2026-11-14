const { describe, expect, it } = globalThis;
const { visibleBranchCustomers } = await import('../src/utils/crm-customers.ts');

const online = {
  code: 'CUS-ONLINE',
  name: 'Khách đặt online',
  phone: '+84123456789',
  email: 'online@example.com',
  // Registered on the website without choosing a branch.
  preferredBranch: '',
};
const district1 = { ...online, code: 'CUS-Q1', preferredBranch: 'Quận 1' };
const district3 = { ...online, code: 'CUS-Q3', preferredBranch: 'Quận 3' };

describe('customers shown for a CRM branch', () => {
  it('keeps every customer the server returned for the branch', () => {
    // The server already scopes the list (preferred branch or orders there).
    const shown = visibleBranchCustomers([online, district1], 'Quận 1', '', true);
    expect(shown.map((customer) => customer.code)).toEqual(['CUS-ONLINE', 'CUS-Q1']);
  });

  it('filters sample data by preferred branch when no server scope applies', () => {
    const shown = visibleBranchCustomers([online, district1, district3], 'Quận 1', '', false);
    expect(shown.map((customer) => customer.code)).toEqual(['CUS-Q1']);
  });

  it('still applies the search box', () => {
    const shown = visibleBranchCustomers([online, district1], 'Quận 1', 'CUS-Q1', true);
    expect(shown.map((customer) => customer.code)).toEqual(['CUS-Q1']);
  });
});
