import assert from "node:assert/strict";
import pg from "pg";
import { migrate } from "../server/migrate.js";
import { buildApp } from "../server/app.js";
export async function setup(serveWeb = false) {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url, "TEST_DATABASE_URL must point to a disposable database");
  assert.match(
    new URL(url!).pathname,
    /_test$/,
    "Database name must end in _test",
  );
  await migrate(url);
  await migrate(url);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const tables = (
      await client.query(
        `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_planner_migrations'`,
      )
    ).rows.map((r) => '"' + r.tablename.replaceAll('"', '""') + '"');
    if (tables.length)
      await client.query("TRUNCATE " + tables.join(",") + " CASCADE");
  } finally {
    await client.end();
  }
  return buildApp({ databaseUrl: url, serveWeb });
}
