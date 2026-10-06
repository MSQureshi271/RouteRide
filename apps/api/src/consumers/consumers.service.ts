/**
 * ConsumersService — consumer profile and rider business logic (T0.41, T0.42).
 *
 * Rules:
 *  - Consumer profile is created on first GET (upsert pattern)
 *  - stripeCustomerId is NEVER returned in responses
 *  - emergencyContactPhone must be E.164 (enforced at boundary by Zod)
 *  - Riders belong to exactly one consumer; another consumer cannot access them
 *  - Deletion is blocked when an active subscription exists (409 ConflictException)
 *  - Address geocoding via GeocodeService; 422 on unresolvable, 503 on adapter failure
 *  - Maps API response is validated before use (never store untrusted data)
 */
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { GeocodeService } from "../maps/geocode.service.js";
import type {
  CreateRiderRequest,
  UpdateRiderRequest,
  ConsumerProfile,
  Rider,
  UpdateConsumerProfile,
} from "@routeride/contracts";

// ─── Raw DB row shapes ────────────────────────────────────────────────────────

interface ConsumerProfileRow {
  id: string;
  user_id: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  created_at: string | Date;
  updated_at: string | Date;
}

interface RiderRow {
  id: string;
  consumer_profile_id: string;
  name: string;
  photo_url: string | null;
  home_address_text: string;
  dest_address_text: string;
  notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function rowToProfile(row: ConsumerProfileRow): ConsumerProfile {
  return {
    id: row.id,
    userId: row.user_id,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactPhone: row.emergency_contact_phone,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function rowToRider(row: RiderRow): Rider {
  return {
    id: row.id,
    consumerProfileId: row.consumer_profile_id,
    name: row.name,
    photoUrl: row.photo_url ?? null,
    homeAddressText: row.home_address_text,
    destAddressText: row.dest_address_text,
    notes: row.notes ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ConsumersService {
  private readonly logger = new Logger(ConsumersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocode: GeocodeService,
  ) {}

  // ── T0.41: Get or create profile ──────────────────────────────────────────

  async getOrCreateProfile(userId: string): Promise<ConsumerProfile> {
    const rows = (await this.prisma.sql`
      INSERT INTO consumer_profiles (user_id, emergency_contact_name, emergency_contact_phone)
      VALUES (${userId}, '', '')
      ON CONFLICT (user_id) DO UPDATE
        SET updated_at = consumer_profiles.updated_at -- no-op update to trigger RETURNING
      RETURNING id, user_id, emergency_contact_name, emergency_contact_phone, created_at, updated_at
    `) as unknown as ConsumerProfileRow[];

    return rowToProfile(rows[0]!);
  }

  // ── T0.41: Update profile ─────────────────────────────────────────────────

  async updateProfile(
    userId: string,
    dto: UpdateConsumerProfile,
  ): Promise<ConsumerProfile> {
    const rows = (await this.prisma.sql`
      UPDATE consumer_profiles
      SET
        emergency_contact_name = COALESCE(
          ${dto.emergencyContactName ?? null},
          emergency_contact_name
        ),
        emergency_contact_phone = COALESCE(
          ${dto.emergencyContactPhone ?? null},
          emergency_contact_phone
        ),
        updated_at = NOW()
      WHERE user_id = ${userId}
      RETURNING id, user_id, emergency_contact_name, emergency_contact_phone, created_at, updated_at
    `) as unknown as ConsumerProfileRow[];

    if (rows.length === 0) {
      throw new NotFoundException("Consumer profile not found");
    }

    return rowToProfile(rows[0]!);
  }

  // ── T0.42: Get consumer profile id (internal helper) ──────────────────────

  private async getProfileId(userId: string): Promise<string> {
    const profile = await this.getOrCreateProfile(userId);
    return profile.id;
  }

  // ── T0.42: List riders ────────────────────────────────────────────────────

  async listRiders(userId: string): Promise<Rider[]> {
    const profileId = await this.getProfileId(userId);
    const rows = (await this.prisma.sql`
      SELECT id, consumer_profile_id, name, photo_url, home_address_text,
             dest_address_text, notes, created_at, updated_at
      FROM riders
      WHERE consumer_profile_id = ${profileId}
      ORDER BY created_at ASC
    `) as unknown as RiderRow[];

    return rows.map(rowToRider);
  }

  // ── T0.42: Create rider ───────────────────────────────────────────────────

  async createRider(userId: string, dto: CreateRiderRequest): Promise<Rider> {
    const profileId = await this.getProfileId(userId);

    // Geocode both addresses (throws 422 / 503 on failure)
    const [homeCoords, destCoords] = await Promise.all([
      this.geocode.geocodeAddress(dto.homeAddressText),
      this.geocode.geocodeAddress(dto.destAddressText),
    ]);

    const homeGeoJson = JSON.stringify({
      type: "Point",
      coordinates: [homeCoords.lng, homeCoords.lat],
    });
    const destGeoJson = JSON.stringify({
      type: "Point",
      coordinates: [destCoords.lng, destCoords.lat],
    });

    const rows = (await this.prisma.sql`
      INSERT INTO riders (
        consumer_profile_id, name, home_address_text, home_location,
        dest_address_text, dest_location, notes
      )
      VALUES (
        ${profileId},
        ${dto.name},
        ${dto.homeAddressText},
        ST_SetSRID(ST_GeomFromGeoJSON(${homeGeoJson}), 4326),
        ${dto.destAddressText},
        ST_SetSRID(ST_GeomFromGeoJSON(${destGeoJson}), 4326),
        ${dto.notes ?? null}
      )
      RETURNING id, consumer_profile_id, name, photo_url, home_address_text,
                dest_address_text, notes, created_at, updated_at
    `) as unknown as RiderRow[];

    this.logger.log({
      event: "consumer.rider_created",
      userId,
      riderId: rows[0]!.id,
    });

    return rowToRider(rows[0]!);
  }

  // ── T0.42: Update rider ───────────────────────────────────────────────────

  async updateRider(
    userId: string,
    riderId: string,
    dto: UpdateRiderRequest,
  ): Promise<Rider> {
    // Ownership check — fetch by id AND consumer profile
    const profileId = await this.getProfileId(userId);
    const existing = (await this.prisma.sql`
      SELECT id FROM riders WHERE id = ${riderId} AND consumer_profile_id = ${profileId} LIMIT 1
    `) as unknown as { id: string }[];

    if (existing.length === 0) {
      throw new NotFoundException("Rider not found");
    }

    // Re-geocode if addresses changed
    let homeGeoJson: string | null = null;
    let destGeoJson: string | null = null;

    if (dto.homeAddressText) {
      const coords = await this.geocode.geocodeAddress(dto.homeAddressText);
      homeGeoJson = JSON.stringify({
        type: "Point",
        coordinates: [coords.lng, coords.lat],
      });
    }
    if (dto.destAddressText) {
      const coords = await this.geocode.geocodeAddress(dto.destAddressText);
      destGeoJson = JSON.stringify({
        type: "Point",
        coordinates: [coords.lng, coords.lat],
      });
    }

    const rows = (await this.prisma.sql`
      UPDATE riders
      SET
        name = COALESCE(${dto.name ?? null}, name),
        home_address_text = COALESCE(${dto.homeAddressText ?? null}, home_address_text),
        home_location = CASE
          WHEN ${homeGeoJson} IS NOT NULL
          THEN ST_SetSRID(ST_GeomFromGeoJSON(${homeGeoJson}), 4326)
          ELSE home_location
        END,
        dest_address_text = COALESCE(${dto.destAddressText ?? null}, dest_address_text),
        dest_location = CASE
          WHEN ${destGeoJson} IS NOT NULL
          THEN ST_SetSRID(ST_GeomFromGeoJSON(${destGeoJson}), 4326)
          ELSE dest_location
        END,
        notes = COALESCE(${dto.notes ?? null}, notes),
        updated_at = NOW()
      WHERE id = ${riderId} AND consumer_profile_id = ${profileId}
      RETURNING id, consumer_profile_id, name, photo_url, home_address_text,
                dest_address_text, notes, created_at, updated_at
    `) as unknown as RiderRow[];

    return rowToRider(rows[0]!);
  }

  // ── T0.42: Delete rider ───────────────────────────────────────────────────

  async deleteRider(userId: string, riderId: string): Promise<void> {
    const profileId = await this.getProfileId(userId);

    // Ownership check
    const existing = (await this.prisma.sql`
      SELECT id FROM riders WHERE id = ${riderId} AND consumer_profile_id = ${profileId} LIMIT 1
    `) as unknown as { id: string }[];

    if (existing.length === 0) {
      throw new NotFoundException("Rider not found");
    }

    // Block deletion if active subscription exists
    const activeSubRows = (await this.prisma.sql`
      SELECT COUNT(*) AS cnt
      FROM subscriptions
      WHERE rider_id = ${riderId} AND status = 'ACTIVE'
    `) as unknown as { cnt: string }[];

    if (parseInt(activeSubRows[0]?.cnt ?? "0", 10) > 0) {
      throw new ConflictException(
        "Cannot delete a rider that has an active subscription",
      );
    }

    await this.prisma.sql`
      DELETE FROM riders WHERE id = ${riderId} AND consumer_profile_id = ${profileId}
    `;

    this.logger.log({ event: "consumer.rider_deleted", userId, riderId });
  }
}
