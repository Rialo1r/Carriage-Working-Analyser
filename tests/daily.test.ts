import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../server/app.js";
import { migrate } from "../server/migrate.js";
import { operates, timeline } from "../server/domain.js";
test("Phase 3 calendars, intermediate calls, composition and physical operation identities", async () => {
  const url = process.env.TEST_DATABASE_URL!;
  assert.match(new URL(url).pathname, /_test$/);
  await migrate(url);
  const { app, db } = await buildApp({ databaseUrl: url, serveWeb: false });
  try {
    const d = await db.diagram.create({
      data: { publishedNumber: "SYNTHETIC DAILY", operatingDays: ["Monday"] },
    });
    const s = await db.station.create({
      data: { name: "Synthetic intermediate " + d.id },
    });
    const m = await db.movement.create({
      data: {
        diagramId: d.id,
        sequence: 1,
        departureMinutes: 1400,
        arrivalMinutes: 1460,
      },
    });
    const call = await app.inject({
      method: "POST",
      url: `/api/movements/${m.id}/calls`,
      payload: { stationId: s.id, sequence: 1, arrivalMinutes: 1430 },
    });
    assert.equal(call.statusCode, 201);
    assert.equal(
      (await app.inject({ url: "/api/research-search?station=" + s.id }))
        .json()
        .some((v: any) => v.id === d.id),
      true,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/daily/${d.id}/calendar`,
          payload: {
            date: "2026-11-09",
            operates: false,
            notes: "Synthetic exception",
          },
        })
      ).statusCode,
      200,
    );
    const data = (await app.inject({ url: "/api/daily/" + d.id })).json();
    assert.equal(operates(data, new Date("2026-11-09")), false);
    assert.equal(operates(data, new Date("2026-11-16")), true);
    assert.equal(operates({ operatingDays: [] }, new Date()), null);
    assert.equal(
      timeline([{ sequence: 1, departureMinutes: 100, arrivalMinutes: 90 }])[0]
        .conflict,
      true,
    );
    const form = await app.inject({
      method: "POST",
      url: "/api/formations",
      payload: {
        description: "Synthetic anonymous formation",
        members: [{ quantity: 3 }],
      },
    });
    assert.equal(form.statusCode, 201);
    assert.equal(form.json().physicalSetId, null);
    assert.equal(form.json().members[0].carriageId, null);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/daily/${d.id}/assignments`,
          payload: {
            formationId: form.json().id,
            scenarioDay: "Synthetic Monday",
            notes: "Hypothesis",
          },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await db.diagramOperation.findMany({
          where: { diagramId: d.id },
          include: { assignments: true },
        })
      )[0].assignments[0].formationId,
      form.json().id,
    );
  } finally {
    await app.close();
  }
});

test("Physical formation versions reuse set identity and identified vehicles cannot have quantity > 1", async () => {
  const url = process.env.TEST_DATABASE_URL!;
  assert.match(new URL(url).pathname, /_test$/);
  const { app, db } = await buildApp({ databaseUrl: url, serveWeb: false });
  try {
    const type = await db.carriageType.create({
      data: { code: "SYNTHETIC TYPE" },
    });
    const a = await app.inject({
      method: "POST",
      url: "/api/formations",
      payload: {
        description: "Synthetic identified stock",
        physicalSetLabel: "Synthetic persistent identity",
        members: [
          { quantity: 1, typeId: type.id, vehicleNumber: "SYNTHETIC-123" },
        ],
      },
    });
    assert.equal(a.statusCode, 201, a.body);
    const b = await app.inject({
      method: "POST",
      url: "/api/formations",
      payload: {
        description: "New synthetic formation version",
        physicalSetId: a.json().physicalSetId,
        members: [{ quantity: 1, carriageId: a.json().members[0].carriageId }],
      },
    });
    assert.equal(b.statusCode, 201, b.body);
    assert.equal(b.json().physicalSetId, a.json().physicalSetId);
    assert.equal(
      b.json().members[0].carriageId,
      a.json().members[0].carriageId,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/formations",
          payload: {
            description: "Invalid identified quantity",
            members: [{ quantity: 3, vehicleNumber: "SYNTHETIC-999" }],
          },
        })
      ).statusCode,
      400,
    );
  } finally {
    await app.close();
  }
});
