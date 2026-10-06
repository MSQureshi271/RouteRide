/**
 * Integration tests for T0.41 — Consumer Profile and Emergency Contact.
 *
 * Tests verify:
 *  - 200 getOrCreateProfile auto-creates profile on first access
 *  - 200 getOrCreateProfile returns existing profile on subsequent access
 *  - stripeCustomerId is NEVER returned in response
 *  - 200 updateProfile updates emergency contact name and phone
 *  - 400 schema rejects emergency contact phone not in E.164 format
 */
import { ConsumersService } from "../src/consumers/consumers.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { GeocodeService } from "../src/maps/geocode.service.js";
import { UpdateConsumerProfileSchema } from "@routeride/contracts";

const MOCK_PROFILE = {
  id: "00000000-0000-0000-0000-000000000002",
  user_id: "22222222-2222-2222-2222-222222222222",
  emergency_contact_name: "Fatima Khan",
  emergency_contact_phone: "+923009876543",
  stripe_customer_id: "cus_mock_stripe_123",
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
};

function makeMockPrisma(profileExists = false) {
  let profile = profileExists ? { ...MOCK_PROFILE } : null;

  return {
    sql: jest
      .fn()
      .mockImplementation(
        (strings: TemplateStringsArray, ...values: unknown[]) => {
          const query = strings.join(" ");

          if (
            query.includes("SELECT") &&
            query.includes("FROM consumer_profiles")
          ) {
            return Promise.resolve(profile ? [profile] : []);
          }

          if (query.includes("INSERT INTO consumer_profiles")) {
            if (!profile) {
              profile = {
                id: MOCK_PROFILE.id,
                user_id: values[0] as string,
                emergency_contact_name: "",
                emergency_contact_phone: "",
                stripe_customer_id: "cus_default",
                created_at: new Date("2026-01-01T00:00:00Z"),
                updated_at: new Date("2026-01-01T00:00:00Z"),
              };
            }
            return Promise.resolve([profile]);
          }

          if (query.includes("UPDATE consumer_profiles")) {
            if (profile) {
              profile = {
                ...profile,
                emergency_contact_name:
                  (values[0] as string) || profile.emergency_contact_name,
                emergency_contact_phone:
                  (values[1] as string) || profile.emergency_contact_phone,
                updated_at: new Date(),
              };
            }
            return Promise.resolve(profile ? [profile] : []);
          }

          return Promise.resolve([]);
        },
      ),
  } as unknown as PrismaService;
}

describe("Consumer Profile (T0.41)", () => {
  let geocodeMock: GeocodeService;

  beforeEach(() => {
    geocodeMock = {} as unknown as GeocodeService;
  });

  it("auto-creates consumer profile on first access", async () => {
    const prisma = makeMockPrisma(false);
    const service = new ConsumersService(prisma, geocodeMock);

    const profile = await service.getOrCreateProfile(MOCK_PROFILE.user_id);
    expect(profile.id).toBe(MOCK_PROFILE.id);
    expect(profile.userId).toBe(MOCK_PROFILE.user_id);
    expect(
      (profile as unknown as Record<string, unknown>)["stripeCustomerId"],
    ).toBeUndefined();
  });

  it("returns existing profile without modifying it on subsequent access", async () => {
    const prisma = makeMockPrisma(true);
    const service = new ConsumersService(prisma, geocodeMock);

    const profile = await service.getOrCreateProfile(MOCK_PROFILE.user_id);
    expect(profile.emergencyContactName).toBe(
      MOCK_PROFILE.emergency_contact_name,
    );
    expect(profile.emergencyContactPhone).toBe(
      MOCK_PROFILE.emergency_contact_phone,
    );
    expect(
      (profile as unknown as Record<string, unknown>)["stripeCustomerId"],
    ).toBeUndefined();
  });

  it("updates emergency contact info", async () => {
    const prisma = makeMockPrisma(true);
    const service = new ConsumersService(prisma, geocodeMock);

    const updated = await service.updateProfile(MOCK_PROFILE.user_id, {
      emergencyContactName: "Ali Khan",
      emergencyContactPhone: "+923001122334",
    });

    expect(updated.emergencyContactName).toBe("Ali Khan");
    expect(updated.emergencyContactPhone).toBe("+923001122334");
    expect(
      (updated as unknown as Record<string, unknown>)["stripeCustomerId"],
    ).toBeUndefined();
  });

  it("schema rejects emergency contact phone not in E.164 format", () => {
    const invalidPhones = [
      "03001234567",
      "+92 300 1234567",
      "not-a-number",
      "+0123456789",
    ];

    for (const phone of invalidPhones) {
      const result = UpdateConsumerProfileSchema.safeParse({
        emergencyContactPhone: phone,
      });
      expect(result.success).toBe(false);
    }
  });

  it("schema accepts valid E.164 phone", () => {
    const result = UpdateConsumerProfileSchema.safeParse({
      emergencyContactPhone: "+923001234567",
    });
    expect(result.success).toBe(true);
  });
});
