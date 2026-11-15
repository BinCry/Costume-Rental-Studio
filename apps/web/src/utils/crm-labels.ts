// Vietnamese names for the CRM codes the API returns, so timelines never show raw codes.
import { formatVietnamDate } from './date-format';

export const caseStatusLabels: Record<string, string> = {
  OPEN: 'Mới mở',
  IN_PROGRESS: 'Đang xử lý',
  RESOLVED: 'Đã giải quyết',
  CLOSED: 'Đã đóng',
};

export const interactionTypeLabels: Record<string, string> = {
  NOTE: 'Ghi chú',
  INQUIRY: 'Hỏi thông tin',
  CONSULTATION: 'Tư vấn',
  COMPLAINT: 'Khiếu nại',
  FOLLOW_UP: 'Theo dõi sau thuê',
};

export const interactionChannelLabels: Record<string, string> = {
  IN_PERSON: 'Tại quầy',
  PHONE: 'Điện thoại',
  EMAIL: 'Email',
  CHAT: 'Chat',
  SOCIAL: 'Mạng xã hội',
};

function statusName(status?: string | null) {
  return (status && caseStatusLabels[status]) ?? 'Không rõ';
}

function joinLine(parts: (string | null | undefined)[]) {
  return parts.filter(Boolean).join(' · ');
}

export function caseHistoryText(
  entry: {
    eventType?: string;
    note?: string | null;
    fromStatus?: string | null;
    toStatus?: string | null;
  },
  stamp: string,
) {
  const event =
    entry.eventType === 'CREATED'
      ? 'Tạo case'
      : entry.eventType === 'STATUS_CHANGED'
        ? `Đổi trạng thái: ${statusName(entry.fromStatus)} → ${statusName(entry.toStatus)}`
        : entry.eventType === 'OWNER_CHANGED'
          ? 'Đổi người phụ trách'
          : 'Cập nhật case';
  return joinLine([stamp, event, entry.note]);
}

export function interactionText(
  entry: { interactionType?: string; channel?: string; summary?: string | null },
  stamp: string,
) {
  return joinLine([
    stamp,
    entry.interactionType && (interactionTypeLabels[entry.interactionType] ?? 'Tương tác'),
    entry.channel && (interactionChannelLabels[entry.channel] ?? 'Kênh khác'),
    entry.summary,
  ]);
}

/** Today's calendar date in Vietnam time, for history entries written on this device. */
export function crmDayStamp(now = new Date()) {
  return formatVietnamDate(now);
}
