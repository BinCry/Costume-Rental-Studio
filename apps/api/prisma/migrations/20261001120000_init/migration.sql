-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('PENDING', 'ACTIVE', 'LOCKED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "branch_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "actor_group" AS ENUM ('ADMIN', 'STAFF', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "permission_scope" AS ENUM ('OWN', 'BRANCH', 'ALL');

-- CreateEnum
CREATE TYPE "catalog_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "billing_day_mode" AS ENUM ('CALENDAR_DAY', 'ROLLING_24_HOURS');

-- CreateEnum
CREATE TYPE "discount_type" AS ENUM ('PERCENT', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "unit_operational_status" AS ENUM ('INBOUND', 'READY', 'CLEANING', 'REPAIR', 'IN_TRANSFER', 'RETIRED');

-- CreateEnum
CREATE TYPE "costume_condition_grade" AS ENUM ('UNINSPECTED', 'NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED');

-- CreateEnum
CREATE TYPE "employment_status" AS ENUM ('ACTIVE', 'ON_LEAVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "unit_block_type" AS ENUM ('CLEANING', 'REPAIR', 'ALTERATION', 'INSPECTION', 'INTERNAL_USE', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "unit_block_status" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "transfer_status" AS ENUM ('REQUESTED', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'ACTIVE', 'RETURN_INSPECTION', 'COMPLETED', 'REJECTED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "allocation_status" AS ENUM ('UNASSIGNED', 'HELD', 'CONFIRMED', 'ACTIVE', 'RELEASED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "inspection_status" AS ENUM ('PENDING_ASSESSMENT', 'PASSED', 'HAS_DAMAGE', 'HAS_MISSING_ITEM', 'COMPLETED');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "payment_purpose" AS ENUM ('RENTAL', 'DEPOSIT', 'EXTRA');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('CASH', 'BANK_TRANSFER', 'PAYMENT_GATEWAY');

-- CreateEnum
CREATE TYPE "refund_status" AS ENUM ('REQUESTED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "crm_case_status" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "crm_case_priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "customer_interaction_type" AS ENUM ('INQUIRY', 'CONSULTATION', 'COMPLAINT', 'FOLLOW_UP', 'NOTE');

-- CreateEnum
CREATE TYPE "interaction_channel" AS ENUM ('IN_PERSON', 'PHONE', 'EMAIL', 'CHAT', 'SOCIAL');

-- CreateEnum
CREATE TYPE "crm_case_event_type" AS ENUM ('CREATED', 'STATUS_CHANGED', 'OWNER_CHANGED');

-- CreateEnum
CREATE TYPE "outbox_status" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(30),
    "display_name" VARCHAR(255) NOT NULL,
    "avatar_url" VARCHAR(500),
    "status" "user_status" NOT NULL,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "provider_subject" VARCHAR(255) NOT NULL,
    "email_at_link_time" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "user_id" UUID NOT NULL,
    "employee_code" VARCHAR(50) NOT NULL,
    "employment_status" "employment_status" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" DATE NOT NULL,
    "terminated_at" DATE,
    "activated_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "branch_code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "address" TEXT NOT NULL,
    "phone" VARCHAR(30),
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "status" "branch_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "role_code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "actor_group" "actor_group" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(150) NOT NULL,
    "module" VARCHAR(100) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "scope" "permission_scope" NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_role_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "branch_id" UUID,
    "assigned_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action_code" VARCHAR(150) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID,
    "before_json" JSONB,
    "after_json" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costume_categories" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "status" "catalog_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "costume_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costume_models" (
    "id" UUID NOT NULL,
    "model_code" VARCHAR(50) NOT NULL,
    "category_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "short_description" VARCHAR(500),
    "description" TEXT,
    "material" VARCHAR(255),
    "status" "catalog_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "costume_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costume_model_accessories" (
    "id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "default_quantity" INTEGER NOT NULL DEFAULT 1,
    "replacement_value_vnd" BIGINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "costume_model_accessories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costume_variants" (
    "id" UUID NOT NULL,
    "variant_code" VARCHAR(50) NOT NULL,
    "model_id" UUID NOT NULL,
    "size_code" VARCHAR(50) NOT NULL,
    "color_code" VARCHAR(50) NOT NULL,
    "edition_label" VARCHAR(100),
    "fit_notes" TEXT,
    "daily_rental_price_vnd" BIGINT NOT NULL,
    "deposit_amount_vnd" BIGINT NOT NULL,
    "replacement_value_vnd" BIGINT NOT NULL,
    "cleaning_buffer_minutes" INTEGER,
    "status" "catalog_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "costume_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costume_media" (
    "id" UUID NOT NULL,
    "model_id" UUID,
    "variant_id" UUID,
    "object_key" VARCHAR(500) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "alt_text" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "costume_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costume_units" (
    "id" UUID NOT NULL,
    "unit_code" VARCHAR(50) NOT NULL,
    "variant_id" UUID NOT NULL,
    "current_branch_id" UUID NOT NULL,
    "condition_grade" "costume_condition_grade" NOT NULL DEFAULT 'UNINSPECTED',
    "condition_notes" TEXT,
    "operational_status" "unit_operational_status" NOT NULL DEFAULT 'INBOUND',
    "acquired_at" DATE,
    "acquisition_cost_vnd" BIGINT,
    "retired_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "costume_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_events" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "stock_transfer_id" UUID,
    "event_type" VARCHAR(50) NOT NULL,
    "from_branch_id" UUID,
    "to_branch_id" UUID,
    "recorded_by" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "unit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_blocks" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "block_type" "unit_block_type" NOT NULL,
    "status" "unit_block_status" NOT NULL DEFAULT 'PLANNED',
    "blocked_from" TIMESTAMPTZ(6) NOT NULL,
    "blocked_until" TIMESTAMPTZ(6) NOT NULL,
    "assigned_to" UUID,
    "cost_vnd" BIGINT,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "unit_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" UUID NOT NULL,
    "transfer_code" VARCHAR(50) NOT NULL,
    "from_branch_id" UUID NOT NULL,
    "to_branch_id" UUID NOT NULL,
    "status" "transfer_status" NOT NULL DEFAULT 'REQUESTED',
    "request_note" TEXT,
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "shipped_by" UUID,
    "shipped_at" TIMESTAMPTZ(6),
    "received_by" UUID,
    "received_at" TIMESTAMPTZ(6),
    "ended_by" UUID,
    "ended_at" TIMESTAMPTZ(6),
    "end_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "condition_out" "costume_condition_grade",
    "condition_out_notes" TEXT,
    "condition_in" "costume_condition_grade",
    "condition_in_notes" TEXT,
    "received_operational_status" "unit_operational_status",

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_policy_versions" (
    "id" UUID NOT NULL,
    "version_code" VARCHAR(50) NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_to" TIMESTAMPTZ(6),
    "billing_day_mode" "billing_day_mode" NOT NULL,
    "min_rental_days" INTEGER NOT NULL DEFAULT 1,
    "max_rental_days" INTEGER,
    "quote_valid_hours" INTEGER NOT NULL,
    "no_show_grace_minutes" INTEGER NOT NULL DEFAULT 0,
    "late_grace_minutes" INTEGER NOT NULL DEFAULT 0,
    "late_fee_percent_per_day" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "free_cancel_before_hours" INTEGER NOT NULL DEFAULT 0,
    "late_cancel_fee_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "refund_sla_business_days" INTEGER,
    "created_by" UUID,
    "change_reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "discount_type" "discount_type" NOT NULL,
    "discount_value" BIGINT NOT NULL,
    "max_discount_vnd" BIGINT,
    "min_order_amount_vnd" BIGINT NOT NULL DEFAULT 0,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "total_usage_limit" INTEGER,
    "per_customer_limit" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_orders" (
    "id" UUID NOT NULL,
    "order_code" VARCHAR(50) NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "pickup_branch_id" UUID NOT NULL,
    "channel" VARCHAR(30) NOT NULL,
    "planned_start_at" TIMESTAMPTZ(6) NOT NULL,
    "planned_due_at" TIMESTAMPTZ(6) NOT NULL,
    "customer_note" TEXT,
    "status" "order_status" NOT NULL DEFAULT 'DRAFT',
    "policy_version_id" UUID NOT NULL,
    "promotion_id" UUID,
    "promotion_code" VARCHAR(100),
    "promotion_discount_vnd" BIGINT NOT NULL DEFAULT 0,
    "quote_expires_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "pickup_processed_by" UUID,
    "picked_up_at" TIMESTAMPTZ(6),
    "return_processed_by" UUID,
    "returned_at" TIMESTAMPTZ(6),
    "inspection_status" "inspection_status",
    "return_notes" TEXT,
    "late_fee_vnd" BIGINT NOT NULL DEFAULT 0,
    "other_fee_vnd" BIGINT NOT NULL DEFAULT 0,
    "deposit_deduction_vnd" BIGINT NOT NULL DEFAULT 0,
    "settlement_note" TEXT,
    "financially_settled_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rental_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "unit_id" UUID,
    "allocation_status" "allocation_status" NOT NULL DEFAULT 'UNASSIGNED',
    "occupied_from" TIMESTAMPTZ(6) NOT NULL,
    "occupied_until" TIMESTAMPTZ(6) NOT NULL,
    "allocated_by" UUID,
    "billable_days" INTEGER NOT NULL,
    "unit_daily_price_vnd" BIGINT NOT NULL,
    "unit_deposit_vnd" BIGINT NOT NULL,
    "pickup_condition_grade" "costume_condition_grade",
    "pickup_evidence_key" VARCHAR(500),
    "return_condition_grade" "costume_condition_grade",
    "is_missing" BOOLEAN NOT NULL DEFAULT false,
    "damage_notes" TEXT,
    "return_evidence_key" VARCHAR(500),
    "damage_fee_vnd" BIGINT NOT NULL DEFAULT 0,
    "missing_fee_vnd" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rental_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_item_accessories" (
    "id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "model_accessory_id" UUID,
    "accessory_name" VARCHAR(255) NOT NULL,
    "quantity_out" INTEGER NOT NULL,
    "quantity_returned" INTEGER,
    "condition_out" "costume_condition_grade",
    "condition_in" "costume_condition_grade",
    "unit_replacement_value_vnd" BIGINT NOT NULL,
    "damage_fee_vnd" BIGINT NOT NULL DEFAULT 0,
    "missing_fee_vnd" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rental_item_accessories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "purpose" "payment_purpose" NOT NULL,
    "method" "payment_method" NOT NULL,
    "amount_vnd" BIGINT NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'PENDING',
    "provider" VARCHAR(100),
    "provider_payment_id" VARCHAR(255),
    "idempotency_key" VARCHAR(255) NOT NULL,
    "recorded_by" UUID,
    "paid_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount_vnd" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "refund_status" NOT NULL DEFAULT 'REQUESTED',
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "provider_refund_id" VARCHAR(255),
    "completed_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_webhook_events" (
    "id" UUID NOT NULL,
    "payment_id" UUID,
    "provider" VARCHAR(100) NOT NULL,
    "event_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "payload_json" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "processing_status" VARCHAR(30) NOT NULL,
    "error_message" TEXT,

    CONSTRAINT "provider_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "user_id" UUID NOT NULL,
    "customer_code" VARCHAR(50) NOT NULL,
    "preferred_branch_id" UUID,
    "birthday" DATE,
    "height_cm" DECIMAL(5,2),
    "weight_kg" DECIMAL(5,2),
    "chest_cm" DECIMAL(5,2),
    "waist_cm" DECIMAL(5,2),
    "hip_cm" DECIMAL(5,2),
    "internal_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "customer_interactions" (
    "id" UUID NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "branch_id" UUID,
    "order_id" UUID,
    "case_id" UUID,
    "staff_user_id" UUID,
    "interaction_type" "customer_interaction_type" NOT NULL,
    "channel" "interaction_channel" NOT NULL,
    "summary" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_cases" (
    "id" UUID NOT NULL,
    "case_code" VARCHAR(50) NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "order_id" UUID,
    "branch_id" UUID NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "case_type" VARCHAR(50) NOT NULL,
    "priority" "crm_case_priority" NOT NULL DEFAULT 'NORMAL',
    "status" "crm_case_status" NOT NULL DEFAULT 'OPEN',
    "owner_user_id" UUID,
    "due_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "crm_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_case_history" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "event_type" "crm_case_event_type" NOT NULL,
    "from_status" "crm_case_status",
    "to_status" "crm_case_status",
    "from_owner_user_id" UUID,
    "to_owner_user_id" UUID,
    "note" TEXT,
    "actor_user_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_case_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "event_type" VARCHAR(150) NOT NULL,
    "aggregate_type" VARCHAR(100) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload_json" JSONB NOT NULL,
    "status" "outbox_status" NOT NULL DEFAULT 'PENDING',
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_provider_provider_subject_key" ON "auth_identities"("provider", "provider_subject");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_user_id_provider_key" ON "auth_identities"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "branches_branch_code_key" ON "branches"("branch_code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_role_code_key" ON "roles"("role_code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "user_role_assignments_branch_id_role_id_idx" ON "user_role_assignments"("branch_id", "role_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_occurred_at_idx" ON "audit_logs"("entity_type", "entity_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_occurred_at_idx" ON "audit_logs"("actor_user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "costume_categories_parent_id_idx" ON "costume_categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "costume_models_model_code_key" ON "costume_models"("model_code");

-- CreateIndex
CREATE INDEX "costume_models_category_id_status_idx" ON "costume_models"("category_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "costume_model_accessories_model_id_name_key" ON "costume_model_accessories"("model_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "costume_variants_variant_code_key" ON "costume_variants"("variant_code");

-- CreateIndex
CREATE INDEX "costume_variants_model_id_status_idx" ON "costume_variants"("model_id", "status");

-- CreateIndex
CREATE INDEX "costume_media_model_id_sort_order_idx" ON "costume_media"("model_id", "sort_order");

-- CreateIndex
CREATE INDEX "costume_media_variant_id_sort_order_idx" ON "costume_media"("variant_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "costume_units_unit_code_key" ON "costume_units"("unit_code");

-- CreateIndex
CREATE INDEX "costume_units_variant_id_current_branch_id_operational_stat_idx" ON "costume_units"("variant_id", "current_branch_id", "operational_status");

-- CreateIndex
CREATE INDEX "costume_units_current_branch_id_operational_status_idx" ON "costume_units"("current_branch_id", "operational_status");

-- CreateIndex
CREATE INDEX "unit_events_unit_id_occurred_at_idx" ON "unit_events"("unit_id", "occurred_at");

-- CreateIndex
CREATE INDEX "unit_blocks_unit_id_blocked_from_blocked_until_idx" ON "unit_blocks"("unit_id", "blocked_from", "blocked_until");

-- CreateIndex
CREATE INDEX "unit_blocks_assigned_to_status_blocked_from_idx" ON "unit_blocks"("assigned_to", "status", "blocked_from");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_transfer_code_key" ON "stock_transfers"("transfer_code");

-- CreateIndex
CREATE INDEX "stock_transfers_from_branch_id_status_idx" ON "stock_transfers"("from_branch_id", "status");

-- CreateIndex
CREATE INDEX "stock_transfers_to_branch_id_status_idx" ON "stock_transfers"("to_branch_id", "status");

-- CreateIndex
CREATE INDEX "stock_transfer_items_unit_id_idx" ON "stock_transfer_items"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_items_transfer_id_unit_id_key" ON "stock_transfer_items"("transfer_id", "unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "rental_policy_versions_version_code_key" ON "rental_policy_versions"("version_code");

-- CreateIndex
CREATE INDEX "rental_policy_versions_effective_from_effective_to_idx" ON "rental_policy_versions"("effective_from", "effective_to");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_code_key" ON "promotions"("code");

-- CreateIndex
CREATE INDEX "promotions_is_active_start_at_end_at_idx" ON "promotions"("is_active", "start_at", "end_at");

-- CreateIndex
CREATE UNIQUE INDEX "rental_orders_order_code_key" ON "rental_orders"("order_code");

-- CreateIndex
CREATE INDEX "rental_orders_pickup_branch_id_status_planned_start_at_idx" ON "rental_orders"("pickup_branch_id", "status", "planned_start_at");

-- CreateIndex
CREATE INDEX "rental_orders_customer_user_id_created_at_idx" ON "rental_orders"("customer_user_id", "created_at");

-- CreateIndex
CREATE INDEX "rental_orders_promotion_id_status_idx" ON "rental_orders"("promotion_id", "status");

-- CreateIndex
CREATE INDEX "rental_orders_status_quote_expires_at_idx" ON "rental_orders"("status", "quote_expires_at");

-- CreateIndex
CREATE INDEX "rental_order_items_order_id_allocation_status_idx" ON "rental_order_items"("order_id", "allocation_status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_order_id_status_idx" ON "payments"("order_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_provider_refund_id_key" ON "refunds"("provider_refund_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_status_idx" ON "refunds"("payment_id", "status");

-- CreateIndex
CREATE INDEX "provider_webhook_events_processing_status_received_at_idx" ON "provider_webhook_events"("processing_status", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "provider_webhook_events_provider_event_id_key" ON "provider_webhook_events"("provider", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_customer_code_key" ON "customers"("customer_code");

-- CreateIndex
CREATE INDEX "customer_interactions_customer_user_id_occurred_at_idx" ON "customer_interactions"("customer_user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "customer_interactions_case_id_occurred_at_idx" ON "customer_interactions"("case_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "crm_cases_case_code_key" ON "crm_cases"("case_code");

-- CreateIndex
CREATE INDEX "crm_cases_branch_id_status_due_at_idx" ON "crm_cases"("branch_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "crm_cases_owner_user_id_status_due_at_idx" ON "crm_cases"("owner_user_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "crm_cases_customer_user_id_created_at_idx" ON "crm_cases"("customer_user_id", "created_at");

-- CreateIndex
CREATE INDEX "crm_case_history_case_id_occurred_at_idx" ON "crm_case_history"("case_id", "occurred_at");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costume_categories" ADD CONSTRAINT "costume_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "costume_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costume_models" ADD CONSTRAINT "costume_models_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "costume_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costume_model_accessories" ADD CONSTRAINT "costume_model_accessories_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "costume_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costume_variants" ADD CONSTRAINT "costume_variants_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "costume_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costume_media" ADD CONSTRAINT "costume_media_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "costume_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costume_media" ADD CONSTRAINT "costume_media_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "costume_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costume_units" ADD CONSTRAINT "costume_units_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "costume_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costume_units" ADD CONSTRAINT "costume_units_current_branch_id_fkey" FOREIGN KEY ("current_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_events" ADD CONSTRAINT "unit_events_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "costume_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_events" ADD CONSTRAINT "unit_events_stock_transfer_id_fkey" FOREIGN KEY ("stock_transfer_id") REFERENCES "stock_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_events" ADD CONSTRAINT "unit_events_from_branch_id_fkey" FOREIGN KEY ("from_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_events" ADD CONSTRAINT "unit_events_to_branch_id_fkey" FOREIGN KEY ("to_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_events" ADD CONSTRAINT "unit_events_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "employees"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_blocks" ADD CONSTRAINT "unit_blocks_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "costume_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_blocks" ADD CONSTRAINT "unit_blocks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "employees"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_blocks" ADD CONSTRAINT "unit_blocks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_branch_id_fkey" FOREIGN KEY ("from_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_branch_id_fkey" FOREIGN KEY ("to_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "employees"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "employees"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_shipped_by_fkey" FOREIGN KEY ("shipped_by") REFERENCES "employees"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "employees"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_ended_by_fkey" FOREIGN KEY ("ended_by") REFERENCES "employees"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "costume_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_policy_versions" ADD CONSTRAINT "rental_policy_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "customers"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_pickup_branch_id_fkey" FOREIGN KEY ("pickup_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "rental_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_pickup_processed_by_fkey" FOREIGN KEY ("pickup_processed_by") REFERENCES "employees"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_return_processed_by_fkey" FOREIGN KEY ("return_processed_by") REFERENCES "employees"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_order_items" ADD CONSTRAINT "rental_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_order_items" ADD CONSTRAINT "rental_order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "costume_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_order_items" ADD CONSTRAINT "rental_order_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "costume_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_order_items" ADD CONSTRAINT "rental_order_items_allocated_by_fkey" FOREIGN KEY ("allocated_by") REFERENCES "employees"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_item_accessories" ADD CONSTRAINT "rental_item_accessories_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "rental_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_item_accessories" ADD CONSTRAINT "rental_item_accessories_model_accessory_id_fkey" FOREIGN KEY ("model_accessory_id") REFERENCES "costume_model_accessories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "employees"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "employees"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_webhook_events" ADD CONSTRAINT "provider_webhook_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_preferred_branch_id_fkey" FOREIGN KEY ("preferred_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "customers"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "crm_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "employees"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_cases" ADD CONSTRAINT "crm_cases_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "customers"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_cases" ADD CONSTRAINT "crm_cases_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_cases" ADD CONSTRAINT "crm_cases_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_cases" ADD CONSTRAINT "crm_cases_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "employees"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_cases" ADD CONSTRAINT "crm_cases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_case_history" ADD CONSTRAINT "crm_case_history_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "crm_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_case_history" ADD CONSTRAINT "crm_case_history_from_owner_user_id_fkey" FOREIGN KEY ("from_owner_user_id") REFERENCES "employees"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_case_history" ADD CONSTRAINT "crm_case_history_to_owner_user_id_fkey" FOREIGN KEY ("to_owner_user_id") REFERENCES "employees"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_case_history" ADD CONSTRAINT "crm_case_history_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "employees"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
-- PostgreSQL constraints that cannot be represented completely in Prisma Schema.
-- Keep these declarations when editing or regenerating this migration.

-- Prisma does not model this compound unique index because model_accessory_id is nullable.
CREATE UNIQUE INDEX rental_item_accessories_order_item_id_model_accessory_id_key
  ON rental_item_accessories(order_item_id, model_accessory_id);

-- Required by the equality operator in GiST exclusion constraints.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE users
  ADD CONSTRAINT ck_users_contact_required
  CHECK (email IS NOT NULL OR phone IS NOT NULL);

ALTER TABLE employees
  ADD CONSTRAINT ck_employees_termination
  CHECK (
    (employment_status = 'TERMINATED' AND terminated_at IS NOT NULL)
    OR
    (employment_status <> 'TERMINATED' AND terminated_at IS NULL)
  );

ALTER TABLE costume_model_accessories
  ADD CONSTRAINT ck_model_accessory_quantity
    CHECK (default_quantity > 0),
  ADD CONSTRAINT ck_model_accessory_replacement_value
    CHECK (replacement_value_vnd IS NULL OR replacement_value_vnd >= 0);

ALTER TABLE costume_variants
  ADD CONSTRAINT ck_variant_money
    CHECK (
      daily_rental_price_vnd >= 0
      AND deposit_amount_vnd >= 0
      AND replacement_value_vnd >= 0
    ),
  ADD CONSTRAINT ck_variant_cleaning_buffer
    CHECK (cleaning_buffer_minutes IS NULL OR cleaning_buffer_minutes >= 0);

ALTER TABLE costume_media
  ADD CONSTRAINT ck_media_exactly_one_owner
  CHECK ((model_id IS NOT NULL) <> (variant_id IS NOT NULL));

ALTER TABLE costume_units
  ADD CONSTRAINT ck_unit_acquisition_cost
    CHECK (acquisition_cost_vnd IS NULL OR acquisition_cost_vnd >= 0),
  ADD CONSTRAINT ck_unit_inbound_condition
    CHECK (
      (operational_status = 'INBOUND' AND condition_grade = 'UNINSPECTED')
      OR
      (operational_status <> 'INBOUND' AND condition_grade <> 'UNINSPECTED')
    ),
  ADD CONSTRAINT ck_unit_retired_at
    CHECK (
      (operational_status = 'RETIRED' AND retired_at IS NOT NULL)
      OR
      (operational_status <> 'RETIRED' AND retired_at IS NULL)
    );

ALTER TABLE unit_blocks
  ADD CONSTRAINT ck_unit_block_range
    CHECK (blocked_from < blocked_until),
  ADD CONSTRAINT ck_unit_block_cost
    CHECK (cost_vnd IS NULL OR cost_vnd >= 0),
  ADD CONSTRAINT ck_unit_block_started
    CHECK (status <> 'IN_PROGRESS' OR started_at IS NOT NULL),
  ADD CONSTRAINT ck_unit_block_completed
    CHECK (
      status <> 'COMPLETED'
      OR (started_at IS NOT NULL AND finished_at IS NOT NULL)
    ),
  ADD CONSTRAINT ck_unit_block_finish_after_start
    CHECK (
      finished_at IS NULL
      OR (started_at IS NOT NULL AND finished_at >= started_at)
    );

ALTER TABLE stock_transfers
  ADD CONSTRAINT ck_transfer_different_branches
    CHECK (from_branch_id <> to_branch_id),
  ADD CONSTRAINT ck_transfer_version
    CHECK (version > 0),
  ADD CONSTRAINT ck_transfer_approved_metadata
    CHECK (
      status NOT IN ('APPROVED', 'IN_TRANSIT', 'RECEIVED')
      OR approved_at IS NOT NULL
    ),
  ADD CONSTRAINT ck_transfer_shipped_metadata
    CHECK (
      status NOT IN ('IN_TRANSIT', 'RECEIVED')
      OR shipped_at IS NOT NULL
    ),
  ADD CONSTRAINT ck_transfer_received_metadata
    CHECK (
      status <> 'RECEIVED'
      OR received_at IS NOT NULL
    ),
  ADD CONSTRAINT ck_transfer_ended_metadata
    CHECK (
      status NOT IN ('REJECTED', 'CANCELLED')
      OR (
        ended_at IS NOT NULL
        AND NULLIF(BTRIM(end_reason), '') IS NOT NULL
      )
    );

ALTER TABLE stock_transfer_items
  ADD CONSTRAINT ck_transfer_item_condition_out
    CHECK (condition_out IS NULL OR condition_out <> 'UNINSPECTED'),
  ADD CONSTRAINT ck_transfer_item_condition_in
    CHECK (condition_in IS NULL OR condition_in <> 'UNINSPECTED'),
  ADD CONSTRAINT ck_transfer_item_received_status
    CHECK (
      received_operational_status IS NULL
      OR received_operational_status NOT IN ('INBOUND', 'IN_TRANSFER')
    );

ALTER TABLE rental_policy_versions
  ADD CONSTRAINT ck_policy_effective_range
    CHECK (effective_to IS NULL OR effective_from < effective_to),
  ADD CONSTRAINT ck_policy_rental_days
    CHECK (
      min_rental_days >= 1
      AND (max_rental_days IS NULL OR max_rental_days >= min_rental_days)
    ),
  ADD CONSTRAINT ck_policy_nonnegative_durations
    CHECK (
      quote_valid_hours >= 0
      AND no_show_grace_minutes >= 0
      AND late_grace_minutes >= 0
      AND free_cancel_before_hours >= 0
      AND (refund_sla_business_days IS NULL OR refund_sla_business_days >= 0)
    ),
  ADD CONSTRAINT ck_policy_percentages
    CHECK (
      late_fee_percent_per_day BETWEEN 0 AND 100
      AND late_cancel_fee_percent BETWEEN 0 AND 100
    );

ALTER TABLE promotions
  ADD CONSTRAINT ck_promotion_range
    CHECK (start_at < end_at),
  ADD CONSTRAINT ck_promotion_discount
    CHECK (
      discount_value > 0
      AND (discount_type <> 'PERCENT' OR discount_value <= 100)
    ),
  ADD CONSTRAINT ck_promotion_amounts
    CHECK (
      min_order_amount_vnd >= 0
      AND (max_discount_vnd IS NULL OR max_discount_vnd >= 0)
    ),
  ADD CONSTRAINT ck_promotion_limits
    CHECK (
      (total_usage_limit IS NULL OR total_usage_limit > 0)
      AND per_customer_limit > 0
    );

ALTER TABLE rental_orders
  ADD CONSTRAINT ck_order_planned_range
    CHECK (planned_start_at < planned_due_at),
  ADD CONSTRAINT ck_order_money
    CHECK (
      promotion_discount_vnd >= 0
      AND late_fee_vnd >= 0
      AND other_fee_vnd >= 0
      AND deposit_deduction_vnd >= 0
    ),
  ADD CONSTRAINT ck_order_promotion_snapshot
    CHECK (
      (
        promotion_id IS NULL
        AND promotion_code IS NULL
        AND promotion_discount_vnd = 0
      )
      OR
      (
        promotion_id IS NOT NULL
        AND NULLIF(BTRIM(promotion_code), '') IS NOT NULL
      )
    ),
  ADD CONSTRAINT ck_order_pickup_metadata
    CHECK (pickup_processed_by IS NULL OR picked_up_at IS NOT NULL),
  ADD CONSTRAINT ck_order_return_metadata
    CHECK (return_processed_by IS NULL OR returned_at IS NOT NULL),
  ADD CONSTRAINT ck_order_financial_settlement
    CHECK (
      financially_settled_at IS NULL
      OR (returned_at IS NOT NULL AND financially_settled_at >= returned_at)
    ),
  ADD CONSTRAINT ck_order_version
    CHECK (version > 0);

ALTER TABLE rental_order_items
  ADD CONSTRAINT ck_order_item_occupied_range
    CHECK (occupied_from < occupied_until),
  ADD CONSTRAINT ck_order_item_billable_days
    CHECK (billable_days > 0),
  ADD CONSTRAINT ck_order_item_money
    CHECK (
      unit_daily_price_vnd >= 0
      AND unit_deposit_vnd >= 0
      AND damage_fee_vnd >= 0
      AND missing_fee_vnd >= 0
    ),
  ADD CONSTRAINT ck_order_item_allocation
    CHECK (
      (
        allocation_status = 'UNASSIGNED'
        AND unit_id IS NULL
        AND allocated_by IS NULL
      )
      OR
      (
        allocation_status <> 'UNASSIGNED'
        AND unit_id IS NOT NULL
      )
    ),
  ADD CONSTRAINT ck_order_item_pickup_condition
    CHECK (
      pickup_condition_grade IS NULL
      OR pickup_condition_grade <> 'UNINSPECTED'
    ),
  ADD CONSTRAINT ck_order_item_return_condition
    CHECK (
      return_condition_grade IS NULL
      OR return_condition_grade <> 'UNINSPECTED'
    );

ALTER TABLE rental_item_accessories
  ADD CONSTRAINT ck_rental_accessory_quantity_out
    CHECK (quantity_out > 0),
  ADD CONSTRAINT ck_rental_accessory_quantity_returned
    CHECK (
      quantity_returned IS NULL
      OR quantity_returned BETWEEN 0 AND quantity_out
    ),
  ADD CONSTRAINT ck_rental_accessory_money
    CHECK (
      unit_replacement_value_vnd >= 0
      AND damage_fee_vnd >= 0
      AND missing_fee_vnd >= 0
    ),
  ADD CONSTRAINT ck_rental_accessory_condition_out
    CHECK (condition_out IS NULL OR condition_out <> 'UNINSPECTED'),
  ADD CONSTRAINT ck_rental_accessory_condition_in
    CHECK (condition_in IS NULL OR condition_in <> 'UNINSPECTED');

ALTER TABLE payments
  ADD CONSTRAINT ck_payment_amount
    CHECK (amount_vnd > 0),
  ADD CONSTRAINT ck_payment_succeeded_at
    CHECK (
      (status = 'SUCCEEDED' AND paid_at IS NOT NULL)
      OR (status <> 'SUCCEEDED' AND paid_at IS NULL)
    ),
  ADD CONSTRAINT ck_payment_method_metadata
    CHECK (
      (
        method = 'PAYMENT_GATEWAY'
        AND provider IS NOT NULL
        AND provider_payment_id IS NOT NULL
      )
      OR
      (
        method IN ('CASH', 'BANK_TRANSFER')
        AND recorded_by IS NOT NULL
      )
    );

ALTER TABLE refunds
  ADD CONSTRAINT ck_refund_amount
    CHECK (amount_vnd > 0),
  ADD CONSTRAINT ck_refund_completed_at
    CHECK (
      (status = 'COMPLETED' AND completed_at IS NOT NULL)
      OR (status <> 'COMPLETED' AND completed_at IS NULL)
    );

ALTER TABLE customers
  ADD CONSTRAINT ck_customer_birthday
    CHECK (birthday IS NULL OR birthday <= CURRENT_DATE),
  ADD CONSTRAINT ck_customer_measurements
    CHECK (
      (height_cm IS NULL OR height_cm > 0)
      AND (weight_kg IS NULL OR weight_kg > 0)
      AND (chest_cm IS NULL OR chest_cm > 0)
      AND (waist_cm IS NULL OR waist_cm > 0)
      AND (hip_cm IS NULL OR hip_cm > 0)
    );

ALTER TABLE crm_cases
  ADD CONSTRAINT ck_crm_case_resolved
    CHECK (status NOT IN ('RESOLVED', 'CLOSED') OR resolved_at IS NOT NULL),
  ADD CONSTRAINT ck_crm_case_closed
    CHECK (status <> 'CLOSED' OR closed_at IS NOT NULL),
  ADD CONSTRAINT ck_crm_case_closed_after_resolved
    CHECK (
      closed_at IS NULL
      OR (resolved_at IS NOT NULL AND closed_at >= resolved_at)
    );

ALTER TABLE crm_case_history
  ADD CONSTRAINT ck_crm_history_payload
    CHECK (
      (
        event_type = 'CREATED'
        AND from_status IS NULL
        AND to_status IS NOT NULL
      )
      OR
      (
        event_type = 'STATUS_CHANGED'
        AND from_status IS NOT NULL
        AND to_status IS NOT NULL
        AND from_status <> to_status
      )
      OR
      (
        event_type = 'OWNER_CHANGED'
        AND from_owner_user_id IS DISTINCT FROM to_owner_user_id
      )
    );

ALTER TABLE outbox_events
  ADD CONSTRAINT ck_outbox_retry_count
    CHECK (retry_count >= 0),
  ADD CONSTRAINT ck_outbox_processed_at
    CHECK (
      (status = 'PROCESSED' AND processed_at IS NOT NULL)
      OR (status <> 'PROCESSED' AND processed_at IS NULL)
    );

ALTER TABLE user_role_assignments
  ADD CONSTRAINT uq_user_role_branch
  UNIQUE NULLS NOT DISTINCT (user_id, role_id, branch_id);

CREATE UNIQUE INDEX payments_provider_provider_payment_id_key
  ON payments(provider, provider_payment_id);

ALTER TABLE rental_order_items
  ADD CONSTRAINT ex_unit_rental_overlap
  EXCLUDE USING gist (
    unit_id WITH =,
    tstzrange(occupied_from, occupied_until, '[)') WITH &&
  )
  WHERE (allocation_status IN ('HELD', 'CONFIRMED', 'ACTIVE'));

ALTER TABLE rental_policy_versions
  ADD CONSTRAINT ex_policy_effective_overlap
  EXCLUDE USING gist (
    tstzrange(
      effective_from,
      COALESCE(effective_to, 'infinity'::timestamptz),
      '[)'
    ) WITH &&
  );
