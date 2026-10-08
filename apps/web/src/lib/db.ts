import { createDb, type Db } from "@mizania/db/client";

let instance: Db | undefined;

/**
 * The server's database connection pool, created on first use so `next build`
 * doesn't need DATABASE_URL. Server-only.
 */
export function getDb(): Db {
  if (!instance) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is not set.");
    // Vercel connects through Neon's pooled URL, which doesn't keep prepared
    // statements between transactions.
    instance = createDb(databaseUrl, { max: 5, prepare: false }).db;
  }
  return instance;
}
