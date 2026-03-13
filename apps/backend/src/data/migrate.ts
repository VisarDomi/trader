/**
 * Database migration script.
 *
 * Reads schema.sql and executes it against the configured PostgreSQL database.
 * All statements use IF NOT EXISTS, so this is safe to run repeatedly.
 *
 * Usage: bun run db:migrate
 */

const schemaPath = new URL('./schema.sql', import.meta.url).pathname;
const schema = await Bun.file(schemaPath).text();

const sql = Bun.sql;

console.log('Running migrations...');

await sql.unsafe(schema);

console.log('Migrations complete.');

await sql.close();
