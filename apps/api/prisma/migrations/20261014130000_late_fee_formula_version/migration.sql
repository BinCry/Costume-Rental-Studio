ALTER TABLE rental_policy_versions
  ADD COLUMN late_fee_formula_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE rental_policy_versions
  ADD CONSTRAINT rental_policy_versions_late_fee_formula_version_check
  CHECK (late_fee_formula_version IN (1, 2));
