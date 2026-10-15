import type { OrderStatus, Tone } from '../fixtures/types';

export const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} đ`;

export function returnConditionLabel(conditionIn: string | null | undefined) {
  const labels: Record<string, string> = {
    NEW: 'Mới',
    GOOD: 'Tốt',
    FAIR: 'Khá',
    POOR: 'Kém',
    DAMAGED: 'Hư hỏng',
  };
  return conditionIn ? labels[conditionIn] ?? 'Chưa ghi nhận' : 'Chưa ghi nhận';
}

export function defaultRentalDate(daysFromToday: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  date.setHours(10, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const orderStatus: Record<OrderStatus, { text: string; tone: Tone }> = {
  DRAFT: { text: 'Bản nháp', tone: 'neutral' },
  PENDING_CONFIRMATION: { text: 'Chờ studio xác nhận', tone: 'warning' },
  CONFIRMED: { text: 'Đã xác nhận', tone: 'success' },
  PREPARING: { text: 'Đang chuẩn bị', tone: 'info' },
  READY_FOR_PICKUP: { text: 'Sẵn sàng nhận', tone: 'info' },
  ACTIVE: { text: 'Đang thuê', tone: 'info' },
  RETURN_INSPECTION: { text: 'Đang kiểm tra đồ trả', tone: 'warning' },
  COMPLETED: { text: 'Hoàn tất', tone: 'success' },
  REJECTED: { text: 'Studio từ chối', tone: 'danger' },
  CANCELLED: { text: 'Đã hủy', tone: 'neutral' },
  NO_SHOW: { text: 'Không đến nhận', tone: 'warning' },
};
