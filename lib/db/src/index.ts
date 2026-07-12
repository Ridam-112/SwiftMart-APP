import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const isNeon =
  connectionString.includes("neon") ||
  connectionString.includes("sslmode=require");

export const pool = new Pool({
  connectionString,
  ssl: isNeon ? { rejectUnauthorized: false } : undefined,
  max: isNeon ? 5 : 10,
  idleTimeoutMillis: isNeon ? 20_000 : 30_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
});

pool.on("error", (err) => {
  console.error("[DB] Idle client error:", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
