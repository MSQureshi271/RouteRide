import { ConflictException, NotFoundException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service.js";

/** Serialize legacy profile edits on the same stable row used by run acceptance. */
export async function mutateDriverProfile<T>(
  prisma: PrismaService,
  userId: string,
  changesSchedule: boolean,
  mutate: (sql: PrismaService["sql"]) => Promise<T>,
): Promise<T> {
  const client = await prisma.pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const profile = await client.query<{ id: string }>(
      "SELECT id FROM driver_profiles WHERE user_id = $1 FOR UPDATE",
      [userId],
    );
    if (!profile.rows[0])
      throw new NotFoundException("Driver profile not found");
    if (changesSchedule) {
      const commitments = await client.query(
        "SELECT id FROM subscriptions WHERE driver_profile_id = $1 AND status IN ('ACTIVE', 'PAUSED') LIMIT 1",
        [profile.rows[0].id],
      );
      if (commitments.rows.length)
        throw new ConflictException(
          "Active commitments require a reviewed schedule change",
        );
    }
    const sql: PrismaService["sql"] = async (strings, ...values) => {
      const text = strings.reduce(
        (query, part, index) => query + (index ? `$${index}` : "") + part,
        "",
      );
      return (await client.query(text, values)).rows;
    };
    const result = await mutate(sql);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if ((error as { code?: string }).code === "40001") {
      throw new ConflictException("Driver availability changed concurrently; reload and retry");
    }
    throw error;
  } finally {
    client.release();
  }
}
