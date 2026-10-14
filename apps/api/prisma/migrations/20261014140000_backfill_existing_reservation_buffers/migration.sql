-- Backfill eligible future reservations without changing customer-facing terms.
-- The newly effective policy supplies the internal late-return reserve and
-- default preparation window; a variant-specific cleaning value overrides it.
-- Existing occupied_until values are never shortened.
BEGIN;

-- Prevent reservation, policy, variant, and block writes between preflight and
-- update. The migration is intentionally a short cutover transaction.
LOCK TABLE rental_order_items, rental_orders, rental_policy_versions, costume_variants, unit_blocks
  IN SHARE ROW EXCLUSIVE MODE;

DO $cutover$
DECLARE
  conflict_count BIGINT;
  conflict_examples TEXT;
BEGIN
  WITH candidates AS (
    SELECT
      i.id AS item_id,
      i.unit_id,
      i.occupied_from,
      i.occupied_until AS current_until,
      GREATEST(
        i.occupied_until,
        o.planned_due_at + make_interval(
          mins => GREATEST(p.late_return_buffer_minutes, 0)
            + GREATEST(COALESCE(v.cleaning_buffer_minutes, p.default_cleaning_buffer_minutes, 0), 0)
        )
      ) AS proposed_until,
      o.order_code,
      o.status::TEXT AS order_status,
      u.unit_code
    FROM rental_order_items i
    JOIN rental_orders o ON o.id = i.order_id
    JOIN rental_policy_versions p ON p.version_code = 'POLICY-2026-BUFFER-01'
    JOIN costume_variants v ON v.id = i.variant_id
    JOIN costume_units u ON u.id = i.unit_id
    WHERE i.unit_id IS NOT NULL
      AND i.allocation_status IN ('HELD', 'CONFIRMED')
      AND o.status IN ('PENDING_CONFIRMATION', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP')
      AND o.planned_due_at > CURRENT_TIMESTAMP
  ),
  reservations AS (
    SELECT
      i.id AS item_id,
      i.unit_id,
      i.occupied_from,
      i.occupied_until,
      o.order_code,
      o.status::TEXT AS order_status,
      u.unit_code,
      CASE WHEN c.item_id IS NULL THEN i.occupied_until ELSE c.proposed_until END AS proposed_until,
      COALESCE(c.proposed_until > c.current_until, FALSE) AS will_extend
    FROM rental_order_items i
    JOIN rental_orders o ON o.id = i.order_id
    JOIN costume_units u ON u.id = i.unit_id
    LEFT JOIN candidates c ON c.item_id = i.id
    WHERE i.unit_id IS NOT NULL
      AND (
        i.allocation_status IN ('HELD', 'CONFIRMED', 'ACTIVE')
        OR o.status IN ('CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'ACTIVE', 'RETURN_INSPECTION')
      )
  ),
  conflicts AS (
    SELECT format(
      '%s [%s] — %s; %s [%s] — %s; unit %s',
      c.order_code, c.order_status, c.proposed_until,
      r.order_code, r.order_status, r.proposed_until,
      c.unit_code
    ) AS example
    FROM candidates c
    JOIN reservations r ON r.unit_id = c.unit_id AND r.item_id <> c.item_id
    WHERE c.proposed_until > c.current_until
      AND (NOT r.will_extend OR c.item_id < r.item_id)
      AND tstzrange(c.occupied_from, c.proposed_until, '[)')
        && tstzrange(r.occupied_from, r.proposed_until, '[)')
  )
  SELECT COUNT(*) INTO conflict_count FROM conflicts;

  IF conflict_count > 0 THEN
    WITH candidates AS (
      SELECT
        i.id AS item_id,
        i.unit_id,
        i.occupied_from,
        i.occupied_until AS current_until,
        GREATEST(
          i.occupied_until,
          o.planned_due_at + make_interval(
            mins => GREATEST(p.late_return_buffer_minutes, 0)
              + GREATEST(COALESCE(v.cleaning_buffer_minutes, p.default_cleaning_buffer_minutes, 0), 0)
          )
        ) AS proposed_until,
        o.order_code,
        o.status::TEXT AS order_status,
        u.unit_code
      FROM rental_order_items i
      JOIN rental_orders o ON o.id = i.order_id
      JOIN rental_policy_versions p ON p.version_code = 'POLICY-2026-BUFFER-01'
      JOIN costume_variants v ON v.id = i.variant_id
      JOIN costume_units u ON u.id = i.unit_id
      WHERE i.unit_id IS NOT NULL
        AND i.allocation_status IN ('HELD', 'CONFIRMED')
        AND o.status IN ('PENDING_CONFIRMATION', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP')
        AND o.planned_due_at > CURRENT_TIMESTAMP
    ),
    reservations AS (
      SELECT
        i.id AS item_id,
        i.unit_id,
        i.occupied_from,
        i.occupied_until,
        o.order_code,
        o.status::TEXT AS order_status,
        u.unit_code,
        CASE WHEN c.item_id IS NULL THEN i.occupied_until ELSE c.proposed_until END AS proposed_until,
        COALESCE(c.proposed_until > c.current_until, FALSE) AS will_extend
      FROM rental_order_items i
      JOIN rental_orders o ON o.id = i.order_id
      JOIN costume_units u ON u.id = i.unit_id
      LEFT JOIN candidates c ON c.item_id = i.id
      WHERE i.unit_id IS NOT NULL
        AND (
          i.allocation_status IN ('HELD', 'CONFIRMED', 'ACTIVE')
          OR o.status IN ('CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'ACTIVE', 'RETURN_INSPECTION')
        )
    ),
    conflicts AS (
      SELECT format(
        '%s [%s] — %s; %s [%s] — %s; unit %s',
        c.order_code, c.order_status, c.proposed_until,
        r.order_code, r.order_status, r.proposed_until,
        c.unit_code
      ) AS example
      FROM candidates c
      JOIN reservations r ON r.unit_id = c.unit_id AND r.item_id <> c.item_id
      WHERE c.proposed_until > c.current_until
        AND (NOT r.will_extend OR c.item_id < r.item_id)
        AND tstzrange(c.occupied_from, c.proposed_until, '[)')
          && tstzrange(r.occupied_from, r.proposed_until, '[)')
    )
    SELECT string_agg(example, E'\n')
      INTO conflict_examples
      FROM (SELECT example FROM conflicts ORDER BY example LIMIT 10) samples;

    RAISE EXCEPTION USING
      MESSAGE = 'Existing-order buffer cutover would overlap rental reservations; no rows were changed.',
      DETAIL = format('Conflicting reservation pairs (%s total; first 10):%s', conflict_count, E'\n' || conflict_examples),
      HINT = 'Reassign the affected order items to available units, then retry the migration.';
  END IF;

  WITH candidates AS (
    SELECT
      i.id AS item_id,
      i.unit_id,
      i.occupied_from,
      i.occupied_until AS current_until,
      GREATEST(
        i.occupied_until,
        o.planned_due_at + make_interval(
          mins => GREATEST(p.late_return_buffer_minutes, 0)
            + GREATEST(COALESCE(v.cleaning_buffer_minutes, p.default_cleaning_buffer_minutes, 0), 0)
        )
      ) AS proposed_until,
      o.order_code,
      u.unit_code
    FROM rental_order_items i
    JOIN rental_orders o ON o.id = i.order_id
    JOIN rental_policy_versions p ON p.version_code = 'POLICY-2026-BUFFER-01'
    JOIN costume_variants v ON v.id = i.variant_id
    JOIN costume_units u ON u.id = i.unit_id
    WHERE i.unit_id IS NOT NULL
      AND i.allocation_status IN ('HELD', 'CONFIRMED')
      AND o.status IN ('PENDING_CONFIRMATION', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP')
      AND o.planned_due_at > CURRENT_TIMESTAMP
  ),
  conflicts AS (
    SELECT format(
      '%s on %s through %s conflicts with block %s (%s)',
      c.order_code, c.unit_code, c.proposed_until, b.id, b.block_type
    ) AS example
    FROM candidates c
    JOIN unit_blocks b ON b.unit_id = c.unit_id
    WHERE c.proposed_until > c.current_until
      AND b.status IN ('PLANNED', 'IN_PROGRESS')
      AND b.blocked_from < c.proposed_until
      AND b.blocked_until > c.current_until
  )
  SELECT COUNT(*) INTO conflict_count FROM conflicts;

  IF conflict_count > 0 THEN
    WITH candidates AS (
      SELECT
        i.id AS item_id,
        i.unit_id,
        i.occupied_until AS current_until,
        GREATEST(
          i.occupied_until,
          o.planned_due_at + make_interval(
            mins => GREATEST(p.late_return_buffer_minutes, 0)
              + GREATEST(COALESCE(v.cleaning_buffer_minutes, p.default_cleaning_buffer_minutes, 0), 0)
          )
        ) AS proposed_until,
        o.order_code,
        u.unit_code
      FROM rental_order_items i
      JOIN rental_orders o ON o.id = i.order_id
      JOIN rental_policy_versions p ON p.version_code = 'POLICY-2026-BUFFER-01'
      JOIN costume_variants v ON v.id = i.variant_id
      JOIN costume_units u ON u.id = i.unit_id
      WHERE i.unit_id IS NOT NULL
        AND i.allocation_status IN ('HELD', 'CONFIRMED')
        AND o.status IN ('PENDING_CONFIRMATION', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP')
        AND o.planned_due_at > CURRENT_TIMESTAMP
    ),
    conflicts AS (
      SELECT format(
        '%s on %s through %s conflicts with block %s (%s)',
        c.order_code, c.unit_code, c.proposed_until, b.id, b.block_type
      ) AS example
      FROM candidates c
      JOIN unit_blocks b ON b.unit_id = c.unit_id
      WHERE c.proposed_until > c.current_until
        AND b.status IN ('PLANNED', 'IN_PROGRESS')
        AND b.blocked_from < c.proposed_until
        AND b.blocked_until > c.current_until
    )
    SELECT string_agg(example, E'\n')
      INTO conflict_examples
      FROM (SELECT example FROM conflicts ORDER BY example LIMIT 10) samples;

    RAISE EXCEPTION USING
      MESSAGE = 'Existing-order buffer cutover would overlap planned unit blocks; no rows were changed.',
      DETAIL = format('Conflicting reservations (%s total; first 10):%s', conflict_count, E'\n' || conflict_examples),
      HINT = 'Resolve the conflicting unit block or reassign the order, then retry the migration.';
  END IF;
END
$cutover$;

WITH candidates AS (
  SELECT
    i.id AS item_id,
    i.occupied_until AS current_until,
    GREATEST(
      i.occupied_until,
      o.planned_due_at + make_interval(
        mins => GREATEST(p.late_return_buffer_minutes, 0)
          + GREATEST(COALESCE(v.cleaning_buffer_minutes, p.default_cleaning_buffer_minutes, 0), 0)
      )
    ) AS proposed_until
  FROM rental_order_items i
  JOIN rental_orders o ON o.id = i.order_id
  JOIN rental_policy_versions p ON p.version_code = 'POLICY-2026-BUFFER-01'
  JOIN costume_variants v ON v.id = i.variant_id
  WHERE i.unit_id IS NOT NULL
    AND i.allocation_status IN ('HELD', 'CONFIRMED')
    AND o.status IN ('PENDING_CONFIRMATION', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP')
    AND o.planned_due_at > CURRENT_TIMESTAMP
),
updated_items AS (
  UPDATE rental_order_items i
  SET occupied_until = c.proposed_until,
      updated_at = CURRENT_TIMESTAMP
  FROM candidates c
  WHERE i.id = c.item_id
    AND c.proposed_until > c.current_until
  RETURNING i.order_id
),
affected_orders AS (
  SELECT DISTINCT order_id FROM updated_items
)
UPDATE rental_orders o
SET version = o.version + 1,
    updated_at = CURRENT_TIMESTAMP
FROM affected_orders a
WHERE o.id = a.order_id;

COMMIT;
