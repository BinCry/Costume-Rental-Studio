CREATE TYPE "refund_method" AS ENUM ('CASH', 'BANK_TRANSFER');

ALTER TABLE "refunds" ADD COLUMN "method" "refund_method";
