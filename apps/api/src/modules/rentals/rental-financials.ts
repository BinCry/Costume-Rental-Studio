export interface PricedRentalItem {
  billableDays: number;
  unitDailyPriceVnd: bigint;
  unitDepositVnd: bigint;
}

export interface ReturnedRentalItem {
  damageFeeVnd: bigint;
  missingFeeVnd: bigint;
  accessories: { damageFeeVnd: bigint; missingFeeVnd: bigint }[];
}

export function rentalDueVnd(items: PricedRentalItem[], promotionDiscountVnd: bigint) {
  return (
    items.reduce((sum, item) => sum + item.unitDailyPriceVnd * BigInt(item.billableDays), 0n) -
    promotionDiscountVnd
  );
}

export function depositDueVnd(items: PricedRentalItem[]) {
  return items.reduce((sum, item) => sum + item.unitDepositVnd, 0n);
}

export function damageDueVnd(items: ReturnedRentalItem[]) {
  return items.reduce(
    (sum, item) =>
      sum +
      item.damageFeeVnd +
      item.missingFeeVnd +
      item.accessories.reduce((accessorySum, accessory) => {
        return accessorySum + accessory.damageFeeVnd + accessory.missingFeeVnd;
      }, 0n),
    0n,
  );
}

export function successfulPaymentTotal(
  payments: { amountVnd: bigint; purpose: string; status: string }[],
  purpose: 'RENTAL' | 'DEPOSIT' | 'EXTRA',
) {
  return payments
    .filter((payment) => payment.status === 'SUCCEEDED' && payment.purpose === purpose)
    .reduce((sum, payment) => sum + payment.amountVnd, 0n);
}
