-- ═══════════════════════════════════════════════════════════════════════════════
-- RouteRide Phase 1A Task 1.09 Migration: PostGIS GIST Spatial Indexes
--
-- 1. Verifies/creates idx_dp_route on driver_profiles USING gist (((route_polyline::geography)))
--    Guards against stale/uncast definitions that defeat PostgreSQL cost-based index scans.
-- 2. Creates idx_riders_home and idx_riders_dest on riders USING gist (((...::geography)))
--    Completing the 3 PostGIS GIST spatial indexes mandated by TRD §3.2.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;

-- ─── 1. idx_dp_route on driver_profiles ───────────────────────────────────────
DO $$
BEGIN
  -- Drop index if it exists with a stale or non-geography definition
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'driver_profiles' 
      AND indexname = 'idx_dp_route'
      AND indexdef NOT LIKE '%gist%((route_polyline)::geography)%'
  ) THEN
    DROP INDEX idx_dp_route;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_dp_route 
  ON driver_profiles USING gist (((route_polyline::geography)));
END $$;

-- ─── 2. idx_riders_home and idx_riders_dest on riders ─────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'riders' 
      AND indexname = 'idx_riders_home'
      AND indexdef NOT LIKE '%gist%((home_location)::geography)%'
  ) THEN
    DROP INDEX idx_riders_home;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_riders_home 
  ON riders USING gist (((home_location::geography)));
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'riders' 
      AND indexname = 'idx_riders_dest'
      AND indexdef NOT LIKE '%gist%((dest_location)::geography)%'
  ) THEN
    DROP INDEX idx_riders_dest;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_riders_dest 
  ON riders USING gist (((dest_location::geography)));
END $$;

COMMIT;
