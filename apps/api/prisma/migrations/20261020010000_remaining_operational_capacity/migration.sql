ALTER TABLE unit_blocks
  ADD COLUMN capacity_window_id UUID,
  ADD COLUMN remaining_effort_minutes INTEGER;

ALTER TABLE unit_blocks
  ADD CONSTRAINT unit_blocks_capacity_window_id_fkey
    FOREIGN KEY (capacity_window_id)
    REFERENCES branch_capacity_windows(id)
    ON DELETE SET NULL,
  ADD CONSTRAINT unit_blocks_remaining_effort_minutes_check
    CHECK (remaining_effort_minutes IS NULL OR remaining_effort_minutes >= 0),
  ADD CONSTRAINT unit_blocks_planned_remaining_effort_check
    CHECK (status <> 'PLANNED' OR remaining_effort_minutes IS NULL);

CREATE INDEX unit_blocks_capacity_window_status_idx
  ON unit_blocks (capacity_window_id, status);
