CREATE TYPE overdue_follow_up_outcome AS ENUM (
  'CONTACTED',
  'PROMISED_RETURN',
  'NO_ANSWER',
  'REFUSED_RETURN',
  'REQUESTED_EXTENSION',
  'OTHER'
);

ALTER TABLE customer_interactions
  ADD COLUMN outcome overdue_follow_up_outcome,
  ADD COLUMN promised_return_at TIMESTAMPTZ,
  ADD COLUMN next_follow_up_at TIMESTAMPTZ,
  ADD COLUMN source_reference VARCHAR(255),
  ADD COLUMN idempotency_key VARCHAR(255),
  ADD CONSTRAINT customer_interactions_follow_up_outcome_check CHECK (
    (outcome IS NULL AND promised_return_at IS NULL AND next_follow_up_at IS NULL)
    OR interaction_type = 'FOLLOW_UP'
  ),
  ADD CONSTRAINT customer_interactions_promised_return_check CHECK (
    (outcome = 'PROMISED_RETURN' AND promised_return_at IS NOT NULL)
    OR (outcome IS DISTINCT FROM 'PROMISED_RETURN' AND promised_return_at IS NULL)
  ),
  ADD CONSTRAINT customer_interactions_promised_return_time_check CHECK (
    promised_return_at IS NULL OR promised_return_at > occurred_at
  ),
  ADD CONSTRAINT customer_interactions_next_follow_up_time_check CHECK (
    next_follow_up_at IS NULL OR next_follow_up_at > occurred_at
  );

CREATE UNIQUE INDEX customer_interactions_idempotency_key_key
  ON customer_interactions (idempotency_key);

CREATE INDEX customer_interactions_order_id_occurred_at_idx
  ON customer_interactions (order_id, occurred_at);

CREATE INDEX customer_interactions_source_reference_idx
  ON customer_interactions (source_reference);
