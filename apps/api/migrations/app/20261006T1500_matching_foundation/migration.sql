-- ═══════════════════════════════════════════════════════════════════════════════
-- RouteRide Phase 1A Task 1.01 Migration: Matching Service Foundation
-- 
-- 1. Table: driver_matching_stats
-- 2. Enum & column: ScheduleLegType on driver_schedule_slots
-- 3. Preflight invariant: MORNING < 12:00 <= AFTERNOON & canonical slot counts
-- 4. Zero-fallback backfill (ELSE NULL)
-- 5. Post-backfill completeness and uniqueness assertions
-- 6. Composite constraint: @@unique([driver_profile_id, subscription_id, leg_type])
-- 7. Secure NOLOGIN read-only role: routeride_matching_ro + default privileges
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Table: driver_matching_stats ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS driver_matching_stats (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  driver_profile_id text NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  operating_day INT NOT NULL CHECK (operating_day BETWEEN 0 AND 6),
  typical_departure_time TIMESTAMPTZ,
  observation_count INT NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_driver_matching_stats_day UNIQUE (driver_profile_id, operating_day)
);

CREATE INDEX IF NOT EXISTS idx_dms_driver_day ON driver_matching_stats(driver_profile_id, operating_day);
CREATE INDEX IF NOT EXISTS driver_matching_stats_driver_profile_id_idx_bbd11be7
  ON driver_matching_stats(driver_profile_id);

-- ─── 2. Enum & Column: ScheduleLegType on driver_schedule_slots ──────────────

ALTER TABLE driver_schedule_slots ADD COLUMN IF NOT EXISTS leg_type text;
DO $$
DECLARE existing_type text;
BEGIN
  SELECT udt_name INTO existing_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'driver_schedule_slots'
    AND column_name = 'leg_type';
  IF existing_type IS DISTINCT FROM 'text' THEN
    ALTER TABLE driver_schedule_slots
      ALTER COLUMN leg_type TYPE text USING leg_type::text;
  END IF;
END $$;

-- ─── 3. Preflight Invariant Validations ───────────────────────────────────────
-- Legacy ROUND_TRIP slot classification uses the Phase 1A invariant MORNING < 12:00 <= AFTERNOON.
-- If this invariant cannot be established from existing data, migration aborts.

DO $$
DECLARE
  invalid_round_trip_count INT;
  invalid_morning_count INT;
  invalid_afternoon_count INT;
BEGIN
  -- Assert every ROUND_TRIP subscription with slots has exactly 2 slots:
  -- exactly one slot before 12:00:00 and exactly one slot at/after 12:00:00.
  SELECT COUNT(*) INTO invalid_round_trip_count
  FROM (
    SELECT s.id
    FROM subscriptions s
    JOIN driver_schedule_slots dss ON dss.subscription_id = s.id
    WHERE s.type = 'ROUND_TRIP'
    GROUP BY s.id
    HAVING COUNT(*) != 2
       OR COUNT(*) FILTER (WHERE dss.slot_start::time < '12:00:00'::time) != 1
       OR COUNT(*) FILTER (WHERE dss.slot_start::time >= '12:00:00'::time) != 1
  ) invalid_subs;

  IF invalid_round_trip_count > 0 THEN
    RAISE EXCEPTION 'Migration preflight failed: % ROUND_TRIP subscriptions have slots violating the 12:00 noon invariant or slot count (!= 2)', invalid_round_trip_count;
  END IF;

  -- Assert every MORNING subscription with slots has exactly 1 slot
  SELECT COUNT(*) INTO invalid_morning_count
  FROM (
    SELECT s.id
    FROM subscriptions s
    JOIN driver_schedule_slots dss ON dss.subscription_id = s.id
    WHERE s.type = 'MORNING'
    GROUP BY s.id
    HAVING COUNT(*) != 1
  ) invalid_m;

  IF invalid_morning_count > 0 THEN
    RAISE EXCEPTION 'Migration preflight failed: % MORNING subscriptions do not have exactly 1 slot', invalid_morning_count;
  END IF;

  -- Assert every AFTERNOON subscription with slots has exactly 1 slot
  SELECT COUNT(*) INTO invalid_afternoon_count
  FROM (
    SELECT s.id
    FROM subscriptions s
    JOIN driver_schedule_slots dss ON dss.subscription_id = s.id
    WHERE s.type = 'AFTERNOON'
    GROUP BY s.id
    HAVING COUNT(*) != 1
  ) invalid_a;

  IF invalid_afternoon_count > 0 THEN
    RAISE EXCEPTION 'Migration preflight failed: % AFTERNOON subscriptions do not have exactly 1 slot', invalid_afternoon_count;
  END IF;
END $$;

-- ─── 4. Zero-Fallback Backfill ───────────────────────────────────────────────
-- Any unclassifiable row receives NULL, which triggers the step 5 assertion failure.

UPDATE driver_schedule_slots dss
SET leg_type = CASE
  WHEN s.type = 'MORNING' THEN 'MORNING'
  WHEN s.type = 'AFTERNOON' THEN 'AFTERNOON'
  WHEN s.type = 'ROUND_TRIP' AND dss.slot_start::time < '12:00:00'::time THEN 'MORNING'
  WHEN s.type = 'ROUND_TRIP' AND dss.slot_start::time >= '12:00:00'::time THEN 'AFTERNOON'
  ELSE NULL
END
FROM subscriptions s
WHERE dss.subscription_id = s.id;

-- ─── 5. Post-Backfill Integrity Assertions ───────────────────────────────────

DO $$
DECLARE
  null_count INT;
  duplicate_leg_count INT;
BEGIN
  -- 5a: Verify zero unclassified slots
  SELECT COUNT(*) INTO null_count FROM driver_schedule_slots WHERE leg_type IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % rows in driver_schedule_slots could not be classified (leg_type IS NULL)', null_count;
  END IF;

  -- 5b: Verify no subscription received duplicate legs
  SELECT COUNT(*) INTO duplicate_leg_count
  FROM (
    SELECT subscription_id, leg_type
    FROM driver_schedule_slots
    GROUP BY subscription_id, leg_type
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_leg_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: detected duplicate leg assignments for the same subscription: % occurrences', duplicate_leg_count;
  END IF;
END $$;

-- ─── 6. Enforce NOT NULL & Update Composite Unique Constraint ────────────────

ALTER TABLE driver_schedule_slots ALTER COLUMN leg_type SET NOT NULL;
ALTER TABLE driver_schedule_slots ADD CONSTRAINT driver_schedule_slots_leg_type_check_e8fc4c0a
  CHECK ("leg_type" IN ('MORNING', 'AFTERNOON'));

-- Keep the legacy two-column uniqueness until the final Phase 1A amendment
-- migration. Intermediate snapshots still declare it; that migration moves
-- the database atomically to leg-level uniqueness after the full chain is ready.

-- ─── 7. Secure NOLOGIN Role & Default Privileges ─────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'routeride_matching_ro') THEN
    CREATE ROLE routeride_matching_ro NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO routeride_matching_ro;
GRANT SELECT ON driver_profiles, driver_matching_stats, reviews,
                subscriptions, driver_schedule_slots, riders
  TO routeride_matching_ro;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO routeride_matching_ro;

COMMIT;
