/**
 * Driver Stats Job Service (Phase 1A Task 1.10).
 *
 * Implements the daily authoritative precompute job:
 *  1. Driver-level acceptance stats (acceptedRequestCount, eligibleRequestCount,
 *     acceptanceRate over 90-day rolling window) written to driver_profiles.
 *     Domain rule: request is counted as accepted iff its lifecycle demonstrates
 *     driver acceptance (ACTIVE/PAUSED, or historical run/slot evidence).
 *     Declined and auto-declined requests are eligible but never accepted.
 *     Pending requests and consumer withdrawals are excluded until a driver decision.
 *  2. Day-level median departure times written to driver_matching_stats.
 *     Authoritative full-grid refresh across operating days 0..6 for approved drivers:
 *       - 0 observations: typical_departure_time = NULL, observation_count = 0
 *       - 1 observation:  typical_departure_time = NULL, observation_count = 1
 *       - 2 observations: typical_departure_time = NULL, observation_count = 2
 *       - >=3 observations: typical_departure_time = median_time, observation_count = N
 *  3. Idempotent and transaction-isolated: single transaction, rollback on failure.
 */
import { Injectable, Logger } from "@nestjs/common";
import pg from "pg";
import { WorkerDatabaseService } from "../database/database.service";

export interface DriverStatsRefreshResult {
  driversUpdated: number;
  statsUpserted: number;
}

@Injectable()
export class DriverStatsJobService {
  private readonly logger = new Logger(DriverStatsJobService.name);

  constructor(private readonly dbService: WorkerDatabaseService) {}

  async executeRefresh(): Promise<DriverStatsRefreshResult> {
    const client = await this.dbService.getClient();
    try {
      await client.query("BEGIN;");

      const result = await this.performRefresh(client);

      await client.query("COMMIT;");
      this.logger.log({
        event: "driver_stats.refresh_completed",
        driversUpdated: result.driversUpdated,
        statsUpserted: result.statsUpserted,
      });
      return result;
    } catch (err) {
      await client.query("ROLLBACK;").catch(() => {});
      this.logger.error({
        event: "driver_stats.refresh_failed",
        reason: "database_failure",
      });
      throw err;
    } finally {
      client.release();
    }
  }

  async performRefresh(
    client: pg.PoolClient,
  ): Promise<DriverStatsRefreshResult> {
    // 1. Authoritative 90-day driver-level acceptance stats update
    const updateDriversRes = await client.query(`
      WITH decided_requests AS (
        SELECT
          s.driver_profile_id,
          s.id,
          CASE
            WHEN s.status IN ('ACTIVE', 'PAUSED') THEN TRUE
            WHEN s.status IN ('CANCELLED', 'EXPIRED') AND (
              EXISTS (SELECT 1 FROM run_assignments ra WHERE ra.subscription_id = s.id)
              OR EXISTS (SELECT 1 FROM driver_schedule_slots dss WHERE dss.subscription_id = s.id)
            ) THEN TRUE
            ELSE FALSE
          END AS is_accepted
        FROM subscriptions s
        WHERE s.created_at >= NOW() - INTERVAL '90 days'
          AND (s.status IN ('ACTIVE', 'PAUSED', 'DECLINED', 'EXPIRED')
            OR (s.status = 'CANCELLED' AND (
              EXISTS (SELECT 1 FROM run_assignments ra WHERE ra.subscription_id = s.id)
              OR EXISTS (SELECT 1 FROM driver_schedule_slots dss WHERE dss.subscription_id = s.id)
            )))
      ),
      driver_aggregates AS (
        SELECT
          driver_profile_id,
          COUNT(*)::int AS eligible_count,
          COUNT(*) FILTER (WHERE is_accepted)::int AS accepted_count
        FROM decided_requests
        GROUP BY driver_profile_id
      )
      UPDATE driver_profiles dp
      SET
        eligible_request_count = COALESCE(da.eligible_count, 0),
        accepted_request_count = COALESCE(da.accepted_count, 0),
        acceptance_rate = CASE
          WHEN COALESCE(da.eligible_count, 0) > 0
          THEN ROUND((da.accepted_count::numeric / da.eligible_count::numeric), 2)
          ELSE NULL
        END,
        updated_at = NOW()
      FROM driver_profiles dp_orig
      LEFT JOIN driver_aggregates da ON da.driver_profile_id = dp_orig.id
      WHERE dp.id = dp_orig.id;
    `);

    // 2. Authoritative day-level median departure times full grid refresh
    // Generates complete grid for operating days (0..6) across approved drivers
    const upsertStatsRes = await client.query(`
      WITH active_driver_days AS (
        SELECT
          dp.id AS driver_profile_id,
          day.val AS operating_day
        FROM driver_profiles dp
        CROSS JOIN generate_series(0, 6) AS day(val)
        WHERE dp.status = 'APPROVED'
      ),
      active_run_observations AS (
        SELECT
          rr.driver_profile_id,
          rr.operating_day,
          EXTRACT(EPOCH FROM rr.starts_at) AS pickup_seconds
        FROM recurring_runs rr
        WHERE rr.leg_type = 'MORNING' AND NOT rr.needs_review
          AND rr.starts_at IS NOT NULL
          AND rr.effective_from <= CURRENT_DATE
          AND (rr.effective_to IS NULL OR rr.effective_to >= CURRENT_DATE)
          AND EXISTS (
            SELECT 1 FROM run_assignments ra JOIN subscriptions s ON s.id=ra.subscription_id
            WHERE ra.run_id=rr.id AND s.status='ACTIVE' AND NOT ra.needs_review
              AND ra.effective_from <= CURRENT_DATE
              AND (ra.effective_to IS NULL OR ra.effective_to >= CURRENT_DATE)
          )
      ),
      observation_aggregates AS (
        SELECT
          driver_profile_id,
          operating_day,
          COUNT(*)::int AS obs_count,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY pickup_seconds) AS median_seconds
        FROM active_run_observations
        GROUP BY driver_profile_id, operating_day
      )
      INSERT INTO driver_matching_stats (
        id, driver_profile_id, operating_day, typical_departure_time, observation_count, computed_at
      )
      SELECT
        gen_random_uuid()::text,
        grid.driver_profile_id,
        grid.operating_day,
        CASE
          WHEN COALESCE(oa.obs_count, 0) >= 3
          THEN ('00:00:00'::time + (oa.median_seconds || ' seconds')::interval)::time
          ELSE NULL
        END,
        COALESCE(oa.obs_count, 0),
        NOW()
      FROM active_driver_days grid
      LEFT JOIN observation_aggregates oa
        ON oa.driver_profile_id = grid.driver_profile_id
       AND oa.operating_day = grid.operating_day
      ON CONFLICT (driver_profile_id, operating_day)
      DO UPDATE SET
        typical_departure_time = EXCLUDED.typical_departure_time,
        observation_count = EXCLUDED.observation_count,
        computed_at = EXCLUDED.computed_at;
    `);

    return {
      driversUpdated: updateDriversRes.rowCount ?? 0,
      statsUpserted: upsertStatsRes.rowCount ?? 0,
    };
  }
}
