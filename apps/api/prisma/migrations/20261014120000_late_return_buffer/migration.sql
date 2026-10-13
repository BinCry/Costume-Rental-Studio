ALTER TABLE rental_policy_versions
  ADD COLUMN late_return_buffer_minutes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE rental_policy_versions
  ADD CONSTRAINT rental_policy_versions_late_return_buffer_minutes_nonnegative
  CHECK (late_return_buffer_minutes >= 0);
