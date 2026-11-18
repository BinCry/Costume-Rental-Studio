import type { QuoteSnapshot } from '../fixtures/types';

/** A server recalculation must be presented before order creation if any decision changes. */
export function quoteNeedsConfirmation(previous: QuoteSnapshot, current: QuoteSnapshot) {
  const pricingLines = (quote: QuoteSnapshot) =>
    quote.lines?.map((line) => ({
      variantId: line.variantId,
      quantity: line.quantity,
      pricePerDay: line.pricePerDay,
      rental: line.rental,
      deposit: line.deposit,
    }));
  return (
    current.available === false ||
    previous.available !== current.available ||
    previous.rental !== current.rental ||
    previous.deposit !== current.deposit ||
    previous.discount !== current.discount ||
    previous.amountDueAtPickup !== current.amountDueAtPickup ||
    previous.daysLabel !== current.daysLabel ||
    previous.policy !== current.policy ||
    previous.policyVersionId !== current.policyVersionId ||
    previous.lateGraceMinutes !== current.lateGraceMinutes ||
    previous.lateFeePercentPerDay !== current.lateFeePercentPerDay ||
    previous.promotionCode !== current.promotionCode ||
    JSON.stringify(pricingLines(previous)) !== JSON.stringify(pricingLines(current))
  );
}
