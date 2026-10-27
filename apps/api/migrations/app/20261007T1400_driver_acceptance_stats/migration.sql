-- ═══════════════════════════════════════════════════════════════════════════════
-- RouteRide Phase 1A Task 1.06 Migration: Driver Acceptance Stats (AD-8, T1.06)
--
-- Adds accepted_request_count and eligible_request_count columns to driver_profiles
-- to support canonical count-based Bayesian shrinkage for driver acceptance rate.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS accepted_request_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS eligible_request_count INT NOT NULL DEFAULT 0;

COMMIT;
