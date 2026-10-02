import type { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';

export type SeedDatabase = PrismaClient | Prisma.TransactionClient;

export function seedId(sequence: number): string {
  return `00000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;
}

export function getSeedAnchor(): Date {
  const rawAnchor = process.env.SEED_ANCHOR_DATE;
  const dateParts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
  }).formatToParts(new Date());
  const valueOf = (type: 'day' | 'month' | 'year'): string =>
    dateParts.find((part) => part.type === type)?.value ?? '';
  const vietnamDate = `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`;
  const anchor = rawAnchor ? new Date(rawAnchor) : new Date(`${vietnamDate}T00:00:00+07:00`);

  if (Number.isNaN(anchor.getTime())) {
    throw new Error(`SEED_ANCHOR_DATE is invalid: ${rawAnchor}`);
  }

  return anchor;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1_000);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1_000);
}

export function yearsAgo(date: Date, years: number): Date {
  const result = new Date(date);
  result.setUTCFullYear(result.getUTCFullYear() - years);
  return result;
}
