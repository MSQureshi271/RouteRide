-- ═══════════════════════════════════════════════════════════════════════════════
-- RouteRide Phase 1A Task 1.04 Migration: Schedule Slots TIME Type Alignment
--
-- Aligns driver_schedule_slots.slot_start and slot_end with ADR-007 and Prisma
-- schema (@db.Time).
-- Converts existing timestamptz values to TIME WITHOUT TIME ZONE normalized
-- explicitly to Asia/Karachi (UTC+5).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE driver_schedule_slots
  ALTER COLUMN slot_start TYPE TIME WITHOUT TIME ZONE USING (slot_start AT TIME ZONE 'Asia/Karachi')::time,
  ALTER COLUMN slot_end TYPE TIME WITHOUT TIME ZONE USING (slot_end AT TIME ZONE 'Asia/Karachi')::time;

COMMIT;
