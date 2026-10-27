-- ADR-011 additive schema. Run after the matching foundation SQL migrations.
-- Existing commitments are retained; legacy runs require review before new acceptance.
BEGIN;

ALTER TABLE driver_profiles
  ADD COLUMN route_state text NOT NULL DEFAULT 'UNSET',
  ADD COLUMN service_area geometry(Geometry,4326),
  ADD COLUMN starting_location geometry(Geometry,4326),
  ADD COLUMN accepting_requests boolean NOT NULL DEFAULT false,
  ADD COLUMN coverage_setup_required boolean NOT NULL DEFAULT true,
  ADD COLUMN availability_version integer NOT NULL DEFAULT 0 CHECK (availability_version >= 0),
  ADD COLUMN roster_version integer NOT NULL DEFAULT 0 CHECK (roster_version >= 0);

UPDATE driver_profiles SET route_state = 'ESTABLISHED' WHERE route_polyline IS NOT NULL;
-- No coverage/start/availability is inferred from historical route geometry.
ALTER TABLE driver_profiles
  ADD CONSTRAINT driver_profiles_route_state_check_96f7fd60
    CHECK ("route_state" IN ('UNSET', 'ESTABLISHED')),
  ADD CONSTRAINT ck_driver_service_area CHECK (service_area IS NULL OR
    (GeometryType(service_area) = 'POLYGON' AND ST_NDims(service_area)=2
      AND ST_XMin(service_area) >= -180 AND ST_XMax(service_area) <= 180
      AND ST_YMin(service_area) >= -90 AND ST_YMax(service_area) <= 90
      AND NOT ST_IsEmpty(service_area) AND ST_IsValid(service_area))),
  ADD CONSTRAINT ck_driver_starting_location CHECK (starting_location IS NULL OR
    (GeometryType(starting_location) = 'POINT' AND ST_NDims(starting_location)=2
      AND ST_XMin(starting_location) >= -180 AND ST_XMax(starting_location) <= 180
      AND ST_YMin(starting_location) >= -90 AND ST_YMax(starting_location) <= 90
      AND NOT ST_IsEmpty(starting_location))),
  ADD CONSTRAINT ck_driver_request_setup CHECK (NOT accepting_requests OR
    (NOT coverage_setup_required AND service_area IS NOT NULL AND starting_location IS NOT NULL)),
  ADD CONSTRAINT ck_driver_route_state CHECK ((route_state = 'UNSET' AND route_polyline IS NULL)
    OR (route_state = 'ESTABLISHED' AND route_polyline IS NOT NULL));
CREATE INDEX idx_dp_service_area ON driver_profiles USING gist(service_area);

-- Prisma 8 contracts lower enums to text CHECKs; older installations may use native enums.
DO $$
DECLARE c record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubStatus' AND typtype = 'e') THEN
    ALTER TYPE "SubStatus" ADD VALUE IF NOT EXISTS 'DECLINED';
  ELSE
    FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'subscriptions'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%status%'
    LOOP EXECUTE format('ALTER TABLE subscriptions DROP CONSTRAINT %I', c.conname); END LOOP;
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check_f3c67ce6 CHECK
      (status IN ('DECLINED','PENDING','ACTIVE','PAUSED','CANCELLED','EXPIRED'));
  END IF;
END $$;

CREATE TABLE driver_availability (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  driver_profile_id text NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  operating_day integer NOT NULL CHECK (operating_day BETWEEN 0 AND 6),
  leg_type text NOT NULL,
  window_start time NOT NULL,
  window_end time NOT NULL,
  CONSTRAINT ck_availability_window CHECK (window_start < window_end),
  CONSTRAINT uq_driver_availability_day_leg UNIQUE(driver_profile_id,operating_day,leg_type)
);
CREATE INDEX driver_availability_driver_profile_id_idx_bbd11be7
  ON driver_availability(driver_profile_id);
ALTER TABLE driver_availability ADD CONSTRAINT driver_availability_leg_type_check_e8fc4c0a
  CHECK (leg_type IN ('MORNING','AFTERNOON'));

CREATE TABLE recurring_runs (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  driver_profile_id text NOT NULL REFERENCES driver_profiles(id),
  operating_day integer NOT NULL CHECK (operating_day BETWEEN 0 AND 6),
  leg_type text NOT NULL,
  starts_at time,
  ends_at time,
  effective_from date NOT NULL,
  effective_to date,
  seat_capacity integer NOT NULL CHECK (seat_capacity > 0),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  needs_review boolean NOT NULL DEFAULT false,
  CONSTRAINT ck_run_window CHECK ((needs_review AND starts_at IS NULL AND ends_at IS NULL)
    OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND starts_at < ends_at)),
  CONSTRAINT ck_run_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT uq_run_driver_leg UNIQUE(id,driver_profile_id,leg_type)
);
CREATE INDEX idx_runs_driver_day_leg ON recurring_runs(driver_profile_id,operating_day,leg_type);
CREATE INDEX recurring_runs_driver_profile_id_idx_bbd11be7
  ON recurring_runs(driver_profile_id);
ALTER TABLE recurring_runs ADD CONSTRAINT recurring_runs_leg_type_check_e8fc4c0a
  CHECK (leg_type IN ('MORNING','AFTERNOON'));
ALTER TABLE subscriptions ADD CONSTRAINT uq_subscription_driver UNIQUE(id,driver_profile_id);

CREATE TABLE run_assignments (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  run_id text NOT NULL,
  subscription_id text NOT NULL,
  driver_profile_id text NOT NULL,
  leg_type text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  needs_review boolean NOT NULL DEFAULT false,
  CONSTRAINT fk_assignment_run FOREIGN KEY(run_id,driver_profile_id,leg_type)
    REFERENCES recurring_runs(id,driver_profile_id,leg_type),
  CONSTRAINT fk_assignment_subscription FOREIGN KEY(subscription_id,driver_profile_id)
    REFERENCES subscriptions(id,driver_profile_id),
  CONSTRAINT ck_assignment_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT uq_run_subscription UNIQUE(run_id,subscription_id),
  CONSTRAINT uq_assignment_run UNIQUE(id,run_id)
);
CREATE INDEX idx_assignment_subscription_leg ON run_assignments(subscription_id,leg_type);
CREATE INDEX run_assignments_run_id_idx_61d39f90 ON run_assignments(run_id);
CREATE INDEX run_assignments_subscription_id_idx_1e74615f
  ON run_assignments(subscription_id);
ALTER TABLE run_assignments
  ADD CONSTRAINT fk_assignment_run_id FOREIGN KEY(run_id) REFERENCES recurring_runs(id),
  ADD CONSTRAINT fk_assignment_subscription_id FOREIGN KEY(subscription_id) REFERENCES subscriptions(id),
  ADD CONSTRAINT run_assignments_leg_type_check_e8fc4c0a
    CHECK (leg_type IN ('MORNING','AFTERNOON'));

CREATE TABLE run_stops (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  assignment_id text NOT NULL,
  run_id text NOT NULL,
  stop_type text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  location geometry(Geometry,4326) NOT NULL CHECK (GeometryType(location) = 'POINT' AND NOT ST_IsEmpty(location)),
  window_start time NOT NULL,
  window_end time NOT NULL,
  CONSTRAINT ck_stop_window CHECK (window_start <= window_end),
  CONSTRAINT fk_stop_assignment FOREIGN KEY(assignment_id,run_id) REFERENCES run_assignments(id,run_id),
  CONSTRAINT uq_run_stop_position UNIQUE(run_id,position),
  CONSTRAINT uq_assignment_stop_type UNIQUE(assignment_id,stop_type)
);
CREATE INDEX run_stops_assignment_id_idx_566acae3 ON run_stops(assignment_id);
ALTER TABLE run_stops
  ADD CONSTRAINT fk_stop_assignment_id FOREIGN KEY(assignment_id) REFERENCES run_assignments(id),
  ADD CONSTRAINT run_stops_stop_type_check_efa26c27
    CHECK (stop_type IN ('PICKUP','DROPOFF'));

-- Retain one conservative run per subscription/day/leg. Never invent a shared order,
-- return times, or stops where the legacy model lacks sufficient information.
-- Missing/malformed day metadata is retained as a review issue instead of discarded.
CREATE TABLE recurring_run_migration_issues (
  subscription_id text PRIMARY KEY REFERENCES subscriptions(id),
  reason text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO recurring_run_migration_issues(subscription_id,reason)
SELECT s.id,'LEGACY_COMMITMENT_REQUIRES_RUN_REVIEW'
FROM subscriptions s WHERE s.status IN ('ACTIVE','PAUSED');

INSERT INTO recurring_runs(id,driver_profile_id,operating_day,leg_type,effective_from,seat_capacity,needs_review)
SELECT overlay(overlay(md5('legacy:' || s.id || ':' || day || ':' || leg) placing '4' from 13 for 1) placing '8' from 17 for 1)::uuid::text,
  s.driver_profile_id, day, leg, (s.start_date AT TIME ZONE 'Asia/Karachi')::date,
  greatest(dp.seat_capacity,1), true
FROM subscriptions s JOIN driver_profiles dp ON dp.id=s.driver_profile_id
CROSS JOIN LATERAL unnest(dp.operating_days) day
CROSS JOIN LATERAL unnest(CASE s.type::text WHEN 'ROUND_TRIP' THEN ARRAY['MORNING','AFTERNOON']
  ELSE ARRAY[s.type::text] END) leg
WHERE s.status IN ('ACTIVE','PAUSED') AND day BETWEEN 0 AND 6
GROUP BY s.id,s.driver_profile_id,day,leg,s.start_date,dp.seat_capacity;

INSERT INTO run_assignments(run_id,subscription_id,driver_profile_id,leg_type,effective_from,needs_review)
SELECT r.id,s.id,s.driver_profile_id,r.leg_type,r.effective_from,true
FROM subscriptions s JOIN recurring_runs r ON r.id = overlay(overlay(md5('legacy:' || s.id || ':' || r.operating_day || ':' || r.leg_type) placing '4' from 13 for 1) placing '8' from 17 for 1)::uuid::text
WHERE s.status IN ('ACTIVE','PAUSED');

-- Validate complete pickup/dropoff pairs at commit so both rows can be inserted
-- in one acceptance transaction. Historical assignments have no fabricated stops.
CREATE FUNCTION check_run_stop_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id text; targets text[]; pickup integer; dropoff integer; review boolean;
BEGIN
  IF TG_TABLE_NAME = 'run_assignments' THEN
    targets := CASE WHEN TG_OP = 'DELETE' THEN ARRAY[OLD.id] ELSE ARRAY[NEW.id] END;
  ELSE
    targets := CASE WHEN TG_OP = 'INSERT' THEN ARRAY[NEW.assignment_id]
      WHEN TG_OP = 'DELETE' THEN ARRAY[OLD.assignment_id]
      ELSE ARRAY[OLD.assignment_id,NEW.assignment_id] END;
  END IF;
  FOR target_id IN SELECT DISTINCT unnest(targets) LOOP
    SELECT needs_review INTO review FROM run_assignments WHERE id=target_id;
    SELECT min(position) FILTER (WHERE stop_type='PICKUP'), min(position) FILTER (WHERE stop_type='DROPOFF')
      INTO pickup,dropoff FROM run_stops WHERE assignment_id=target_id;
    IF NOT coalesce(review,true) AND (pickup IS NULL OR dropoff IS NULL OR pickup >= dropoff) THEN
      RAISE EXCEPTION 'Run assignment requires pickup before dropoff' USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ck_run_stop_order AFTER INSERT OR UPDATE OR DELETE ON run_stops
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_run_stop_order();
CREATE CONSTRAINT TRIGGER ck_assignment_stop_pair AFTER INSERT OR UPDATE ON run_assignments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_run_stop_order();

-- Explicit grants: no write privileges or credentials.
-- Complete the pending leg-level uniqueness transition from the matching
-- foundation migration after all intermediate contract snapshots are applied.
ALTER TABLE driver_schedule_slots
  DROP CONSTRAINT IF EXISTS driver_schedule_slots_driver_profile_id_subscription_id_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'driver_schedule_slots'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) =
        'UNIQUE (driver_profile_id, subscription_id, leg_type)'
  ) THEN
    ALTER TABLE driver_schedule_slots
      ADD CONSTRAINT idx_dss_driver_sub_leg
      UNIQUE (driver_profile_id, subscription_id, leg_type);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='routeride_matching_ro') THEN
    GRANT SELECT ON driver_availability,recurring_runs,run_assignments,run_stops,
      recurring_run_migration_issues TO routeride_matching_ro;
  END IF;
END $$;
COMMIT;
