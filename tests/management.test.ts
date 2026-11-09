import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { onCalendar } from "../server/calendar.js";
test("Roster management preserves references, edits names, archives replacements and retains IDs", async () => {
  const { app, db } = await setup();
  const req = (method: any, url: string, payload?: any) =>
    app.inject({ method, url: "/api" + url, ...(payload ? { payload } : {}) });
  try {
    const a = (await req("POST", "/stations", { name: "Buttons Ambo" })).json(),
      b = (await req("POST", "/stations", { name: "Huttons Ambo" })).json();
    const p = await db.historicalPeriod.create({
        data: { name: "Synthetic management" },
      }),
      d = await db.publishedDiagram.create({
        data: { periodId: p.id, number: "TEST" },
      });
    const w = await db.workingDefinition.create({
      data: {
        diagramId: d.id,
        startStationId: a.id,
        finishStationId: a.id,
        calendar: { create: { weekdays: [0] } },
      },
    });
    assert.equal(
      (
        await req("PUT", "/records/stations/" + a.id, {
          name: "Buttons Ambo (source spelling)",
          notes: "Retain original spelling",
          reason: "Research note",
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await req("DELETE", "/records/stations/" + a.id, {
          mode: "delete",
          reason: "Unsafe deletion",
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await req("DELETE", "/records/stations/" + a.id, {
          mode: "replace",
          replacementId: b.id,
          reason: "Reviewed station correction",
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await db.workingDefinition.findUniqueOrThrow({ where: { id: w.id } }))
        .startStationId,
      b.id,
    );
    assert.equal(
      (await db.station.findUniqueOrThrow({ where: { id: a.id } })).archived,
      true,
    );
    assert.equal(
      (await req("GET", "/catalog"))
        .json()
        .stations.some((s: any) => s.id === a.id),
      false,
    );
    assert.equal(
      (
        await req("POST", "/records/stations/" + a.id + "/restore", {
          reason: "Review source wording",
        })
      ).statusCode,
      200,
    );
    const unused = (
      await req("POST", "/types", { name: "Unused test type" })
    ).json();
    assert.equal(
      (
        await req("DELETE", "/records/types/" + unused.id, {
          mode: "delete",
          reason: "Remove erroneous unused entry",
        })
      ).statusCode,
      200,
    );
    assert.equal(
      await db.carriageType.findUnique({ where: { id: unused.id } }),
      null,
    );
    assert.ok((await db.auditEvent.count({ where: { entityId: a.id } })) >= 3);
    const cycle = {
      weekdays: [0],
      cycleWeeks: 2,
      anchorDate: "1939-07-03",
      weekOffsets: [0],
      exceptions: [],
    };
    assert.equal(onCalendar(cycle, new Date("1939-07-03")), true);
    assert.equal(onCalendar(cycle, new Date("1939-07-10")), false);
    assert.equal(onCalendar(cycle, new Date("1939-07-17")), true);
  } finally {
    await app.close();
  }
});
