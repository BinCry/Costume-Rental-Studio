CREATE TYPE "rental_review_status" AS ENUM ('PUBLISHED', 'HIDDEN');

CREATE TABLE "rental_reviews" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "stars" INTEGER NOT NULL,
    "content" TEXT,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT true,
    "status" "rental_review_status" NOT NULL DEFAULT 'PUBLISHED',
    "moderation_note" VARCHAR(1000),
    "moderated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rental_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rental_reviews_stars_check" CHECK ("stars" BETWEEN 1 AND 5),
    CONSTRAINT "rental_reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "rental_reviews_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "customers"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "rental_reviews_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "costume_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "rental_review_media" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_review_media_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rental_review_media_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "rental_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "rental_reviews_order_id_variant_id_key" ON "rental_reviews"("order_id", "variant_id");
CREATE INDEX "rental_reviews_variant_id_status_created_at_idx" ON "rental_reviews"("variant_id", "status", "created_at");
CREATE INDEX "rental_reviews_customer_user_id_created_at_idx" ON "rental_reviews"("customer_user_id", "created_at");
CREATE INDEX "rental_reviews_status_created_at_idx" ON "rental_reviews"("status", "created_at");
CREATE UNIQUE INDEX "rental_review_media_object_key_key" ON "rental_review_media"("object_key");
CREATE INDEX "rental_review_media_review_id_sort_order_idx" ON "rental_review_media"("review_id", "sort_order");
