/**
 * Integration tests for T0.42 — Rider CRUD with Geocoding.
 *
 * Tests verify:
 *  - 201 create rider with geocoded location
 *  - 200 list riders returns consumer's riders
 *  - 200 update rider updates name, notes, or addresses
 *  - 204 delete rider deletes rider when no active subscriptions exist
 *  - 409 delete rider throws ConflictException when active subscription exists
 *  - 404 update/delete rider throws NotFoundException when rider does not exist
 *  - 422 create rider throws UnprocessableEntityException when address cannot be geocoded
 *  - 503 create rider throws ServiceUnavailableException on maps adapter error
 */
import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConsumersService } from "../src/consumers/consumers.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { GeocodeService, MapsAdapter } from "../src/maps/geocode.service.js";
import { CreateRiderRequestSchema } from "@routeride/contracts";

const MOCK_CONSUMER_ID = "00000000-0000-0000-0000-000000000002";
const MOCK_USER_ID = "22222222-2222-2222-2222-222222222222";

const MOCK_RIDER_ROW = {
  id: "33333333-3333-3333-3333-333333333333",
  consumer_profile_id: MOCK_CONSUMER_ID,
  name: "Sara",
  photo_url: null,
  home_address_text: "DHA Phase 5, Karachi",
  dest_address_text: "Karachi Grammar School",
  notes: "Grade 3",
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
};

function makeMockPrisma(
  options: {
    riderExists?: boolean;
    hasActiveSubscription?: boolean;
  } = {},
) {
  const { riderExists = true, hasActiveSubscription = false } = options;

  return {
    sql: jest
      .fn()
      .mockImplementation(
        (strings: TemplateStringsArray, ..._values: unknown[]) => {
          const query = strings.join(" ");

          if (query.includes("INSERT INTO consumer_profiles")) {
            return Promise.resolve([
              {
                id: MOCK_CONSUMER_ID,
                user_id: MOCK_USER_ID,
                emergency_contact_name: "",
                emergency_contact_phone: "",
                stripe_customer_id: null,
                created_at: new Date(),
                updated_at: new Date(),
              },
            ]);
          }

          if (
            query.includes("SELECT") &&
            query.includes("FROM riders") &&
            query.includes("WHERE consumer_profile_id")
          ) {
            return Promise.resolve(riderExists ? [MOCK_RIDER_ROW] : []);
          }

          if (query.includes("INSERT INTO riders")) {
            return Promise.resolve([MOCK_RIDER_ROW]);
          }

          if (
            query.includes("SELECT") &&
            query.includes("FROM riders") &&
            query.includes("WHERE id =")
          ) {
            return Promise.resolve(riderExists ? [MOCK_RIDER_ROW] : []);
          }

          if (
            query.includes("FROM subscriptions") &&
            query.includes("WHERE rider_id")
          ) {
            return Promise.resolve([
              { cnt: hasActiveSubscription ? "1" : "0" },
            ]);
          }

          if (query.includes("UPDATE riders")) {
            return Promise.resolve([MOCK_RIDER_ROW]);
          }

          if (query.includes("DELETE FROM riders")) {
            return Promise.resolve([]);
          }

          return Promise.resolve([]);
        },
      ),
  } as unknown as PrismaService;
}

class MockMapsAdapter extends MapsAdapter {
  public result: { lat: number; lng: number } | null = {
    lat: 24.86,
    lng: 67.01,
  };
  public shouldThrow = false;

  async geocode(_address: string) {
    if (this.shouldThrow) {
      throw new Error("Network error connecting to maps API");
    }
    return this.result;
  }
}

describe("Rider Management (T0.42)", () => {
  let adapter: MockMapsAdapter;
  let geocode: GeocodeService;

  beforeEach(() => {
    adapter = new MockMapsAdapter();
    geocode = new GeocodeService(adapter);
  });

  it("201 — creates rider with geocoded coordinates", async () => {
    const prisma = makeMockPrisma();
    const service = new ConsumersService(prisma, geocode);

    const rider = await service.createRider(MOCK_USER_ID, {
      name: "Sara",
      homeAddressText: "DHA Phase 5, Karachi",
      destAddressText: "Karachi Grammar School",
      notes: "Grade 3",
    });

    expect(rider.id).toBe(MOCK_RIDER_ROW.id);
    expect(rider.name).toBe("Sara");
  });

  it("422 — throws UnprocessableEntityException when address cannot be geocoded", async () => {
    adapter.result = null; // unresolvable address
    const prisma = makeMockPrisma();
    const service = new ConsumersService(prisma, geocode);

    await expect(
      service.createRider(MOCK_USER_ID, {
        name: "Sara",
        homeAddressText: "Unknown Nonexistent Place 123",
        destAddressText: "Karachi Grammar School",
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it("503 — throws ServiceUnavailableException when maps adapter fails", async () => {
    adapter.shouldThrow = true;
    const prisma = makeMockPrisma();
    const service = new ConsumersService(prisma, geocode);

    await expect(
      service.createRider(MOCK_USER_ID, {
        name: "Sara",
        homeAddressText: "Random External Street 456, Karachi",
        destAddressText: "Custom School Road 789, Karachi",
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it("200 — listRiders returns only caller's riders", async () => {
    const prisma = makeMockPrisma({ riderExists: true });
    const service = new ConsumersService(prisma, geocode);

    const list = await service.listRiders(MOCK_USER_ID);
    expect(list.length).toBe(1);
    expect(list[0]?.id).toBe(MOCK_RIDER_ROW.id);
  });

  it("200 — updates rider successfully", async () => {
    const prisma = makeMockPrisma({ riderExists: true });
    const service = new ConsumersService(prisma, geocode);

    const updated = await service.updateRider(MOCK_USER_ID, MOCK_RIDER_ROW.id, {
      name: "Sara Updated",
      notes: "Grade 4",
    });

    expect(updated.id).toBe(MOCK_RIDER_ROW.id);
  });

  it("404 — update rider throws NotFoundException when rider does not exist", async () => {
    const prisma = makeMockPrisma({ riderExists: false });
    const service = new ConsumersService(prisma, geocode);

    await expect(
      service.updateRider(MOCK_USER_ID, "non-existent-rider-id", {
        name: "Sara",
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("204 — deletes rider when no active subscriptions exist", async () => {
    const prisma = makeMockPrisma({
      riderExists: true,
      hasActiveSubscription: false,
    });
    const service = new ConsumersService(prisma, geocode);

    await expect(
      service.deleteRider(MOCK_USER_ID, MOCK_RIDER_ROW.id),
    ).resolves.toBeUndefined();
  });

  it("409 — rejects deleting rider when active subscription exists", async () => {
    const prisma = makeMockPrisma({
      riderExists: true,
      hasActiveSubscription: true,
    });
    const service = new ConsumersService(prisma, geocode);

    await expect(
      service.deleteRider(MOCK_USER_ID, MOCK_RIDER_ROW.id),
    ).rejects.toThrow(ConflictException);
  });

  it("schema rejects rider name shorter than 2 chars", () => {
    const result = CreateRiderRequestSchema.safeParse({
      name: "A",
      homeAddressText: "DHA Phase 5, Karachi",
      destAddressText: "Karachi Grammar School",
    });
    expect(result.success).toBe(false);
  });
});
