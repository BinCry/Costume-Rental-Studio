BEGIN;

ALTER TABLE rental_policy_versions
  ADD COLUMN late_return_buffer_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN default_cleaning_buffer_minutes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE rental_policy_versions
  ADD CONSTRAINT rental_policy_versions_late_return_buffer_minutes_nonnegative
    CHECK (late_return_buffer_minutes >= 0),
  ADD CONSTRAINT rental_policy_versions_default_cleaning_buffer_minutes_nonnegative
    CHECK (default_cleaning_buffer_minutes >= 0);

-- Create a new immutable policy version instead of changing the historical
-- version already referenced by existing orders. Financial terms are copied.
LOCK TABLE rental_policy_versions IN SHARE ROW EXCLUSIVE MODE;

DO $policy$
DECLARE
  current_policy rental_policy_versions%ROWTYPE;
BEGIN
  SELECT *
  INTO current_policy
  FROM rental_policy_versions
  WHERE effective_from <= CURRENT_TIMESTAMP
    AND (effective_to IS NULL OR effective_to > CURRENT_TIMESTAMP)
  ORDER BY effective_from DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND
    AND NOT EXISTS (
      SELECT 1
      FROM rental_policy_versions
      WHERE version_code = 'POLICY-2026-BUFFER-01'
    )
  THEN
    UPDATE rental_policy_versions
    SET effective_to = CURRENT_TIMESTAMP
    WHERE id = current_policy.id;

    INSERT INTO rental_policy_versions (
      id,
      version_code,
      effective_from,
      effective_to,
      billing_day_mode,
      min_rental_days,
      max_rental_days,
      quote_valid_hours,
      no_show_grace_minutes,
      late_grace_minutes,
      late_fee_percent_per_day,
      late_return_buffer_minutes,
      default_cleaning_buffer_minutes,
      free_cancel_before_hours,
      late_cancel_fee_percent,
      refund_sla_business_days,
      created_by,
      change_reason
    )
    VALUES (
      gen_random_uuid(),
      'POLICY-2026-BUFFER-01',
      CURRENT_TIMESTAMP,
      NULL,
      current_policy.billing_day_mode,
      current_policy.min_rental_days,
      current_policy.max_rental_days,
      current_policy.quote_valid_hours,
      current_policy.no_show_grace_minutes,
      current_policy.late_grace_minutes,
      current_policy.late_fee_percent_per_day,
      720,
      720,
      current_policy.free_cancel_before_hours,
      current_policy.late_cancel_fee_percent,
      current_policy.refund_sla_business_days,
      current_policy.created_by,
      'Mức đệm lịch khởi điểm đã duyệt: 12 giờ dự phòng trả trễ + 12 giờ vệ sinh/chuẩn bị. Cấu hình theo phiên bản policy.'
    );
  END IF;
END
$policy$;

-- Older demo seeds stored the standard 12-hour preparation window directly
-- on each variant. Clear that seed value so those variants inherit policy;
-- non-standard variant-specific overrides remain intact.
UPDATE costume_variants
SET cleaning_buffer_minutes = NULL
WHERE cleaning_buffer_minutes = 720;

COMMIT;
