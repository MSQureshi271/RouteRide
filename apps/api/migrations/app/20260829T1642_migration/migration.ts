#!/usr/bin/env -S node
import type { Contract as End } from "../../snapshots/9e8f9d50fd4d2e25e57128014781419436909103596574a60bc5f4fa36db343e/contract";
import endContract from "../../snapshots/9e8f9d50fd4d2e25e57128014781419436909103596574a60bc5f4fa36db343e/contract.json" with { type: "json" };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from "@prisma/orm-postgres/migration";

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: "public" }),
      this.createTable({
        schema: "public",
        table: "audit_log",
        columns: [
          col("action", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("actor_id", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("created_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("entity_id", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("entity_type", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("ip_address", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("new_data", "json", { codecRef: { codecId: "pg/json@1" } }),
          col("old_data", "json", { codecRef: { codecId: "pg/json@1" } }),
        ],
        constraints: [primaryKey(["id"])],
      }),
      this.createTable({
        schema: "public",
        table: "consumer_profiles",
        columns: [
          col("created_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("emergency_contact_name", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("emergency_contact_phone", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("stripe_customer_id", "text", {
            codecRef: { codecId: "pg/text@1" },
          }),
          col("updated_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("user_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
        ],
        constraints: [primaryKey(["id"])],
      }),
      this.createTable({
        schema: "public",
        table: "driver_documents",
        columns: [
          col("created_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("doc_type", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("driver_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("expiry_date", "timestamptz", {
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("s3_key", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("verified_at", "timestamptz", {
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("verified_by", "text", { codecRef: { codecId: "pg/text@1" } }),
        ],
        constraints: [primaryKey(["id"])],
      }),
      this.createTable({
        schema: "public",
        table: "driver_payouts",
        columns: [
          col("commission_cents", "int4", {
            notNull: true,
            codecRef: { codecId: "pg/int4@1" },
          }),
          col("created_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("driver_profile_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("gross_cents", "int4", {
            notNull: true,
            codecRef: { codecId: "pg/int4@1" },
          }),
          col("id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("net_cents", "int4", {
            notNull: true,
            codecRef: { codecId: "pg/int4@1" },
          }),
          col("payout_date", "timestamptz", {
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("period_end", "timestamptz", {
            notNull: true,
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("period_start", "timestamptz", {
            notNull: true,
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("status", "text", {
            notNull: true,
            default: lit("PENDING"),
            codecRef: { codecId: "pg/text@1" },
          }),
          col("stripe_transfer_id", "text", {
            codecRef: { codecId: "pg/text@1" },
          }),
          col("updated_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
        ],
        constraints: [
          primaryKey(["id"]),
          checkExpression(
            "driver_payouts_status_check_244899a6",
            "\"status\" IN ('PENDING', 'PROCESSING', 'PAID', 'FAILED')",
          ),
        ],
      }),
      this.createTable({
        schema: "public",
        table: "driver_profiles",
        columns: [
          col("acceptance_rate", "numeric", {
            codecRef: { codecId: "pg/numeric@1" },
          }),
          col("bank_account_ref", "text", {
            codecRef: { codecId: "pg/text@1" },
          }),
          col("base_price_cents", "int4", {
            notNull: true,
            codecRef: { codecId: "pg/int4@1" },
          }),
          col("created_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("currency", "text", {
            notNull: true,
            default: lit("PKR"),
            codecRef: { codecId: "pg/text@1" },
          }),
          col("id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("licence_number", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("operating_days", "int4[]", {
            notNull: true,
            codecRef: { codecId: "pg/int4@1", many: true },
          }),
          col("plate_number", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("route_polyline", "geometry(Geometry,4326)", {
            codecRef: { codecId: "pg/geometry@1", typeParams: { srid: 4326 } },
          }),
          col("seat_capacity", "int4", {
            notNull: true,
            codecRef: { codecId: "pg/int4@1" },
          }),
          col("status", "text", {
            notNull: true,
            default: lit("PENDING"),
            codecRef: { codecId: "pg/text@1" },
          }),
          col("stripe_account_id", "text", {
            codecRef: { codecId: "pg/text@1" },
          }),
          col("typical_departure_time", "timestamptz", {
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("updated_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("user_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("vehicle_colour", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("vehicle_make", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("vehicle_model", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("vehicle_year", "int4", {
            notNull: true,
            codecRef: { codecId: "pg/int4@1" },
          }),
          col("verification_tier", "text", {
            notNull: true,
            default: lit("BASIC"),
            codecRef: { codecId: "pg/text@1" },
          }),
        ],
        constraints: [
          primaryKey(["id"]),
          checkExpression(
            "driver_profiles_operating_days_elem_not_null_aabaf665",
            'array_position("operating_days", NULL) IS NULL',
          ),
          checkExpression(
            "driver_profiles_status_check_c3bdbb3f",
            "\"status\" IN ('PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED')",
          ),
          checkExpression(
            "driver_profiles_verification_tier_check_7da11074",
            "\"verification_tier\" IN ('BASIC', 'ENHANCED', 'ELITE')",
          ),
        ],
      }),
      this.createTable({
        schema: "public",
        table: "driver_schedule_slots",
        columns: [
          col("driver_profile_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("operating_days", "int4[]", {
            notNull: true,
            codecRef: { codecId: "pg/int4@1", many: true },
          }),
          col("pickup_order", "int4", {
            notNull: true,
            codecRef: { codecId: "pg/int4@1" },
          }),
          col("slot_end", "timestamptz", {
            notNull: true,
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("slot_start", "timestamptz", {
            notNull: true,
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("subscription_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
        ],
        constraints: [
          primaryKey(["id"]),
          checkExpression(
            "driver_schedule_slots_operating_days_elem_not_null_aabaf665",
            'array_position("operating_days", NULL) IS NULL',
          ),
        ],
      }),
      this.createTable({
        schema: "public",
        table: "idempotency_keys",
        columns: [
          col("created_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("expires_at", "timestamptz", {
            notNull: true,
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("key", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("request_hash", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("response", "json", { codecRef: { codecId: "pg/json@1" } }),
          col("state", "text", {
            notNull: true,
            default: lit("in_progress"),
            codecRef: { codecId: "pg/text@1" },
          }),
        ],
        constraints: [primaryKey(["key"])],
      }),
      this.createTable({
        schema: "public",
        table: "location_logs",
        columns: [
          col("driver_profile_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("ended_at", "timestamptz", {
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("points", "json", {
            notNull: true,
            default: lit("[]"),
            codecRef: { codecId: "pg/json@1" },
          }),
          col("started_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("trip_id", "text", { codecRef: { codecId: "pg/text@1" } }),
        ],
        constraints: [primaryKey(["id"])],
      }),
      this.createTable({
        schema: "public",
        table: "messages",
        columns: [
          col("body", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("read_at", "timestamptz", {
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("sender_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("sent_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("subscription_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
        ],
        constraints: [primaryKey(["id"])],
      }),
      this.createTable({
        schema: "public",
        table: "notifications",
        columns: [
          col("body", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("created_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("data", "json", {
            notNull: true,
            default: lit("{}"),
            codecRef: { codecId: "pg/json@1" },
          }),
          col("id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("is_read", "bool", {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: "pg/bool@1" },
          }),
          col("title", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("type", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("user_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
        ],
        constraints: [primaryKey(["id"])],
      }),
      this.createTable({
        schema: "public",
        table: "payment_methods",
        columns: [
          col("created_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("gateway", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("gateway_customer_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("gateway_payment_method_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("is_default", "bool", {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: "pg/bool@1" },
          }),
          col("user_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
        ],
        constraints: [primaryKey(["id"])],
      }),
      this.createTable({
        schema: "public",
        table: "payments",
        columns: [
          col("amount_cents", "int4", {
            notNull: true,
            codecRef: { codecId: "pg/int4@1" },
          }),
          col("billing_date", "timestamptz", {
            notNull: true,
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("created_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("currency", "text", {
            notNull: true,
            default: lit("PKR"),
            codecRef: { codecId: "pg/text@1" },
          }),
          col("failure_reason", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("idempotency_key", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("receipt_url", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("retry_count", "int4", {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: "pg/int4@1" },
          }),
          col("status", "text", {
            notNull: true,
            default: lit("PENDING"),
            codecRef: { codecId: "pg/text@1" },
          }),
          col("stripe_payment_intent_id", "text", {
            codecRef: { codecId: "pg/text@1" },
          }),
          col("subscription_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("updated_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
        ],
        constraints: [
          primaryKey(["id"]),
          checkExpression(
            "payments_status_check_218a9bc3",
            "\"status\" IN ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED')",
          ),
        ],
      }),
      this.createTable({
        schema: "public",
        table: "refresh_tokens",
        columns: [
          col("created_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("expires_at", "timestamptz", {
            notNull: true,
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("revoked_at", "timestamptz", {
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("token_hash", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("user_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
        ],
        constraints: [primaryKey(["id"])],
      }),
      this.createTable({
        schema: "public",
        table: "reviews",
        columns: [
          col("author_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("comment", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("created_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("rating", "int4", {
            notNull: true,
            codecRef: { codecId: "pg/int4@1" },
          }),
          col("subscription_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("target_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
        ],
        constraints: [primaryKey(["id"])],
      }),
      this.createTable({
        schema: "public",
        table: "riders",
        columns: [
          col("consumer_profile_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("created_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("dest_address_text", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("dest_location", "geometry(Geometry,4326)", {
            codecRef: { codecId: "pg/geometry@1", typeParams: { srid: 4326 } },
          }),
          col("home_address_text", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("home_location", "geometry(Geometry,4326)", {
            codecRef: { codecId: "pg/geometry@1", typeParams: { srid: 4326 } },
          }),
          col("id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("name", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("notes", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("photo_url", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("updated_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
        ],
        constraints: [primaryKey(["id"])],
      }),
      this.createTable({
        schema: "public",
        table: "subscriptions",
        columns: [
          col("agreed_dropoff_location", "geometry(Geometry,4326)", {
            codecRef: { codecId: "pg/geometry@1", typeParams: { srid: 4326 } },
          }),
          col("agreed_dropoff_time", "timestamptz", {
            notNull: true,
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("agreed_pickup_location", "geometry(Geometry,4326)", {
            codecRef: { codecId: "pg/geometry@1", typeParams: { srid: 4326 } },
          }),
          col("agreed_pickup_time", "timestamptz", {
            notNull: true,
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("cancellation_reason", "text", {
            codecRef: { codecId: "pg/text@1" },
          }),
          col("created_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("currency", "text", {
            notNull: true,
            default: lit("PKR"),
            codecRef: { codecId: "pg/text@1" },
          }),
          col("driver_profile_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("dropoff_address_text", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("monthly_price_cents", "int4", {
            notNull: true,
            codecRef: { codecId: "pg/int4@1" },
          }),
          col("next_billing_date", "timestamptz", {
            notNull: true,
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("pickup_address_text", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("rider_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("start_date", "timestamptz", {
            notNull: true,
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("status", "text", {
            notNull: true,
            default: lit("PENDING"),
            codecRef: { codecId: "pg/text@1" },
          }),
          col("stripe_subscription_id", "text", {
            codecRef: { codecId: "pg/text@1" },
          }),
          col("type", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("updated_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
        ],
        constraints: [
          primaryKey(["id"]),
          checkExpression(
            "subscriptions_status_check_e7881352",
            "\"status\" IN ('PENDING', 'ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED')",
          ),
          checkExpression(
            "subscriptions_type_check_d04a7056",
            "\"type\" IN ('MORNING', 'AFTERNOON', 'ROUND_TRIP')",
          ),
        ],
      }),
      this.createTable({
        schema: "public",
        table: "support_tickets",
        columns: [
          col("body", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("created_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("resolved_at", "timestamptz", {
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("status", "text", {
            notNull: true,
            default: lit("OPEN"),
            codecRef: { codecId: "pg/text@1" },
          }),
          col("subject", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("trip_id", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("user_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
        ],
        constraints: [primaryKey(["id"])],
      }),
      this.createTable({
        schema: "public",
        table: "trips",
        columns: [
          col("actual_dropoff_at", "timestamptz", {
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("actual_pickup_at", "timestamptz", {
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("created_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("deviation_alert_sent", "bool", {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: "pg/bool@1" },
          }),
          col("driver_profile_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("location_log_id", "text", {
            codecRef: { codecId: "pg/text@1" },
          }),
          col("scheduled_date", "timestamptz", {
            notNull: true,
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("status", "text", {
            notNull: true,
            default: lit("SCHEDULED"),
            codecRef: { codecId: "pg/text@1" },
          }),
          col("subscription_id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("type", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("updated_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
        ],
        constraints: [
          primaryKey(["id"]),
          checkExpression(
            "trips_status_check_0612f31f",
            "\"status\" IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'MISSED', 'CANCELLED')",
          ),
          checkExpression(
            "trips_type_check_4f232f02",
            "\"type\" IN ('MORNING', 'AFTERNOON')",
          ),
        ],
      }),
      this.createTable({
        schema: "public",
        table: "users",
        columns: [
          col("created_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("deleted_at", "timestamptz", {
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
          col("email", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("fcm_token", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("full_name", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("id", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("password_hash", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("phone", "text", {
            notNull: true,
            codecRef: { codecId: "pg/text@1" },
          }),
          col("preferred_language", "text", {
            notNull: true,
            default: lit("en"),
            codecRef: { codecId: "pg/text@1" },
          }),
          col("profile_photo_url", "text", {
            codecRef: { codecId: "pg/text@1" },
          }),
          col("role", "text", {
            notNull: true,
            default: lit("CONSUMER"),
            codecRef: { codecId: "pg/text@1" },
          }),
          col("status", "text", {
            notNull: true,
            default: lit("PENDING_VERIFICATION"),
            codecRef: { codecId: "pg/text@1" },
          }),
          col("updated_at", "timestamptz", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamptz-temporal@1" },
          }),
        ],
        constraints: [
          primaryKey(["id"]),
          checkExpression(
            "users_role_check_a8c41acf",
            "\"role\" IN ('CONSUMER', 'DRIVER', 'ADMIN', 'INSTITUTION_ADMIN', 'FLEET_ADMIN')",
          ),
          checkExpression(
            "users_status_check_50333e84",
            "\"status\" IN ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DELETED')",
          ),
        ],
      }),
      this.addUnique({
        schema: "public",
        table: "consumer_profiles",
        constraint: "consumer_profiles_user_id_key",
        columns: ["user_id"],
      }),
      this.addUnique({
        schema: "public",
        table: "driver_profiles",
        constraint: "driver_profiles_user_id_key",
        columns: ["user_id"],
      }),
      this.addUnique({
        schema: "public",
        table: "driver_profiles",
        constraint: "driver_profiles_plate_number_key",
        columns: ["plate_number"],
      }),
      this.addUnique({
        schema: "public",
        table: "driver_schedule_slots",
        constraint:
          "driver_schedule_slots_driver_profile_id_subscription_id_key",
        columns: ["driver_profile_id", "subscription_id"],
      }),
      this.addUnique({
        schema: "public",
        table: "payments",
        constraint: "payments_stripe_payment_intent_id_key",
        columns: ["stripe_payment_intent_id"],
      }),
      this.addUnique({
        schema: "public",
        table: "payments",
        constraint: "payments_idempotency_key_key",
        columns: ["idempotency_key"],
      }),
      this.addUnique({
        schema: "public",
        table: "refresh_tokens",
        constraint: "refresh_tokens_token_hash_key",
        columns: ["token_hash"],
      }),
      this.addUnique({
        schema: "public",
        table: "reviews",
        constraint: "reviews_subscription_id_author_id_key",
        columns: ["subscription_id", "author_id"],
      }),
      this.addUnique({
        schema: "public",
        table: "trips",
        constraint: "idx_trips_sub_date",
        columns: ["subscription_id", "scheduled_date", "type"],
      }),
      this.createIndex({
        schema: "public",
        table: "audit_log",
        index: "audit_log_actor_id_idx_69a2164d",
        columns: ["actor_id"],
      }),
      this.createIndex({
        schema: "public",
        table: "audit_log",
        index: "idx_audit_entity",
        columns: ["entity_type", "entity_id"],
      }),
      this.createIndex({
        schema: "public",
        table: "driver_documents",
        index: "driver_documents_driver_id_idx_56c848ae",
        columns: ["driver_id"],
      }),
      this.createIndex({
        schema: "public",
        table: "driver_documents",
        index: "driver_documents_verified_by_idx_f6af2456",
        columns: ["verified_by"],
      }),
      this.createIndex({
        schema: "public",
        table: "driver_payouts",
        index: "driver_payouts_driver_profile_id_idx_bbd11be7",
        columns: ["driver_profile_id"],
      }),
      this.createIndex({
        schema: "public",
        table: "driver_profiles",
        index: "idx_dp_status",
        columns: ["status"],
      }),
      this.createIndex({
        schema: "public",
        table: "driver_schedule_slots",
        index: "driver_schedule_slots_driver_profile_id_idx_bbd11be7",
        columns: ["driver_profile_id"],
      }),
      this.createIndex({
        schema: "public",
        table: "driver_schedule_slots",
        index: "driver_schedule_slots_subscription_id_idx_1e74615f",
        columns: ["subscription_id"],
      }),
      this.createIndex({
        schema: "public",
        table: "driver_schedule_slots",
        index: "idx_dss_driver_days",
        columns: ["driver_profile_id", "operating_days"],
      }),
      this.createIndex({
        schema: "public",
        table: "idempotency_keys",
        index: "idx_idempotency_expires",
        columns: ["expires_at"],
      }),
      this.createIndex({
        schema: "public",
        table: "location_logs",
        index: "location_logs_driver_profile_id_idx_bbd11be7",
        columns: ["driver_profile_id"],
      }),
      this.createIndex({
        schema: "public",
        table: "messages",
        index: "idx_messages_sub",
        columns: ["subscription_id", "sent_at"],
      }),
      this.createIndex({
        schema: "public",
        table: "messages",
        index: "messages_sender_id_idx_311853a4",
        columns: ["sender_id"],
      }),
      this.createIndex({
        schema: "public",
        table: "messages",
        index: "messages_subscription_id_idx_1e74615f",
        columns: ["subscription_id"],
      }),
      this.createIndex({
        schema: "public",
        table: "notifications",
        index: "idx_notifications_user_unread",
        columns: ["user_id", "is_read"],
      }),
      this.createIndex({
        schema: "public",
        table: "notifications",
        index: "notifications_user_id_idx_6c952402",
        columns: ["user_id"],
      }),
      this.createIndex({
        schema: "public",
        table: "payments",
        index: "idx_payments_idempotency",
        columns: ["idempotency_key"],
      }),
      this.createIndex({
        schema: "public",
        table: "payments",
        index: "idx_payments_sub",
        columns: ["subscription_id"],
      }),
      this.createIndex({
        schema: "public",
        table: "reviews",
        index: "reviews_author_id_idx_f3862461",
        columns: ["author_id"],
      }),
      this.createIndex({
        schema: "public",
        table: "reviews",
        index: "reviews_subscription_id_idx_1e74615f",
        columns: ["subscription_id"],
      }),
      this.createIndex({
        schema: "public",
        table: "reviews",
        index: "reviews_target_id_idx_7e52b3aa",
        columns: ["target_id"],
      }),
      this.createIndex({
        schema: "public",
        table: "riders",
        index: "riders_consumer_profile_id_idx_453ed188",
        columns: ["consumer_profile_id"],
      }),
      this.createIndex({
        schema: "public",
        table: "subscriptions",
        index: "idx_subs_driver_status",
        columns: ["driver_profile_id", "status"],
      }),
      this.createIndex({
        schema: "public",
        table: "subscriptions",
        index: "idx_subs_rider",
        columns: ["rider_id"],
      }),
      this.createIndex({
        schema: "public",
        table: "subscriptions",
        index: "subscriptions_driver_profile_id_idx_bbd11be7",
        columns: ["driver_profile_id"],
      }),
      this.createIndex({
        schema: "public",
        table: "trips",
        index: "idx_trips_status_date",
        columns: ["status", "scheduled_date"],
      }),
      this.createIndex({
        schema: "public",
        table: "trips",
        index: "trips_driver_profile_id_idx_bbd11be7",
        columns: ["driver_profile_id"],
      }),
      this.createIndex({
        schema: "public",
        table: "trips",
        index: "trips_location_log_id_idx_65a8b0e1",
        columns: ["location_log_id"],
      }),
      this.createIndex({
        schema: "public",
        table: "trips",
        index: "trips_subscription_id_idx_1e74615f",
        columns: ["subscription_id"],
      }),
      this.createIndex({
        schema: "public",
        table: "users",
        index: "idx_users_email",
        columns: ["email"],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: "public",
        table: "users",
        index: "idx_users_phone",
        columns: ["phone"],
        extras: { unique: true },
      }),
      this.addForeignKey({
        schema: "public",
        table: "audit_log",
        foreignKey: {
          name: "audit_log_actor_id_fkey",
          columns: ["actor_id"],
          references: { schema: "public", table: "users", columns: ["id"] },
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "consumer_profiles",
        foreignKey: {
          name: "consumer_profiles_user_id_fkey",
          columns: ["user_id"],
          references: { schema: "public", table: "users", columns: ["id"] },
          onDelete: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "driver_documents",
        foreignKey: {
          name: "driver_documents_driver_id_fkey",
          columns: ["driver_id"],
          references: {
            schema: "public",
            table: "driver_profiles",
            columns: ["id"],
          },
          onDelete: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "driver_documents",
        foreignKey: {
          name: "driver_documents_verified_by_fkey",
          columns: ["verified_by"],
          references: { schema: "public", table: "users", columns: ["id"] },
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "driver_payouts",
        foreignKey: {
          name: "driver_payouts_driver_profile_id_fkey",
          columns: ["driver_profile_id"],
          references: {
            schema: "public",
            table: "driver_profiles",
            columns: ["id"],
          },
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "driver_profiles",
        foreignKey: {
          name: "driver_profiles_user_id_fkey",
          columns: ["user_id"],
          references: { schema: "public", table: "users", columns: ["id"] },
          onDelete: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "driver_schedule_slots",
        foreignKey: {
          name: "driver_schedule_slots_driver_profile_id_fkey",
          columns: ["driver_profile_id"],
          references: {
            schema: "public",
            table: "driver_profiles",
            columns: ["id"],
          },
          onDelete: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "driver_schedule_slots",
        foreignKey: {
          name: "driver_schedule_slots_subscription_id_fkey",
          columns: ["subscription_id"],
          references: {
            schema: "public",
            table: "subscriptions",
            columns: ["id"],
          },
          onDelete: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "location_logs",
        foreignKey: {
          name: "location_logs_driver_profile_id_fkey",
          columns: ["driver_profile_id"],
          references: {
            schema: "public",
            table: "driver_profiles",
            columns: ["id"],
          },
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "messages",
        foreignKey: {
          name: "messages_subscription_id_fkey",
          columns: ["subscription_id"],
          references: {
            schema: "public",
            table: "subscriptions",
            columns: ["id"],
          },
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "messages",
        foreignKey: {
          name: "messages_sender_id_fkey",
          columns: ["sender_id"],
          references: { schema: "public", table: "users", columns: ["id"] },
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "notifications",
        foreignKey: {
          name: "notifications_user_id_fkey",
          columns: ["user_id"],
          references: { schema: "public", table: "users", columns: ["id"] },
          onDelete: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "payments",
        foreignKey: {
          name: "payments_subscription_id_fkey",
          columns: ["subscription_id"],
          references: {
            schema: "public",
            table: "subscriptions",
            columns: ["id"],
          },
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "reviews",
        foreignKey: {
          name: "reviews_subscription_id_fkey",
          columns: ["subscription_id"],
          references: {
            schema: "public",
            table: "subscriptions",
            columns: ["id"],
          },
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "reviews",
        foreignKey: {
          name: "reviews_author_id_fkey",
          columns: ["author_id"],
          references: { schema: "public", table: "users", columns: ["id"] },
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "reviews",
        foreignKey: {
          name: "reviews_target_id_fkey",
          columns: ["target_id"],
          references: { schema: "public", table: "users", columns: ["id"] },
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "riders",
        foreignKey: {
          name: "riders_consumer_profile_id_fkey",
          columns: ["consumer_profile_id"],
          references: {
            schema: "public",
            table: "consumer_profiles",
            columns: ["id"],
          },
          onDelete: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "subscriptions",
        foreignKey: {
          name: "subscriptions_rider_id_fkey",
          columns: ["rider_id"],
          references: { schema: "public", table: "riders", columns: ["id"] },
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "subscriptions",
        foreignKey: {
          name: "subscriptions_driver_profile_id_fkey",
          columns: ["driver_profile_id"],
          references: {
            schema: "public",
            table: "driver_profiles",
            columns: ["id"],
          },
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "trips",
        foreignKey: {
          name: "trips_subscription_id_fkey",
          columns: ["subscription_id"],
          references: {
            schema: "public",
            table: "subscriptions",
            columns: ["id"],
          },
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "trips",
        foreignKey: {
          name: "trips_driver_profile_id_fkey",
          columns: ["driver_profile_id"],
          references: {
            schema: "public",
            table: "driver_profiles",
            columns: ["id"],
          },
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "trips",
        foreignKey: {
          name: "trips_location_log_id_fkey",
          columns: ["location_log_id"],
          references: {
            schema: "public",
            table: "location_logs",
            columns: ["id"],
          },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
