/**
 * Deterministic database seed script for RouteRide (Prisma 8).
 *
 * Seeds:
 *  - 15 drivers (12 approved with realistic Karachi polylines, 3 pending)
 *  - 8 consumers with emergency contacts
 *  - 14 riders with home and destination locations
 *  - Mix of active, pending, and cancelled subscriptions
 *
 * Rules:
 *  - Fully idempotent (upserts on fixed UUIDs)
 *  - Uses ST_GeomFromText for GEOGRAPHY columns (ADR-002)
 *
 * Run:
 *  pnpm --filter @routeride/api seed
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../src/prisma/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const UserRole = {
  CONSUMER: "CONSUMER",
  DRIVER: "DRIVER",
  ADMIN: "ADMIN",
  INSTITUTION_ADMIN: "INSTITUTION_ADMIN",
  FLEET_ADMIN: "FLEET_ADMIN",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  DELETED: "DELETED",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const DriverStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  SUSPENDED: "SUSPENDED",
  REJECTED: "REJECTED",
} as const;
export type DriverStatus = (typeof DriverStatus)[keyof typeof DriverStatus];

export const VerifyTier = {
  BASIC: "BASIC",
  ENHANCED: "ENHANCED",
  ELITE: "ELITE",
} as const;
export type VerifyTier = (typeof VerifyTier)[keyof typeof VerifyTier];

export const SubType = {
  MORNING: "MORNING",
  AFTERNOON: "AFTERNOON",
  ROUND_TRIP: "ROUND_TRIP",
} as const;
export type SubType = (typeof SubType)[keyof typeof SubType];

export const SubStatus = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
} as const;
export type SubStatus = (typeof SubStatus)[keyof typeof SubStatus];

interface DriverFixture {
  id: string;
  userId: string;
  phone: string;
  fullName: string;
  licenceNumber: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleColour: string;
  plateNumber: string;
  seatCapacity: number;
  operatingDays: number[];
  basePriceCents: number;
  status: DriverStatus;
  verificationTier: VerifyTier;
  routePolyline: string;
}

interface ConsumerFixture {
  id: string;
  userId: string;
  phone: string;
  fullName: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
}

interface RiderFixture {
  id: string;
  consumerProfileId: string;
  name: string;
  homeAddressText: string;
  homeLocation: string;
  destAddressText: string;
  destLocation: string;
  notes?: string;
}

interface SubscriptionFixture {
  id: string;
  riderId: string;
  driverProfileId: string;
  type: SubType;
  agreedPickupTime: string;
  agreedDropoffTime: string;
  agreedPickupLocation: string;
  agreedDropoffLocation: string;
  pickupAddressText: string;
  dropoffAddressText: string;
  monthlyPriceCents: number;
  currency: string;
  status: SubStatus;
  startDate: string;
  nextBillingDate: string;
}

async function main(): Promise<void> {
  process.stdout.write("🌱 Starting deterministic seed (Prisma 8)...\n");

  const driversJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures/drivers.json"), "utf-8"),
  ) as DriverFixture[];

  const consumersJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures/consumers.json"), "utf-8"),
  ) as ConsumerFixture[];

  const ridersJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures/riders.json"), "utf-8"),
  ) as RiderFixture[];

  const subsJson = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "fixtures/subscriptions.json"),
      "utf-8",
    ),
  ) as SubscriptionFixture[];

  // 1. Seed Drivers & Driver Users
  for (const d of driversJson) {
    await db.sql`
      INSERT INTO users (id, phone, full_name, role, status)
      VALUES (${d.userId}::uuid, ${d.phone}, ${d.fullName}, ${UserRole.DRIVER}::user_role, ${UserStatus.ACTIVE}::user_status)
      ON CONFLICT (id) DO UPDATE
      SET phone = EXCLUDED.phone, full_name = EXCLUDED.full_name, role = EXCLUDED.role, status = EXCLUDED.status;
    `;

    await db.sql`
      INSERT INTO driver_profiles (
        id, user_id, licence_number, vehicle_make, vehicle_model, vehicle_year, vehicle_colour,
        plate_number, seat_capacity, operating_days, base_price_cents, status, verification_tier, route_polyline
      ) VALUES (
        ${d.id}::uuid, ${d.userId}::uuid, ${d.licenceNumber}, ${d.vehicleMake}, ${d.vehicleModel}, ${d.vehicleYear}, ${d.vehicleColour},
        ${d.plateNumber}, ${d.seatCapacity}, ${d.operatingDays}, ${d.basePriceCents}, ${d.status}::driver_status, ${d.verificationTier}::verify_tier,
        ST_GeomFromText(${d.routePolyline}, 4326)::geography
      ) ON CONFLICT (id) DO UPDATE
      SET licence_number = EXCLUDED.licence_number, vehicle_make = EXCLUDED.vehicle_make,
          vehicle_model = EXCLUDED.vehicle_model, vehicle_year = EXCLUDED.vehicle_year,
          vehicle_colour = EXCLUDED.vehicle_colour, plate_number = EXCLUDED.plate_number,
          seat_capacity = EXCLUDED.seat_capacity, operating_days = EXCLUDED.operating_days,
          base_price_cents = EXCLUDED.base_price_cents, status = EXCLUDED.status,
          verification_tier = EXCLUDED.verification_tier, route_polyline = EXCLUDED.route_polyline;
    `;
  }
  process.stdout.write(
    `✅ Seeded ${driversJson.length} drivers with PostGIS polylines\n`,
  );

  // 2. Seed Consumers
  for (const c of consumersJson) {
    await db.sql`
      INSERT INTO users (id, phone, full_name, role, status)
      VALUES (${c.userId}::uuid, ${c.phone}, ${c.fullName}, ${UserRole.CONSUMER}::user_role, ${UserStatus.ACTIVE}::user_status)
      ON CONFLICT (id) DO UPDATE
      SET phone = EXCLUDED.phone, full_name = EXCLUDED.full_name, role = EXCLUDED.role, status = EXCLUDED.status;
    `;

    await db.sql`
      INSERT INTO consumer_profiles (id, user_id, emergency_contact_name, emergency_contact_phone)
      VALUES (${c.id}::uuid, ${c.userId}::uuid, ${c.emergencyContactName}, ${c.emergencyContactPhone})
      ON CONFLICT (id) DO UPDATE
      SET emergency_contact_name = EXCLUDED.emergency_contact_name,
          emergency_contact_phone = EXCLUDED.emergency_contact_phone;
    `;
  }
  process.stdout.write(`✅ Seeded ${consumersJson.length} consumers\n`);

  // 3. Seed Riders
  for (const r of ridersJson) {
    await db.sql`
      INSERT INTO riders (id, consumer_profile_id, name, home_address_text, home_location, dest_address_text, dest_location, notes)
      VALUES (
        ${r.id}::uuid, ${r.consumerProfileId}::uuid, ${r.name}, ${r.homeAddressText},
        ST_GeomFromText(${r.homeLocation}, 4326)::geography,
        ${r.destAddressText},
        ST_GeomFromText(${r.destLocation}, 4326)::geography,
        ${r.notes ?? null}
      ) ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, home_address_text = EXCLUDED.home_address_text,
          home_location = EXCLUDED.home_location, dest_address_text = EXCLUDED.dest_address_text,
          dest_location = EXCLUDED.dest_location, notes = EXCLUDED.notes;
    `;
  }
  process.stdout.write(
    `✅ Seeded ${ridersJson.length} riders with PostGIS points\n`,
  );

  // 4. Seed Subscriptions
  for (const s of subsJson) {
    await db.sql`
      INSERT INTO subscriptions (
        id, rider_id, driver_profile_id, type, agreed_pickup_time, agreed_dropoff_time,
        agreed_pickup_location, agreed_dropoff_location, pickup_address_text, dropoff_address_text,
        monthly_price_cents, currency, status, start_date, next_billing_date
      ) VALUES (
        ${s.id}::uuid, ${s.riderId}::uuid, ${s.driverProfileId}::uuid, ${s.type}::sub_type,
        ${s.agreedPickupTime}::time, ${s.agreedDropoffTime}::time,
        ST_GeomFromText(${s.agreedPickupLocation}, 4326)::geography,
        ST_GeomFromText(${s.agreedDropoffLocation}, 4326)::geography,
        ${s.pickupAddressText}, ${s.dropoffAddressText}, ${s.monthlyPriceCents},
        ${s.currency}, ${s.status}::sub_status, ${s.startDate}::date, ${s.nextBillingDate}::date
      ) ON CONFLICT (id) DO UPDATE
      SET type = EXCLUDED.type, agreed_pickup_time = EXCLUDED.agreed_pickup_time,
          agreed_dropoff_time = EXCLUDED.agreed_dropoff_time, agreed_pickup_location = EXCLUDED.agreed_pickup_location,
          agreed_dropoff_location = EXCLUDED.agreed_dropoff_location, pickup_address_text = EXCLUDED.pickup_address_text,
          dropoff_address_text = EXCLUDED.dropoff_address_text, monthly_price_cents = EXCLUDED.monthly_price_cents,
          currency = EXCLUDED.currency, status = EXCLUDED.status, start_date = EXCLUDED.start_date,
          next_billing_date = EXCLUDED.next_billing_date;
    `;
  }
  process.stdout.write(`✅ Seeded ${subsJson.length} subscriptions\n`);
  process.stdout.write("🎉 Seed completed successfully!\n");
}

main()
  .catch((e) => {
    process.stderr.write(`❌ Seed error: ${String(e)}\n`);
    process.exit(1);
  })
  .finally(async () => {
    await db.close();
  });
