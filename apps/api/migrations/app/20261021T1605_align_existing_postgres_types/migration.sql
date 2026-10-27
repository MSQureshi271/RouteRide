-- Preserve the deployed PostgreSQL representation of recurring schedule data.
-- Existing time-of-day values are kept as TIME; non-null timestamps are rejected
-- rather than converted with an invented date or timezone.

DO $$
DECLARE
  existing_members text[];
  departure_type text;
  invalid_days boolean;
BEGIN
  SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
    INTO existing_members
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE n.nspname = 'public' AND t.typname = 'ScheduleLegType';

  IF existing_members IS NULL THEN
    CREATE TYPE public."ScheduleLegType" AS ENUM ('MORNING', 'AFTERNOON');
  ELSIF existing_members <> ARRAY['MORNING', 'AFTERNOON']::text[] THEN
    RAISE EXCEPTION 'ScheduleLegType has unexpected values: %', existing_members;
  END IF;

  SELECT udt_name INTO departure_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'driver_matching_stats'
    AND column_name = 'typical_departure_time';

  IF departure_type = 'timestamptz' THEN
    IF EXISTS (
      SELECT 1 FROM driver_matching_stats WHERE typical_departure_time IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Non-null driver_matching_stats timestamps require an explicit time-of-day conversion decision';
    END IF;
    ALTER TABLE driver_matching_stats
      ALTER COLUMN typical_departure_time TYPE time
      USING (typical_departure_time AT TIME ZONE 'Asia/Karachi')::time;
  ELSIF departure_type <> 'time' THEN
    RAISE EXCEPTION 'Unexpected driver_matching_stats.typical_departure_time type: %', departure_type;
  END IF;

  IF EXISTS (SELECT 1 FROM driver_matching_stats WHERE operating_day NOT BETWEEN 0 AND 6)
    OR EXISTS (SELECT 1 FROM driver_availability WHERE operating_day NOT BETWEEN 0 AND 6)
    OR EXISTS (SELECT 1 FROM recurring_runs WHERE operating_day NOT BETWEEN 0 AND 6) THEN
    RAISE EXCEPTION 'Operating-day values outside 0..6 cannot be narrowed to smallint';
  END IF;
END $$;

ALTER TABLE driver_schedule_slots
  DROP CONSTRAINT IF EXISTS driver_schedule_slots_leg_type_check_e8fc4c0a;
ALTER TABLE driver_availability
  DROP CONSTRAINT IF EXISTS driver_availability_leg_type_check_e8fc4c0a;
ALTER TABLE recurring_runs
  DROP CONSTRAINT IF EXISTS recurring_runs_leg_type_check_e8fc4c0a;
ALTER TABLE run_assignments
  DROP CONSTRAINT IF EXISTS run_assignments_leg_type_check_e8fc4c0a;

-- Rebuild the composite foreign key after both referenced enum columns change.
ALTER TABLE run_assignments DROP CONSTRAINT IF EXISTS fk_assignment_run;

ALTER TABLE driver_schedule_slots
  ALTER COLUMN leg_type TYPE public."ScheduleLegType" USING leg_type::text::public."ScheduleLegType";
ALTER TABLE driver_availability
  ALTER COLUMN leg_type TYPE public."ScheduleLegType" USING leg_type::text::public."ScheduleLegType",
  ALTER COLUMN operating_day TYPE smallint USING operating_day::smallint;
ALTER TABLE recurring_runs
  ALTER COLUMN leg_type TYPE public."ScheduleLegType" USING leg_type::text::public."ScheduleLegType",
  ALTER COLUMN operating_day TYPE smallint USING operating_day::smallint;
ALTER TABLE run_assignments
  ALTER COLUMN leg_type TYPE public."ScheduleLegType" USING leg_type::text::public."ScheduleLegType";
ALTER TABLE driver_matching_stats
  ALTER COLUMN operating_day TYPE smallint USING operating_day::smallint;

ALTER TABLE run_assignments
  ADD CONSTRAINT fk_assignment_run
  FOREIGN KEY (run_id, driver_profile_id, leg_type)
  REFERENCES recurring_runs(id, driver_profile_id, leg_type);
