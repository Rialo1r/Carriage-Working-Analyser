import { test } from "node:test";
import assert from "node:assert/strict";
import { assessConnection, buildRotation } from "../server/rotation-engine.js";
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const scenario = { startDate: "2026-11-09", endDate: "2026-12-09" };
const diagram = (id: string, from: string, to: string) => ({
  id,
  publishedNumber: id,
  documentId: "source",
  operatingDays: days,
  calendarRules: [],
  requirements: [{ typeCode: "BT", quantity: 2 }],
  movements: [
    {
      sequence: 1,
      originId: from,
      destinationId: to,
      departureMinutes: 480,
      arrivalMinutes: 1080,
      changes: [],
    },
  ],
});
test("Phase 4 connection confidence respects gaps, unknowns, composition and timing", () => {
  const a = diagram("A", "York", "Scarborough"),
    b = diagram("B", "Scarborough", "York");
  const valid = assessConnection(a, b, 1, scenario);
  assert.equal(valid.confidence, "Probable");
  assert.notEqual(valid.confidence, "Confirmed");
  assert.equal(
    assessConnection(a, { ...b, requirements: [] }, 1, scenario).confidence,
    "Possible",
  );
  assert.equal(
    assessConnection(
      a,
      { ...b, requirements: [{ typeCode: "BT", quantity: 3 }] },
      1,
      scenario,
    ).confidence,
    "Conflict",
  );
  const gap = assessConnection(a, diagram("C", "Leeds", "York"), 1, scenario);
  assert.equal(gap.kind, "Unresolved gap");
  assert.equal(gap.checks.find((c) => c.name === "Location")?.state, "Unknown");
  a.movements[0].arrivalMinutes = 2200;
  assert.equal(assessConnection(a, b, 1, scenario).confidence, "Conflict");
});
test("Phase 4 three-day daily cycle repeats, weekday conflicts and branches do not", () => {
  const a = diagram("A", "York", "Scarborough"),
    b = diagram("B", "Scarborough", "Leeds"),
    c = diagram("C", "Leeds", "York");
  const ds = new Map([a, b, c].map((d) => [d.id, d]));
  const links = [
    ["A", "B"],
    ["B", "C"],
    ["C", "A"],
  ].map(([fromId, toId]) => ({
    fromId,
    toId,
    dayOffset: 1,
    confidence: "Probable",
    kind: "Direct",
    checks: [{ state: "Pass" }],
  }));
  const r = buildRotation("A", links, ds, scenario);
  assert.equal(r.periodDays, 3);
  assert.equal(r.repeats, true);
  a.operatingDays = ["Monday"];
  assert.equal(buildRotation("A", links, ds, scenario).repeats, false);
  a.operatingDays = days;
  assert.match(
    buildRotation(
      "A",
      [...links, { ...links[0], toId: "C" }],
      ds,
      scenario,
    ).issues.join(" "),
    /Competing/,
  );
  assert.equal(
    buildRotation(
      "A",
      [{ ...links[0], kind: "Unresolved gap" }, ...links.slice(1)],
      ds,
      scenario,
    ).repeats,
    false,
  );
  a.calendarRules = [{ date: "2026-11-12", operates: false }] as any;
  assert.equal(buildRotation("A", links, ds, scenario).repeats, false);
});

test("Physical stock double-bookings across formation versions are flagged", async () => {
  const { stockConflicts } = await import("../server/domain.js");
  const operation = (
    number: string,
    date: string,
    start: number,
    end: number,
  ) => ({
    date,
    diagram: {
      publishedNumber: number,
      movements: [{ departureMinutes: start, arrivalMinutes: end }],
    },
  });
  const formations = [
    {
      id: "f1",
      physicalSetId: "set",
      assignments: [{ operation: operation("A", "1939-07-03", 480, 600) }],
    },
    {
      id: "f2",
      physicalSetId: "set",
      assignments: [{ operation: operation("B", "1939-07-03", 540, 660) }],
    },
  ];
  assert.equal(stockConflicts(formations).length, 1);
  formations[1].assignments[0].operation.date = "1939-07-04";
  assert.equal(stockConflicts(formations).length, 0);
});
