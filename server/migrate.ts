import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// Transactional SQL migrations with an advisory lock and immutable checksums.
export async function migrate(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(76341801)");
    await client.query(
      'CREATE TABLE IF NOT EXISTS "_lner_migrations" (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    const names = (await readdir("prisma/migrations", { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    for (const name of names) {
      const sql = await readFile(
        `prisma/migrations/${name}/migration.sql`,
        "utf8",
      );
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query(
        'SELECT checksum FROM "_lner_migrations" WHERE name=$1',
        [name],
      );
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum)
          throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO "_lner_migrations" (name,checksum) VALUES ($1,$2)',
          [name, checksum],
        );
        await client.query("COMMIT");
        console.log(`Applied ${name}`);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await client.end();
  }
}
if (process.argv[1]?.endsWith("migrate.ts")) await migrate();
