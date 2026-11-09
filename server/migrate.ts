import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
export async function migrate(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is required");
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("SELECT pg_advisory_lock(4310001)");
    const legacy = await c.query(
      `SELECT to_regclass('public."_lner_migrations"') AS legacy`,
    );
    if (legacy.rows[0].legacy)
      throw new Error(
        "This is the legacy analyser database. Use a fresh planner database.",
      );
    await c.query(
      'CREATE TABLE IF NOT EXISTS "_planner_migrations" (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    const dirs = (await readdir("prisma/migrations", { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const name of dirs) {
      const sql = await readFile(
          `prisma/migrations/${name}/migration.sql`,
          "utf8",
        ),
        hash = createHash("sha256").update(sql).digest("hex");
      const r = await c.query(
        'SELECT checksum FROM "_planner_migrations" WHERE name=$1',
        [name],
      );
      if (r.rowCount) {
        if (r.rows[0].checksum !== hash)
          throw new Error("Applied migration changed: " + name);
        continue;
      }
      await c.query("BEGIN");
      try {
        await c.query(sql);
        await c.query(
          'INSERT INTO "_planner_migrations"(name,checksum) VALUES($1,$2)',
          [name, hash],
        );
        await c.query("COMMIT");
        console.log("Applied " + name);
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await c.end();
  }
}
if (process.argv[1]?.endsWith("migrate.ts")) await migrate();
