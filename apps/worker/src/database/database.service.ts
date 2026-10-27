import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import pg from "pg";

@Injectable()
export class WorkerDatabaseService implements OnModuleInit, OnModuleDestroy {
  public pool!: pg.Pool;

  async onModuleInit(): Promise<void> {
    const connString =
      process.env["DATABASE_URL"] ||
      "postgresql://postgres:postgres@localhost:5432/routeride";
    this.pool = new pg.Pool({ connectionString: connString });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  async query<T extends pg.QueryResultRow = Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const res = await this.pool.query<T>(text, params);
    return res.rows;
  }

  async getClient(): Promise<pg.PoolClient> {
    return this.pool.connect();
  }

  async clearUserFcmToken(userId: string): Promise<void> {
    await this.query(
      `UPDATE users SET fcm_token = NULL, updated_at = NOW() WHERE id = $1`,
      [userId],
    );
  }
}
