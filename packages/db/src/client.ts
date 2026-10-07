import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export interface CreateDbOptions {
  /** Maximum connections in the pool. */
  max?: number;
  /**
   * Use prepared statements. Turn off when connecting through a transaction-mode
   * pooler such as Neon's pooled URL (used by Vercel), which may not support them.
   */
  prepare?: boolean;
}

export function createDb(url: string, options: CreateDbOptions = {}) {
  const client = postgres(url, { max: options.max ?? 10, prepare: options.prepare ?? true });
  const db = drizzle({ client, schema, casing: "snake_case" });
  return { db, client };
}

export type Db = ReturnType<typeof createDb>["db"];
