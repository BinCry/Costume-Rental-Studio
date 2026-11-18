import type { BookingDraft } from '../fixtures/types';

export const bookingDraftStorageKey = 'costume-rental.booking-draft.v1';

export interface ResumedBooking {
  draft: BookingDraft;
  expired: boolean;
}

export function readResumedBooking(
  context: URLSearchParams | undefined,
  fallback: BookingDraft,
): ResumedBooking | undefined {
  if (context?.get('resume') !== '1' || typeof window === 'undefined') return undefined;
  try {
    const stored: unknown = JSON.parse(
      window.sessionStorage.getItem(bookingDraftStorageKey) ?? 'null',
    );
    if (!stored || typeof stored !== 'object') return undefined;
    const envelope = stored as { savedAt?: unknown; draft?: unknown };
    if (
      typeof envelope.savedAt !== 'number' ||
      !envelope.draft ||
      typeof envelope.draft !== 'object'
    )
      return undefined;
    const value = envelope.draft as Partial<BookingDraft>;
    if (
      typeof value.costumeId !== 'string' ||
      typeof value.variant !== 'string' ||
      typeof value.branch !== 'string' ||
      typeof value.pickup !== 'string' ||
      typeof value.returnAt !== 'string' ||
      !Number.isInteger(value.quantity) ||
      (value.quantity ?? 0) < 1 ||
      (value.quantity ?? 0) > 50 ||
      typeof value.name !== 'string' ||
      typeof value.phone !== 'string' ||
      typeof value.note !== 'string'
    )
      return undefined;
    const savedItems = value.items;
    const items =
      Array.isArray(savedItems) &&
      savedItems.length > 0 &&
      savedItems.length <= 50 &&
      savedItems.every(
        (line) =>
          typeof line.costumeId === 'string' &&
          typeof line.variant === 'string' &&
          Number.isInteger(line.quantity) &&
          line.quantity > 0,
      )
        ? savedItems
        : [{ costumeId: value.costumeId, variant: value.variant, quantity: value.quantity! }];
    const expired = Date.now() - envelope.savedAt > 24 * 60 * 60 * 1000;
    return {
      draft: {
        ...fallback,
        ...value,
        quantity: value.quantity!,
        items,
        // A resumed selection is useful after a day; contact details need fresh confirmation.
        name: expired ? '' : value.name,
        phone: expired ? '' : value.phone,
        note: expired ? '' : value.note,
      },
      expired,
    };
  } catch {
    return undefined;
  }
}
