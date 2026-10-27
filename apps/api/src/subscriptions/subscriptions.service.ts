import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  RequestSubscriptionV2Schema,
  PendingSubscriptionDataSchema,
  type RequestSubscriptionV2,
  type PendingSubscriptionData,
} from "@routeride/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { IdempotencyService } from "./idempotency.service.js";
import { RequestabilityService } from "./requestability.service.js";

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly requestability: RequestabilityService,
  ) {}

  async create(
    actor: string,
    key: string,
    input: RequestSubscriptionV2,
  ): Promise<PendingSubscriptionData> {
    const terms = RequestSubscriptionV2Schema.parse(input);
    const client = await this.prisma.pool.connect();
    try {
      await client.query("BEGIN");
      const claim = await this.idempotency.claim(client, actor, key, terms);
      if (claim.response !== null) {
        const response = PendingSubscriptionDataSchema.parse(claim.response);
        await client.query("COMMIT");
        return response;
      }
      const owner = await client.query(
        `SELECT r.id FROM riders r JOIN consumer_profiles cp ON cp.id=r.consumer_profile_id
        WHERE r.id=$1 AND cp.user_id=$2 FOR UPDATE OF r`,
        [terms.riderId, actor],
      );
      if (!owner.rows.length)
        throw new ForbiddenException("Rider is unavailable to this consumer");
      const date = await client.query<{ valid: boolean }>(
        "SELECT $1::date >= (now() AT TIME ZONE 'Asia/Karachi')::date AS valid",
        [terms.startDate],
      );
      if (!date.rows[0]?.valid)
        throw new UnprocessableEntityException(
          "Start date must not be in the past",
        );
      // Serialize exact-intent duplicates on the rider, while allowing different
      // pending riders/terms to compete later at driver acceptance.
      const duplicate = await client.query(
        `SELECT id FROM subscriptions WHERE rider_id=$1 AND driver_profile_id=$2
        AND status='PENDING' AND response_deadline>now() AND requested_terms=$3::jsonb LIMIT 1`,
        [terms.riderId, terms.driverProfileId, JSON.stringify(terms)],
      );
      if (duplicate.rows.length)
        throw new ConflictException("This pending request already exists");
      const price = await this.requestability.inspect(
        client,
        terms.driverProfileId,
        terms,
      );
      const id = randomUUID();
      const inserted = await client.query<{
        created_at: Date;
        response_deadline: Date;
      }>(
        `INSERT INTO subscriptions
        (id,rider_id,driver_profile_id,type,monthly_price_cents,currency,status,start_date,
         requested_terms,response_deadline,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,'PENDING',$7::date,$8::jsonb,now()+interval '24 hours',now(),now())
        RETURNING created_at,response_deadline`,
        [
          id,
          terms.riderId,
          terms.driverProfileId,
          terms.type,
          price.monthlyPriceCents,
          price.currency,
          terms.startDate,
          JSON.stringify(terms),
        ],
      );
      const row = inserted.rows[0]!;
      const response = PendingSubscriptionDataSchema.parse({
        id,
        status: "PENDING",
        requestedTerms: terms,
        monthlyPriceCents: price.monthlyPriceCents,
        currency: price.currency,
        responseDeadline: row.response_deadline.toISOString(),
        createdAt: row.created_at.toISOString(),
        reviewStatus: "REQUIRED",
      });
      await this.idempotency.complete(client, claim.key, response);
      await client.query("COMMIT");
      return response;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}
