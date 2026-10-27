-- Operational rollback preserves every active commitment and all run data.
-- Reverting additive schema is deliberately deferred until data is reconciled.
BEGIN;
UPDATE driver_profiles SET accepting_requests=false, availability_version=availability_version+1;
COMMIT;
