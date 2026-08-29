-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260828000001_init
-- Purpose:   Base schema — enums, tables, B-tree indexes, FKs, CHECK constraints
-- Tool:      Prisma Migrate (auto-generated from schema.prisma)
--
-- NOTE: Geography columns (GEOGRAPHY type) and GIST indexes are NOT in this file.
--       They live in 20260828000002_postgis/migration.sql (ADR-002).
-- ═══════════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CONSUMER', 'DRIVER', 'ADMIN', 'INSTITUTION_ADMIN', 'FLEET_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerifyTier" AS ENUM ('BASIC', 'ENHANCED', 'ELITE');

-- CreateEnum
CREATE TYPE "SubType" AS ENUM ('MORNING', 'AFTERNOON', 'ROUND_TRIP');

-- CreateEnum
CREATE TYPE "SubStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TripType" AS ENUM ('MORNING', 'AFTERNOON');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');

-- CreateTable: users
CREATE TABLE "users" (
    "id"                 UUID        NOT NULL DEFAULT uuid_generate_v4(),
    "email"              TEXT        UNIQUE,
    "phone"              TEXT        NOT NULL UNIQUE,
    "password_hash"      TEXT,
    "role"               "UserRole"  NOT NULL DEFAULT 'CONSUMER',
    "status"             "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "full_name"          TEXT        NOT NULL,
    "profile_photo_url"  TEXT,
    "fcm_token"          TEXT,
    "preferred_language" CHAR(2)     NOT NULL DEFAULT 'en',
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"         TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: users
CREATE UNIQUE INDEX "idx_users_email" ON "users"("email") WHERE "email" IS NOT NULL;
CREATE UNIQUE INDEX "idx_users_phone" ON "users"("phone");

-- CreateTable: driver_profiles
CREATE TABLE "driver_profiles" (
    "id"                    UUID           NOT NULL DEFAULT uuid_generate_v4(),
    "user_id"               UUID           NOT NULL UNIQUE,
    "licence_number"        TEXT           NOT NULL,
    "vehicle_make"          TEXT           NOT NULL,
    "vehicle_model"         TEXT           NOT NULL,
    "vehicle_year"          SMALLINT       NOT NULL,
    "vehicle_colour"        TEXT           NOT NULL,
    "plate_number"          TEXT           NOT NULL UNIQUE,
    "seat_capacity"         SMALLINT       NOT NULL,
    "operating_days"        SMALLINT[]     NOT NULL,
    "base_price_cents"      INTEGER        NOT NULL,
    "currency"              CHAR(3)        NOT NULL DEFAULT 'PKR',
    "status"                "DriverStatus" NOT NULL DEFAULT 'PENDING',
    "verification_tier"     "VerifyTier"   NOT NULL DEFAULT 'BASIC',
    "stripe_account_id"     TEXT,
    "bank_account_ref"      TEXT,
    "acceptance_rate"       DECIMAL(5,2),
    "typical_departure_time" TIMESTAMPTZ,
    "created_at"            TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_seat_capacity" CHECK ("seat_capacity" BETWEEN 1 AND 50),
    CONSTRAINT "chk_base_price" CHECK ("base_price_cents" > 0)
);

-- CreateIndex: driver_profiles
CREATE INDEX "idx_dp_status" ON "driver_profiles"("status");

-- CreateTable: driver_documents
CREATE TABLE "driver_documents" (
    "id"          UUID        NOT NULL DEFAULT uuid_generate_v4(),
    "driver_id"   UUID        NOT NULL,
    "doc_type"    TEXT        NOT NULL,
    "s3_key"      TEXT        NOT NULL,
    "expiry_date" DATE,
    "verified_at" TIMESTAMPTZ,
    "verified_by" UUID,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable: consumer_profiles
CREATE TABLE "consumer_profiles" (
    "id"                       UUID        NOT NULL DEFAULT uuid_generate_v4(),
    "user_id"                  UUID        NOT NULL UNIQUE,
    "emergency_contact_name"   TEXT        NOT NULL,
    "emergency_contact_phone"  TEXT        NOT NULL,
    "stripe_customer_id"       TEXT,
    "created_at"               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable: riders
CREATE TABLE "riders" (
    "id"                  UUID        NOT NULL DEFAULT uuid_generate_v4(),
    "consumer_profile_id" UUID        NOT NULL,
    "name"                TEXT        NOT NULL,
    "photo_url"           TEXT,
    "home_address_text"   TEXT        NOT NULL,
    "dest_address_text"   TEXT        NOT NULL,
    "notes"               TEXT,
    "created_at"          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "riders_pkey" PRIMARY KEY ("id")
);
-- Note: home_location and dest_location geography columns added in postgis migration

-- CreateTable: subscriptions
CREATE TABLE "subscriptions" (
    "id"                    UUID         NOT NULL DEFAULT uuid_generate_v4(),
    "rider_id"              UUID         NOT NULL,
    "driver_profile_id"     UUID         NOT NULL,
    "type"                  "SubType"    NOT NULL,
    "agreed_pickup_time"    TIME         NOT NULL,
    "agreed_dropoff_time"   TIME         NOT NULL,
    "pickup_address_text"   TEXT         NOT NULL,
    "dropoff_address_text"  TEXT         NOT NULL,
    "monthly_price_cents"   INTEGER      NOT NULL,
    "currency"              CHAR(3)      NOT NULL DEFAULT 'PKR',
    "status"                "SubStatus"  NOT NULL DEFAULT 'PENDING',
    "start_date"            DATE         NOT NULL,
    "next_billing_date"     DATE         NOT NULL,
    "stripe_subscription_id" TEXT,
    "cancellation_reason"   TEXT,
    "created_at"            TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);
-- Note: agreed_pickup_location and agreed_dropoff_location added in postgis migration

-- CreateIndex: subscriptions
CREATE INDEX "idx_subs_driver_status" ON "subscriptions"("driver_profile_id", "status");
CREATE INDEX "idx_subs_rider" ON "subscriptions"("rider_id");

-- CreateTable: driver_schedule_slots
CREATE TABLE "driver_schedule_slots" (
    "id"                UUID       NOT NULL DEFAULT uuid_generate_v4(),
    "driver_profile_id" UUID       NOT NULL,
    "subscription_id"   UUID       NOT NULL,
    "slot_start"        TIME       NOT NULL,
    "slot_end"          TIME       NOT NULL,
    "operating_days"    SMALLINT[] NOT NULL,
    "pickup_order"      SMALLINT   NOT NULL,

    CONSTRAINT "driver_schedule_slots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "driver_schedule_slots_driver_profile_id_subscription_id_key"
        UNIQUE ("driver_profile_id", "subscription_id")
);

-- CreateIndex: driver_schedule_slots
CREATE INDEX "idx_dss_driver_days" ON "driver_schedule_slots"("driver_profile_id", "operating_days");

-- CreateTable: trips
CREATE TABLE "trips" (
    "id"                  UUID         NOT NULL DEFAULT uuid_generate_v4(),
    "subscription_id"     UUID         NOT NULL,
    "driver_profile_id"   UUID         NOT NULL,
    "scheduled_date"      DATE         NOT NULL,
    "type"                "TripType"   NOT NULL,
    "status"              "TripStatus" NOT NULL DEFAULT 'SCHEDULED',
    "actual_pickup_at"    TIMESTAMPTZ,
    "actual_dropoff_at"   TIMESTAMPTZ,
    "location_log_id"     UUID,
    "deviation_alert_sent" BOOLEAN     NOT NULL DEFAULT FALSE,
    "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "idx_trips_sub_date" UNIQUE ("subscription_id", "scheduled_date", "type")
);

-- CreateIndex: trips
CREATE INDEX "idx_trips_status_date" ON "trips"("status", "scheduled_date");

-- CreateTable: location_logs
CREATE TABLE "location_logs" (
    "id"                UUID        NOT NULL DEFAULT uuid_generate_v4(),
    "driver_profile_id" UUID        NOT NULL,
    "trip_id"           UUID,
    "points"            JSONB       NOT NULL DEFAULT '[]'::jsonb,
    "started_at"        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at"          TIMESTAMPTZ,

    CONSTRAINT "location_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "points_is_array" CHECK (jsonb_typeof("points") = 'array')
);

-- CreateTable: payments
CREATE TABLE "payments" (
    "id"                       UUID        NOT NULL DEFAULT uuid_generate_v4(),
    "subscription_id"          UUID        NOT NULL,
    "amount_cents"             INTEGER     NOT NULL,
    "currency"                 CHAR(3)     NOT NULL DEFAULT 'PKR',
    "status"                   "PayStatus" NOT NULL DEFAULT 'PENDING',
    "stripe_payment_intent_id" TEXT        UNIQUE,
    "idempotency_key"          TEXT        NOT NULL UNIQUE,
    "billing_date"             DATE        NOT NULL,
    "receipt_url"              TEXT,
    "failure_reason"           TEXT,
    "retry_count"              SMALLINT    NOT NULL DEFAULT 0,
    "created_at"               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: payments
CREATE INDEX "idx_payments_sub" ON "payments"("subscription_id");
CREATE UNIQUE INDEX "idx_payments_idempotency" ON "payments"("idempotency_key");

-- CreateTable: driver_payouts
CREATE TABLE "driver_payouts" (
    "id"                 UUID           NOT NULL DEFAULT uuid_generate_v4(),
    "driver_profile_id"  UUID           NOT NULL,
    "period_start"       DATE           NOT NULL,
    "period_end"         DATE           NOT NULL,
    "gross_cents"        INTEGER        NOT NULL,
    "commission_cents"   INTEGER        NOT NULL,
    "net_cents"          INTEGER        NOT NULL,
    "status"             "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "stripe_transfer_id" TEXT,
    "payout_date"        DATE,
    "created_at"         TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: reviews
CREATE TABLE "reviews" (
    "id"              UUID     NOT NULL DEFAULT uuid_generate_v4(),
    "subscription_id" UUID     NOT NULL,
    "author_id"       UUID     NOT NULL,
    "target_id"       UUID     NOT NULL,
    "rating"          SMALLINT NOT NULL,
    "comment"         TEXT,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reviews_subscription_id_author_id_key" UNIQUE ("subscription_id", "author_id"),
    CONSTRAINT "chk_rating" CHECK ("rating" BETWEEN 1 AND 5)
);

-- CreateTable: notifications
CREATE TABLE "notifications" (
    "id"         UUID        NOT NULL DEFAULT uuid_generate_v4(),
    "user_id"    UUID        NOT NULL,
    "type"       TEXT        NOT NULL,
    "title"      TEXT        NOT NULL,
    "body"       TEXT        NOT NULL,
    "data"       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    "is_read"    BOOLEAN     NOT NULL DEFAULT FALSE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
-- Partial index idx_notifications_user_unread is in the postgis migration

-- CreateTable: messages
CREATE TABLE "messages" (
    "id"              UUID        NOT NULL DEFAULT uuid_generate_v4(),
    "subscription_id" UUID        NOT NULL,
    "sender_id"       UUID        NOT NULL,
    "body"            TEXT        NOT NULL,
    "sent_at"         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at"         TIMESTAMPTZ,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: messages
CREATE INDEX "idx_messages_sub" ON "messages"("subscription_id", "sent_at" DESC);

-- CreateTable: idempotency_keys
CREATE TABLE "idempotency_keys" (
    "key"          TEXT        NOT NULL,
    "request_hash" TEXT        NOT NULL,
    "state"        TEXT        NOT NULL DEFAULT 'in_progress',
    "response"     JSONB,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at"   TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateIndex: idempotency_keys
CREATE INDEX "idx_idempotency_expires" ON "idempotency_keys"("expires_at");

-- CreateTable: audit_log
CREATE TABLE "audit_log" (
    "id"          UUID        NOT NULL DEFAULT uuid_generate_v4(),
    "actor_id"    UUID,
    "action"      TEXT        NOT NULL,
    "entity_type" TEXT        NOT NULL,
    "entity_id"   UUID,
    "old_data"    JSONB,
    "new_data"    JSONB,
    "ip_address"  TEXT,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: audit_log
CREATE INDEX "idx_audit_entity" ON "audit_log"("entity_type", "entity_id");

-- CreateTable: refresh_tokens
CREATE TABLE "refresh_tokens" (
    "id"         UUID        NOT NULL DEFAULT uuid_generate_v4(),
    "token_hash" TEXT        NOT NULL UNIQUE,
    "user_id"    UUID        NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable: payment_methods
CREATE TABLE "payment_methods" (
    "id"                        UUID        NOT NULL DEFAULT uuid_generate_v4(),
    "user_id"                   UUID        NOT NULL,
    "gateway"                   TEXT        NOT NULL,
    "gateway_customer_id"       TEXT        NOT NULL,
    "gateway_payment_method_id" TEXT        NOT NULL,
    "is_default"                BOOLEAN     NOT NULL DEFAULT FALSE,
    "created_at"                TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable: support_tickets
CREATE TABLE "support_tickets" (
    "id"          UUID        NOT NULL DEFAULT uuid_generate_v4(),
    "user_id"     UUID        NOT NULL,
    "trip_id"     UUID,
    "status"      TEXT        NOT NULL DEFAULT 'OPEN',
    "subject"     TEXT        NOT NULL,
    "body"        TEXT        NOT NULL,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- ─── Foreign Key Constraints ──────────────────────────────────────────────────

ALTER TABLE "driver_profiles"
    ADD CONSTRAINT "driver_profiles_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "driver_documents"
    ADD CONSTRAINT "driver_documents_driver_id_fkey"
        FOREIGN KEY ("driver_id") REFERENCES "driver_profiles"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "driver_documents_verified_by_fkey"
        FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "consumer_profiles"
    ADD CONSTRAINT "consumer_profiles_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "riders"
    ADD CONSTRAINT "riders_consumer_profile_id_fkey"
        FOREIGN KEY ("consumer_profile_id") REFERENCES "consumer_profiles"("id") ON DELETE CASCADE;

ALTER TABLE "subscriptions"
    ADD CONSTRAINT "subscriptions_rider_id_fkey"
        FOREIGN KEY ("rider_id") REFERENCES "riders"("id"),
    ADD CONSTRAINT "subscriptions_driver_profile_id_fkey"
        FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id");

ALTER TABLE "driver_schedule_slots"
    ADD CONSTRAINT "driver_schedule_slots_driver_profile_id_fkey"
        FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "driver_schedule_slots_subscription_id_fkey"
        FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE;

ALTER TABLE "trips"
    ADD CONSTRAINT "trips_subscription_id_fkey"
        FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id"),
    ADD CONSTRAINT "trips_driver_profile_id_fkey"
        FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id"),
    ADD CONSTRAINT "trips_location_log_id_fkey"
        FOREIGN KEY ("location_log_id") REFERENCES "location_logs"("id");

ALTER TABLE "location_logs"
    ADD CONSTRAINT "location_logs_driver_profile_id_fkey"
        FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id"),
    ADD CONSTRAINT "location_logs_trip_id_fkey"
        FOREIGN KEY ("trip_id") REFERENCES "trips"("id");

ALTER TABLE "payments"
    ADD CONSTRAINT "payments_subscription_id_fkey"
        FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id");

ALTER TABLE "driver_payouts"
    ADD CONSTRAINT "driver_payouts_driver_profile_id_fkey"
        FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id");

ALTER TABLE "reviews"
    ADD CONSTRAINT "reviews_subscription_id_fkey"
        FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id"),
    ADD CONSTRAINT "reviews_author_id_fkey"
        FOREIGN KEY ("author_id") REFERENCES "users"("id"),
    ADD CONSTRAINT "reviews_target_id_fkey"
        FOREIGN KEY ("target_id") REFERENCES "users"("id");

ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "messages"
    ADD CONSTRAINT "messages_subscription_id_fkey"
        FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id"),
    ADD CONSTRAINT "messages_sender_id_fkey"
        FOREIGN KEY ("sender_id") REFERENCES "users"("id");

ALTER TABLE "audit_log"
    ADD CONSTRAINT "audit_log_actor_id_fkey"
        FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "payment_methods"
    ADD CONSTRAINT "payment_methods_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "support_tickets"
    ADD CONSTRAINT "support_tickets_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id"),
    ADD CONSTRAINT "support_tickets_trip_id_fkey"
        FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL;
