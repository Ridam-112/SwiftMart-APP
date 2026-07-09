import pg from "pg";
import { logger } from "./logger";

const { Pool } = pg;

// NEON_DATABASE_URL is optional — routes that need it return 503 when absent.
export const neonPool = process.env.NEON_DATABASE_URL
  ? new Pool({
      connectionString: process.env.NEON_DATABASE_URL,
      // Neon terminates TLS with a publicly-trusted CA, so default certificate
      // verification works — no need to disable it.
      ssl: true,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  : null;

if (!neonPool) {
  logger.warn("NEON_DATABASE_URL not set — /api/db/* routes will return 503");
}
