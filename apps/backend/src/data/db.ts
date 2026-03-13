/**
 * Database utilities.
 *
 * Uses Bun.sql for PostgreSQL connectivity.
 * Connection is configured via environment variables:
 *   PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD
 *
 * Bun automatically loads .env, so no dotenv needed.
 */

// Bun.sql uses environment variables by default:
// PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
// We re-export it for convenience.
export const sql = Bun.sql;
