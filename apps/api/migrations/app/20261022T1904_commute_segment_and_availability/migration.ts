#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/4f73aaaae55fdb6f867be209c41a2d2bccfcf0ec90487757da1a42c452626275/contract';
import startContract from '../../snapshots/4f73aaaae55fdb6f867be209c41a2d2bccfcf0ec90487757da1a42c452626275/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/802a1be710051399c62b75b61b98ec6dc1415ca5ed41fb4601015296267f4ad7/contract';
import endContract from '../../snapshots/802a1be710051399c62b75b61b98ec6dc1415ca5ed41fb4601015296267f4ad7/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'commute.segment.availability.transition',
        label: 'Rename commute segments and make driver availability time-based',
        operationClass: 'destructive',
        target: { id: 'postgres' },
        precheck: [
          {
            description: 'old commute labels exist and no run mixes segment meanings',
            sql: `SELECT
              (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
                 FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
                WHERE t.typnamespace='public'::regnamespace AND t.typname='ScheduleLegType')
                = ARRAY['MORNING','AFTERNOON']::text[]
              AND (
                (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
                   FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
                  WHERE t.typnamespace='public'::regnamespace AND t.typname='TripType')
                  = ARRAY['MORNING','AFTERNOON']::text[]
                OR NOT EXISTS (SELECT 1 FROM pg_type t
                  WHERE t.typnamespace='public'::regnamespace AND t.typname='TripType')
              )
              AND EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='driver_availability' AND column_name='leg_type')
              AND NOT EXISTS (
                SELECT 1 FROM run_assignments ra JOIN subscriptions s ON s.id=ra.subscription_id
                GROUP BY ra.run_id
                HAVING count(DISTINCT CASE
                  WHEN s.type='ROUND_TRIP' AND ra.leg_type::text='AFTERNOON' THEN 'PICKUP'
                  ELSE 'DEPARTURE' END)>1
              )`,
          },
        ],
        execute: [
          {
            description: 'defer assignment parent keys during segment remapping',
            sql: `ALTER TABLE run_assignments
                ALTER CONSTRAINT fk_assignment_run DEFERRABLE INITIALLY IMMEDIATE;
              SET CONSTRAINTS fk_assignment_run DEFERRED`,
          },
          {
            description: 'allow multiple disjoint intervals per operating day',
            sql: `ALTER TABLE driver_availability
              DROP CONSTRAINT IF EXISTS uq_driver_availability_day_leg`,
          },
          {
            description: 'merge availability intervals while preserving gaps and rows',
            sql: `WITH merged AS MATERIALIZED (
                SELECT driver_profile_id, operating_day,
                  lower(window_range)::time AS window_start,
                  upper(window_range)::time AS window_end
                FROM (
                  SELECT driver_profile_id, operating_day,
                    unnest(range_agg(tsrange(
                      DATE '2000-01-01' + window_start,
                      DATE '2000-01-01' + window_end,
                      '[)'
                    ))) AS window_range
                  FROM driver_availability
                  GROUP BY driver_profile_id, operating_day
                ) intervals
              ), removed AS (
                DELETE FROM driver_availability RETURNING 1
              )
              INSERT INTO driver_availability
                (id, driver_profile_id, operating_day, leg_type, window_start, window_end)
              SELECT gen_random_uuid()::text, merged.driver_profile_id,
                merged.operating_day, 'MORNING'::public."ScheduleLegType",
                merged.window_start, merged.window_end
              FROM merged CROSS JOIN (SELECT count(*) FROM removed) AS deletion`,
          },
          {
            description: 'remove per-leg availability constraint and column, then index intervals',
            sql: `ALTER TABLE driver_availability
                DROP CONSTRAINT IF EXISTS uq_driver_availability_day_leg;
              ALTER TABLE driver_availability DROP COLUMN leg_type;
              CREATE INDEX idx_driver_availability_day_window
                ON driver_availability(driver_profile_id, operating_day, window_start, window_end)`,
          },
          {
            description: 'rename stored run segment enum values',
            sql: `ALTER TYPE public."ScheduleLegType" RENAME VALUE 'MORNING' TO 'DEPARTURE';
              ALTER TYPE public."ScheduleLegType" RENAME VALUE 'AFTERNOON' TO 'PICKUP';
              DO $$ BEGIN
                IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
                  WHERE t.typnamespace='public'::regnamespace AND t.typname='TripType') THEN
                  EXECUTE 'ALTER TYPE public."TripType" RENAME VALUE ''MORNING'' TO ''DEPARTURE''';
                  EXECUTE 'ALTER TYPE public."TripType" RENAME VALUE ''AFTERNOON'' TO ''PICKUP''';
                END IF;
              END $$`,
          },
          {
            description: 'map one-way afternoon commitments to departure segments',
            sql: `UPDATE driver_schedule_slots slot SET leg_type='DEPARTURE'
                FROM subscriptions s WHERE s.id=slot.subscription_id
                  AND s.type='AFTERNOON' AND slot.leg_type='PICKUP';
              UPDATE run_assignments assignment SET leg_type='DEPARTURE'
                FROM subscriptions s WHERE s.id=assignment.subscription_id
                  AND s.type='AFTERNOON' AND assignment.leg_type='PICKUP';
              UPDATE recurring_runs run SET leg_type=mapped.leg_type
                FROM (
                  SELECT ra.run_id,
                    min(ra.leg_type::text)::public."ScheduleLegType" AS leg_type
                  FROM run_assignments ra
                  JOIN subscriptions s ON s.id=ra.subscription_id
                  GROUP BY ra.run_id
                  HAVING count(DISTINCT ra.leg_type::text)=1
                ) mapped WHERE run.id=mapped.run_id;
              SET CONSTRAINTS fk_assignment_run IMMEDIATE;
              SELECT 1`,
          },
          {
            description: 'replace subscription and trip type checks with one-way and segment values',
            sql: `ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_type_check_d04a7056;
              ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_type_check_4f232f02;
              UPDATE trips trip SET type=CASE
                WHEN s.type IN ('MORNING','AFTERNOON') THEN 'DEPARTURE'
                WHEN trip.type='MORNING' THEN 'DEPARTURE'
                WHEN trip.type='AFTERNOON' THEN 'PICKUP'
                ELSE trip.type END
                FROM subscriptions s WHERE s.id=trip.subscription_id;
              UPDATE subscriptions SET type='ONE_WAY' WHERE type IN ('MORNING','AFTERNOON');
              ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_type_check_d6e2f9ad
                CHECK (type IN ('ONE_WAY','ROUND_TRIP'));
              ALTER TABLE trips ADD CONSTRAINT trips_type_check_72e8e2c8
                CHECK (type IN ('DEPARTURE','PICKUP'))`,
          },
        ],
        postcheck: [
          {
            description: 'new commute values and interval availability are in place',
            sql: `SELECT
              (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
                 FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
                WHERE t.typnamespace='public'::regnamespace AND t.typname='ScheduleLegType')
                = ARRAY['DEPARTURE','PICKUP']::text[]
              AND NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
                WHERE t.typnamespace='public'::regnamespace AND t.typname='TripType'
                  AND e.enumlabel::text IN ('MORNING','AFTERNOON'))
              AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='driver_availability' AND column_name='leg_type')
              AND to_regclass('public.idx_driver_availability_day_window') IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE type IN ('MORNING','AFTERNOON'))
              AND NOT EXISTS (SELECT 1 FROM trips WHERE type IN ('MORNING','AFTERNOON'))
              AND NOT EXISTS (
                SELECT 1 FROM driver_availability a JOIN driver_availability b
                  ON a.driver_profile_id=b.driver_profile_id AND a.operating_day=b.operating_day
                  AND a.id < b.id AND a.window_start < b.window_end AND b.window_start < a.window_end
              )`,
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
