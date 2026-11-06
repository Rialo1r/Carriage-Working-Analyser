import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildApp } from "../server/app.js";
import { migrate } from "../server/migrate.js";
import { csvCell } from "../server/domain.js";
test("Phase 6 exact frozen export preview, verification filtering and formula-safe CSV", async () => {
  const url = process.env.TEST_DATABASE_URL!;
  assert.match(new URL(url).pathname, /_test$/);
  await migrate(url);
  const { app, db } = await buildApp({ databaseUrl: url, serveWeb: false });
  try {
    const d = await db.diagram.create({
      data: {
        publishedNumber: "=SYNTHETIC()",
        notes: "Synthetic export fixture",
      },
    });
    const filtered = await app.inject({
      method: "POST",
      url: "/api/exports/preview",
      payload: { format: "JSON", diagramIds: [d.id] },
    });
    assert.equal(filtered.statusCode, 201);
    assert.equal(filtered.json().payload.diagrams.length, 0);
    const r = await app.inject({
      method: "POST",
      url: "/api/exports/preview",
      payload: { format: "JSON", diagramIds: [d.id], verifiedOnly: false },
    });
    assert.equal(r.statusCode, 201);
    assert.equal(r.json().payload.diagrams[0].id, d.id);
    assert.match(r.json().warnings.join(" "), /unverified/);
    await db.diagram.update({
      where: { id: d.id },
      data: { notes: "Changed after preview" },
    });
    const download = await app.inject({ url: r.json().downloadUrl });
    assert.equal(download.body, r.json().text);
    assert.equal(
      createHash("sha256").update(download.body).digest("hex"),
      r.json().sha256,
    );
    assert.equal(download.json().diagrams[0].notes, "Synthetic export fixture");
    assert.equal(csvCell("  =1+1"), '"\'  =1+1"');
    assert.equal(csvCell("=1+1"), '"\'=1+1"');
    assert.equal(csvCell('a,"b"'), '"a,""b"""');
    const csv = await app.inject({
      method: "POST",
      url: "/api/exports/preview",
      payload: { format: "CSV", diagramIds: [d.id], verifiedOnly: false },
    });
    assert.match(csv.json().text, /'=SYNTHETIC/);
    assert.equal(
      (await app.inject({ url: csv.json().downloadUrl })).body,
      csv.json().text,
    );
  } finally {
    await app.close();
  }
});
