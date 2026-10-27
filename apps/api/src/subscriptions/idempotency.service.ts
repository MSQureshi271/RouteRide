import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type pg from "pg";

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function requestHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

@Injectable()
export class IdempotencyService {
  async claim(
    client: pg.PoolClient,
    actor: string,
    key: string,
    body: unknown,
  ): Promise<{ key: string; response: unknown | null }> {
    const scoped = `subscription-request:${requestHash(["POST /subscriptions", actor, key])}`;
    await client.query(`DELETE FROM idempotency_keys WHERE key IN (
      SELECT key FROM idempotency_keys WHERE key LIKE 'subscription-request:%' AND expires_at<=now()
      ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED)`);
    // Transaction advisory locks are released on rollback/crash and avoid waiting
    // for an uncommitted unique-key insert before reporting an in-flight retry.
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked",
      [scoped],
    );
    if (!lock.rows[0]?.locked)
      throw new ConflictException("An identical idempotency key is in flight");
    const hash = requestHash(body);
    const previous = await client.query<{
      request_hash: string;
      state: string;
      response: unknown;
    }>(
      "SELECT request_hash,state,response FROM idempotency_keys WHERE key=$1 AND expires_at>now()",
      [scoped],
    );
    const row = previous.rows[0];
    if (row) {
      if (row.request_hash !== hash)
        throw new UnprocessableEntityException(
          "Idempotency key was used with different request terms",
        );
      if (row.state !== "completed")
        throw new ConflictException(
          "An identical idempotency key is in flight",
        );
      return { key: scoped, response: row.response };
    }
    await client.query(
      `INSERT INTO idempotency_keys(key,request_hash,state,expires_at)
      VALUES($1,$2,'in_progress',now()+interval '24 hours') ON CONFLICT(key) DO UPDATE
      SET request_hash=excluded.request_hash,state=excluded.state,response=NULL,created_at=now(),expires_at=excluded.expires_at`,
      [scoped, hash],
    );
    return { key: scoped, response: null };
  }
  async complete(
    client: pg.PoolClient,
    key: string,
    response: unknown,
  ): Promise<void> {
    await client.query(
      "UPDATE idempotency_keys SET state='completed',response=$2::jsonb WHERE key=$1",
      [key, JSON.stringify(response)],
    );
  }
}
