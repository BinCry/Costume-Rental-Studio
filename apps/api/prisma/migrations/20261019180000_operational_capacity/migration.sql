ALTER TABLE unit_blocks
  ADD COLUMN estimated_effort_minutes INTEGER;

ALTER TABLE unit_blocks
  ADD CONSTRAINT unit_blocks_estimated_effort_minutes_check
  CHECK (estimated_effort_minutes IS NULL OR estimated_effort_minutes > 0);

CREATE TABLE branch_capacity_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  available_minutes INTEGER NOT NULL,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES employees(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT branch_capacity_windows_period_check CHECK (ends_at > starts_at),
  CONSTRAINT branch_capacity_windows_minutes_check CHECK (available_minutes > 0),
  CONSTRAINT branch_capacity_windows_branch_period_key UNIQUE (branch_id, starts_at, ends_at)
);

CREATE INDEX branch_capacity_windows_period_idx
  ON branch_capacity_windows (starts_at, ends_at);

CREATE INDEX unit_blocks_capacity_scan_idx
  ON unit_blocks (status, blocked_until)
  WHERE status IN ('PLANNED', 'IN_PROGRESS');
