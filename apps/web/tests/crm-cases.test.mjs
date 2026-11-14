const { describe, expect, it } = globalThis;
const { nextCaseStatuses } = await import('../src/utils/crm-cases.ts');

describe('CRM case status choices', () => {
  it('offers only the statuses the server accepts from the current one', () => {
    expect(nextCaseStatuses('OPEN')).toEqual(['OPEN', 'IN_PROGRESS', 'RESOLVED']);
    expect(nextCaseStatuses('IN_PROGRESS')).toEqual(['OPEN', 'IN_PROGRESS', 'RESOLVED']);
    expect(nextCaseStatuses('RESOLVED')).toEqual(['IN_PROGRESS', 'RESOLVED', 'CLOSED']);
    expect(nextCaseStatuses('CLOSED')).toEqual(['IN_PROGRESS', 'CLOSED']);
  });

  it('does not offer closing a case that is still in progress', () => {
    expect(nextCaseStatuses('IN_PROGRESS')).not.toContain('CLOSED');
  });
});
