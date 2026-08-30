/**
 * PrismaService — injectable NestJS database service for PostgreSQL 16 + PostGIS 3.4.
 *
 * Provides:
 *  - `pool`: The underlying pg.Pool instance
 *  - `query<T>(text, params)`: Executes a parameterized SQL query
 *  - `sql<T>(strings, ...values)`: Tagged template query executor that parameterizes values safely
 *
 * Lifecycle:
 *  - Initializes pg.Pool on module init
 *  - Gracefully closes pg.Pool on module destroy
 */
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import pg from "pg";
import { getEnv } from "@routeride/config";

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  public pool!: pg.Pool;

  async onModuleInit(): Promise<void> {
    this.pool = new pg.Pool({
      connectionString: getEnv().DATABASE_URL,
    });
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

  async sql<T extends pg.QueryResultRow = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> {
    let text = "";
    const params: unknown[] = [];
    for (let i = 0; i < strings.length; i++) {
      text += strings[i];
      if (i < values.length) {
        params.push(values[i]);
        text += `$${params.length}`;
      }
    }
    const res = await this.pool.query<T>(text, params);
    return res.rows;
  }
}
