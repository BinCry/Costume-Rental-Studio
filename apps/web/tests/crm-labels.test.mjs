const { describe, expect, it } = globalThis;
const { caseHistoryText, crmDayStamp, interactionText } =
  await import('../src/utils/crm-labels.ts');

const stamp = '13/11/2026 10:20';

describe('CRM case history in Vietnamese', () => {
  it('describes a status change with Vietnamese status names', () => {
    expect(
      caseHistoryText(
        { eventType: 'STATUS_CHANGED', fromStatus: 'IN_PROGRESS', toStatus: 'RESOLVED' },
        stamp,
      ),
    ).toBe('13/11/2026 10:20 · Đổi trạng thái: Đang xử lý → Đã giải quyết');
  });

  it('describes case creation and owner changes, keeping a staff note', () => {
    expect(caseHistoryText({ eventType: 'CREATED', toStatus: 'OPEN' }, stamp)).toBe(
      '13/11/2026 10:20 · Tạo case',
    );
    expect(caseHistoryText({ eventType: 'OWNER_CHANGED', note: 'Giao cho Hà Nguyễn' }, stamp)).toBe(
      '13/11/2026 10:20 · Đổi người phụ trách · Giao cho Hà Nguyễn',
    );
  });

  it('never shows a raw code for an unknown event', () => {
    expect(caseHistoryText({ eventType: 'SOMETHING_NEW' }, stamp)).toBe(
      '13/11/2026 10:20 · Cập nhật case',
    );
  });
});

describe('CRM interactions in Vietnamese', () => {
  it('names the interaction type and channel', () => {
    expect(
      interactionText(
        { interactionType: 'INQUIRY', channel: 'PHONE', summary: 'Hỏi giá áo dài' },
        stamp,
      ),
    ).toBe('13/11/2026 10:20 · Hỏi thông tin · Điện thoại · Hỏi giá áo dài');
    expect(interactionText({ interactionType: 'FOLLOW_UP', channel: 'IN_PERSON' }, stamp)).toBe(
      '13/11/2026 10:20 · Theo dõi sau thuê · Tại quầy',
    );
  });
});

describe('CRM day stamp', () => {
  it('uses the real day in Vietnam time instead of a fixed date', () => {
    // 18:30 UTC on 13/11 is already 14/11 in Vietnam.
    expect(crmDayStamp(new Date('2026-11-13T18:30:00.000Z'))).toBe('14/11');
    expect(crmDayStamp(new Date('2026-03-05T02:00:00.000Z'))).toBe('05/03');
  });
});
