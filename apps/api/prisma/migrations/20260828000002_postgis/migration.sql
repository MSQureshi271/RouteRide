-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260828000002_postgis
-- Purpose:   PostGIS extensions, GEOGRAPHY columns, GIST indexes, partial indexes
--
-- ADR-002: All geography types and GIST indexes are isolated in this file.
--           Raw DDL only — no Prisma-generated content.
-- Idempotent: All statements use IF NOT EXISTS where supported.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Extensions ───────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ─── GEOGRAPHY Columns ────────────────────────────────────────────────────────
-- Added via ALTER TABLE because Prisma created the tables without them.

-- driver_profiles.route_polyline
ALTER TABLE "driver_profiles"
    ADD COLUMN IF NOT EXISTS "route_polyline" GEOGRAPHY(LINESTRING, 4326) NOT NULL
        DEFAULT ST_GeomFromText('LINESTRING(67.01 24.86, 67.02 24.87)', 4326);
ALTER TABLE "driver_profiles"
    ALTER COLUMN "route_polyline" DROP DEFAULT;

-- riders.home_location
ALTER TABLE "riders"
    ADD COLUMN IF NOT EXISTS "home_location" GEOGRAPHY(POINT, 4326) NOT NULL
        DEFAULT ST_GeomFromText('POINT(67.0099 24.8600)', 4326);
ALTER TABLE "riders"
    ALTER COLUMN "home_location" DROP DEFAULT;

-- riders.dest_location
ALTER TABLE "riders"
    ADD COLUMN IF NOT EXISTS "dest_location" GEOGRAPHY(POINT, 4326) NOT NULL
        DEFAULT ST_GeomFromText('POINT(67.0500 24.9000)', 4326);
ALTER TABLE "riders"
    ALTER COLUMN "dest_location" DROP DEFAULT;

-- subscriptions.agreed_pickup_location
ALTER TABLE "subscriptions"
    ADD COLUMN IF NOT EXISTS "agreed_pickup_location" GEOGRAPHY(POINT, 4326) NOT NULL
        DEFAULT ST_GeomFromText('POINT(67.0099 24.8600)', 4326);
ALTER TABLE "subscriptions"
    ALTER COLUMN "agreed_pickup_location" DROP DEFAULT;

-- subscriptions.agreed_dropoff_location
ALTER TABLE "subscriptions"
    ADD COLUMN IF NOT EXISTS "agreed_dropoff_location" GEOGRAPHY(POINT, 4326) NOT NULL
        DEFAULT ST_GeomFromText('POINT(67.0500 24.9000)', 4326);
ALTER TABLE "subscriptions"
    ALTER COLUMN "agreed_dropoff_location" DROP DEFAULT;

-- ─── GIST Indexes ─────────────────────────────────────────────────────────────
-- TRD §3.2 — spatial indexes for matching engine hot paths

CREATE INDEX IF NOT EXISTS "idx_dp_route"
    ON "driver_profiles" USING GIST ("route_polyline");

CREATE INDEX IF NOT EXISTS "idx_riders_home"
    ON "riders" USING GIST ("home_location");

CREATE INDEX IF NOT EXISTS "idx_riders_dest"
    ON "riders" USING GIST ("dest_location");

-- ─── Partial Index ────────────────────────────────────────────────────────────
-- Not expressible in Prisma schema; must live here.

CREATE INDEX IF NOT EXISTS "idx_notifications_user_unread"
    ON "notifications" ("user_id", "is_read")
    WHERE "is_read" = FALSE;
