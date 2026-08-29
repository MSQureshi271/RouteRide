import * as fs from "node:fs";
import * as path from "node:path";
import { createDocument } from "zod-openapi";
import {
  RegisterRequestSchema,
  RegisterResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  RefreshTokenRequestSchema,
  RefreshTokenResponseSchema,
  SendOtpRequestSchema,
  VerifyOtpRequestSchema,
} from "./modules/auth.js";
import {
  OnboardDriverRequestSchema,
  DriverProfileResponseSchema,
  UpdateDriverAvailabilitySchema,
  UpdateDriverRouteSchema,
} from "./modules/drivers.js";
import {
  CreateRiderRequestSchema,
  RiderResponseSchema,
  RiderListResponseSchema,
  UpdateConsumerProfileSchema,
  ConsumerProfileResponseSchema,
} from "./modules/consumers.js";
import {
  SearchRoutesRequestSchema,
  SearchRoutesResponseSchema,
} from "./modules/search.js";
import {
  RequestSubscriptionRequestSchema,
  SubscriptionResponseSchema,
  SubscriptionListResponseSchema,
  CancelSubscriptionRequestSchema,
} from "./modules/subscriptions.js";
import {
  TripResponseSchema,
  TripListResponseSchema,
  MarkPickupRequestSchema,
  MarkDropoffRequestSchema,
} from "./modules/trips.js";
import {
  PaymentListResponseSchema,
  DriverPayoutListResponseSchema,
} from "./modules/payments.js";
import { NotificationListResponseSchema } from "./modules/notifications.js";
import { ErrorEnvelopeSchema } from "./common/envelope.js";

export function generateOpenApiDocument(): Record<string, unknown> {
  return createDocument({
    openapi: "3.1.0",
    info: {
      title: "RouteRide API",
      version: "0.1.0",
      description:
        "RouteRide recurring transport subscription marketplace REST API specification",
    },
    servers: [
      {
        url: "http://localhost:3000/api/v1",
        description: "Local development server",
      },
    ],
    paths: {
      "/auth/register": {
        post: {
          summary: "Register a new user",
          requestBody: {
            content: { "application/json": { schema: RegisterRequestSchema } },
          },
          responses: {
            "201": {
              description: "Created",
              content: {
                "application/json": { schema: RegisterResponseSchema },
              },
            },
            "400": {
              description: "Validation Error",
              content: { "application/json": { schema: ErrorEnvelopeSchema } },
            },
          },
        },
      },
      "/auth/login": {
        post: {
          summary: "Authenticate with phone and password",
          requestBody: {
            content: { "application/json": { schema: LoginRequestSchema } },
          },
          responses: {
            "200": {
              description: "OK",
              content: { "application/json": { schema: LoginResponseSchema } },
            },
            "401": {
              description: "Unauthenticated",
              content: { "application/json": { schema: ErrorEnvelopeSchema } },
            },
          },
        },
      },
      "/auth/refresh": {
        post: {
          summary: "Rotate refresh token and receive new access token",
          requestBody: {
            content: {
              "application/json": { schema: RefreshTokenRequestSchema },
            },
          },
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": { schema: RefreshTokenResponseSchema },
              },
            },
            "401": {
              description: "Unauthenticated",
              content: { "application/json": { schema: ErrorEnvelopeSchema } },
            },
          },
        },
      },
      "/auth/otp/send": {
        post: {
          summary: "Send single-use verification code to phone",
          requestBody: {
            content: { "application/json": { schema: SendOtpRequestSchema } },
          },
          responses: {
            "200": { description: "OK" },
            "429": {
              description: "Rate limited",
              content: { "application/json": { schema: ErrorEnvelopeSchema } },
            },
          },
        },
      },
      "/auth/otp/verify": {
        post: {
          summary: "Verify phone code",
          requestBody: {
            content: { "application/json": { schema: VerifyOtpRequestSchema } },
          },
          responses: {
            "200": { description: "Verified" },
            "400": {
              description: "Invalid code",
              content: { "application/json": { schema: ErrorEnvelopeSchema } },
            },
          },
        },
      },
      "/drivers/onboard": {
        post: {
          summary: "Onboard driver profile and vehicle",
          requestBody: {
            content: {
              "application/json": { schema: OnboardDriverRequestSchema },
            },
          },
          responses: {
            "201": {
              description: "Onboarded",
              content: {
                "application/json": { schema: DriverProfileResponseSchema },
              },
            },
          },
        },
      },
      "/drivers/me/route": {
        put: {
          summary: "Update driver operating route polyline",
          requestBody: {
            content: {
              "application/json": { schema: UpdateDriverRouteSchema },
            },
          },
          responses: {
            "200": { description: "Updated" },
          },
        },
      },
      "/drivers/me/availability": {
        patch: {
          summary: "Update driver operating days and pricing",
          requestBody: {
            content: {
              "application/json": { schema: UpdateDriverAvailabilitySchema },
            },
          },
          responses: {
            "200": { description: "Updated" },
          },
        },
      },
      "/consumers/me": {
        patch: {
          summary: "Update consumer emergency contact",
          requestBody: {
            content: {
              "application/json": { schema: UpdateConsumerProfileSchema },
            },
          },
          responses: {
            "200": {
              description: "Updated",
              content: {
                "application/json": { schema: ConsumerProfileResponseSchema },
              },
            },
          },
        },
      },
      "/consumers/me/riders": {
        get: {
          summary: "List all riders for authenticated consumer",
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": { schema: RiderListResponseSchema },
              },
            },
          },
        },
        post: {
          summary: "Create a new rider profile",
          requestBody: {
            content: {
              "application/json": { schema: CreateRiderRequestSchema },
            },
          },
          responses: {
            "201": {
              description: "Created",
              content: { "application/json": { schema: RiderResponseSchema } },
            },
          },
        },
      },
      "/search": {
        post: {
          summary: "Search for matching drivers along route",
          requestBody: {
            content: {
              "application/json": { schema: SearchRoutesRequestSchema },
            },
          },
          responses: {
            "200": {
              description: "Match Results",
              content: {
                "application/json": { schema: SearchRoutesResponseSchema },
              },
            },
          },
        },
      },
      "/subscriptions": {
        get: {
          summary: "List subscriptions",
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": { schema: SubscriptionListResponseSchema },
              },
            },
          },
        },
        post: {
          summary: "Request a recurring ride subscription",
          requestBody: {
            content: {
              "application/json": { schema: RequestSubscriptionRequestSchema },
            },
          },
          responses: {
            "201": {
              description: "Requested",
              content: {
                "application/json": { schema: SubscriptionResponseSchema },
              },
            },
          },
        },
      },
      "/subscriptions/{id}/cancel": {
        post: {
          summary: "Cancel an active subscription",
          requestBody: {
            content: {
              "application/json": { schema: CancelSubscriptionRequestSchema },
            },
          },
          responses: {
            "200": {
              description: "Cancelled",
              content: {
                "application/json": { schema: SubscriptionResponseSchema },
              },
            },
          },
        },
      },
      "/trips": {
        get: {
          summary: "List trips for day",
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": { schema: TripListResponseSchema },
              },
            },
          },
        },
      },
      "/trips/{id}/pickup": {
        post: {
          summary: "Mark rider pickup timestamp",
          requestBody: {
            content: {
              "application/json": { schema: MarkPickupRequestSchema },
            },
          },
          responses: {
            "200": {
              description: "Updated",
              content: { "application/json": { schema: TripResponseSchema } },
            },
          },
        },
      },
      "/trips/{id}/dropoff": {
        post: {
          summary: "Mark rider dropoff timestamp",
          requestBody: {
            content: {
              "application/json": { schema: MarkDropoffRequestSchema },
            },
          },
          responses: {
            "200": {
              description: "Updated",
              content: { "application/json": { schema: TripResponseSchema } },
            },
          },
        },
      },
      "/payments": {
        get: {
          summary: "List payment history",
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": { schema: PaymentListResponseSchema },
              },
            },
          },
        },
      },
      "/payouts": {
        get: {
          summary: "List driver payouts",
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": { schema: DriverPayoutListResponseSchema },
              },
            },
          },
        },
      },
      "/notifications": {
        get: {
          summary: "List notifications for user",
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": { schema: NotificationListResponseSchema },
              },
            },
          },
        },
      },
    },
  });
}

// Generate to openapi.json when run directly
const outputPath = path.resolve(__dirname, "../openapi.json");
const doc = generateOpenApiDocument();
fs.writeFileSync(outputPath, JSON.stringify(doc, null, 2), "utf-8");
process.stdout.write(`Generated OpenAPI document at ${outputPath}\n`);
