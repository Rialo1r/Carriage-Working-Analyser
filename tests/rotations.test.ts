import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
test("Rotations: weekly 262/822A, 14-day cycle, ambiguity, stabling and immutable approvals", async (t) => {
  const { app, db } = await setup();
  const call = async (method: any, url: string, payload?: any) =>
    app.inject({ method, url: "/api" + url, ...(payload ? { payload } : {}) });
  async function fixture(
    numbers: string[],
    weekdays: number[][],
    offsets?: number[],
  ) {
    const period = await db.historicalPeriod.create({
      data: { name: "Synthetic " + numbers.join("/") },
    });
    const station =
      (await db.station.findFirst({ where: { name: "Scarborough" } })) ||
      (await db.station.create({ data: { name: "Scarborough" } }));
    const ws = [];
    for (let i = 0; i < numbers.length; i++) {
      const diagram =
        (await db.publishedDiagram.findFirst({
          where: { periodId: period.id, number: numbers[i] },
        })) ||
        (await db.publishedDiagram.create({
          data: { periodId: period.id, number: numbers[i] },
        }));
      ws.push(
        await db.workingDefinition.create({
          data: {
            diagramId: diagram.id,
            label: "Synthetic " + numbers[i],
            startStationId: station.id,
            finishStationId: station.id,
            startMinutes: 600,
            finishMinutes: 1080,
            calendar: {
              create: {
                weekdays: weekdays[i],
                ...(offsets
                  ? {
                      cycleWeeks: 2,
                      anchorDate: new Date("1939-01-02"),
                      weekOffsets: [offsets[i]],
                    }
                  : {}),
              },
            },
          },
        }),
      );
    }
    for (let i = 0; i < ws.length; i++)
      for (const day of weekdays[i]) {
        const next = ws[(i + 1) % ws.length];
        await db.nextWorkingReference.create({
          data: {
            workingId: ws[i].id,
            weekday: day,
            kind: "TARGET",
            targetWorkingId: next.id,
            offsetDays: 1,
          },
        });
      }
    return { period, ws, station };
  }
  try {
    await t.test(
      "262 weekdays and Saturday variants connect to Sunday 822A and close weekly",
      async () => {
        const f = await fixture(
          ["262", "262", "822A"],
          [[0, 1, 2, 3, 4], [5], [6]],
        );
        await db.nextWorkingReference.updateMany({
          where: { workingId: f.ws[0].id, weekday: { in: [0, 1, 2, 3] } },
          data: { targetWorkingId: f.ws[0].id },
        });
        const neville = await db.station.create({
          data: { name: "Neville Hill" },
        });
        await db.workingDefinition.update({
          where: { id: f.ws[1].id },
          data: {
            finishStationId: neville.id,
            routeText: "Via Hull; then Neville Hill",
          },
        });
        await db.workingDefinition.update({
          where: { id: f.ws[2].id },
          data: { startStationId: neville.id },
        });
        const type = await db.carriageType.create({ data: { name: "Third" } });
        const formation = await db.formation.create({
          data: {
            name: "Four",
            completeness: "Known",
            members: { create: { typeId: type.id, quantity: 4 } },
          },
        });
        for (const w of f.ws)
          await db.workingDefinition.update({
            where: { id: w.id },
            data: { formationId: formation.id },
          });
        for (const w of f.ws.slice(0, 2))
          await db.specialInstruction.create({
            data: { workingId: w.id, text: "SF attached", weekdays: [] },
          });
        const r = await call("POST", "/analysis", {
          periodId: f.period.id,
          start: "1939-01-02",
          weeks: 4,
        });
        assert.equal(r.statusCode, 201, r.body);
        const result = await call(
          "POST",
          `/analysis/${r.json().id}/chains`,
          {},
        );
        assert.equal(result.statusCode, 200, result.body);
        const chains = result.json();
        assert.equal(chains.length, 1);
        assert.equal(chains[0].snapshot.nodes.length, 28);
        assert.equal(chains[0].snapshot.repeatDays, 7);
        assert.deepEqual(
          chains[0].snapshot.nodes
            .slice(0, 7)
            .map((n: any) => n.working.diagram.number),
          ["262", "262", "262", "262", "262", "262", "822A"],
        );
        assert.equal(
          chains[0].snapshot.nodes[6].working.instructions.length,
          0,
        );
        const count = await db.chainProposal.count();
        await call("POST", `/analysis/${r.json().id}/chains`, {});
        assert.equal(await db.chainProposal.count(), count);
        const saved = await call("POST", `/chains/${chains[0].id}/save`, {
          name: "Synthetic weekly stock",
          reason: "Reviewed synthetic source",
          acknowledge: true,
          locked: true,
        });
        assert.equal(saved.statusCode, 201, saved.body);
        assert.equal(await db.physicalSet.count(), 1);
        assert.equal(
          await db.rotationAssignment.count({ where: { active: true } }),
          28,
        );
        const before = (
          await db.savedRotation.findUniqueOrThrow({
            where: { id: saved.json().id },
          })
        ).snapshot;
        const proposals = await db.connectionProposal.findMany({
          where: { analysisId: r.json().id },
        });
        const blocked = await call(
          "POST",
          `/proposals/${proposals[0].id}/review`,
          { decision: "Rejected", reason: "Attempt changing locked research" },
        );
        assert.equal(blocked.statusCode, 409, blocked.body);
        await db.workingDefinition.update({
          where: { id: f.ws[0].id },
          data: { label: "Edited current definition" },
        });
        await call("POST", "/analysis", {
          periodId: f.period.id,
          start: "1939-01-02",
          weeks: 4,
        });
        assert.deepEqual(
          (
            await db.savedRotation.findUniqueOrThrow({
              where: { id: saved.json().id },
            })
          ).snapshot,
          before,
        );
        const second = await db.physicalSet.create({
          data: { label: "Other stock" },
        });
        const assignment = await db.rotationAssignment.findFirstOrThrow();
        const conflict = await call("POST", "/assignments", {
          physicalSetId: second.id,
          occurrenceId: assignment.occurrenceId,
          notes: "Synthetic conflict",
        });
        assert.equal(conflict.statusCode, 409);
      },
    );
    await t.test(
      "14-day rotation retains distinct weekly occurrences",
      async () => {
        const nums = Array.from({ length: 14 }, (_, i) => "W" + i),
          f = await fixture(
            nums,
            nums.map((_, i) => [i % 7]),
            nums.map((_, i) => Math.floor(i / 7)),
          );
        const r = await call("POST", "/analysis", {
          periodId: f.period.id,
          start: "1939-01-02",
          weeks: 6,
        });
        const c = await call("POST", `/analysis/${r.json().id}/chains`, {});
        assert.equal(c.statusCode, 200, c.body);
        assert.equal(c.json().length, 1);
        assert.equal(c.json()[0].snapshot.repeatDays, 14);
        assert.equal(c.json()[0].snapshot.nodes.length, 42);
      },
    );
    await t.test(
      "Three-day open sequence is not declared repeating",
      async () => {
        const f = await fixture(["A", "B", "C"], [[0], [1], [2]]);
        await db.nextWorkingReference.deleteMany({
          where: { workingId: f.ws[2].id },
        });
        const r = await call("POST", "/analysis", {
          periodId: f.period.id,
          start: "1939-01-02",
          weeks: 2,
        });
        const c = await call("POST", `/analysis/${r.json().id}/chains`, {});
        assert.equal(c.statusCode, 200, c.body);
        assert.equal(c.json()[0].snapshot.nodes.length, 3);
        assert.equal(c.json()[0].snapshot.repeatDays, null);
      },
    );
    await t.test(
      "Missing continuations retain alternatives without arbitrary selection",
      async () => {
        const f = await fixture(["UNKNOWN", "CAND1", "CAND2"], [[0], [1], [1]]);
        await db.nextWorkingReference.deleteMany({
          where: { workingId: { in: f.ws.map((w) => w.id) } },
        });
        const r = await call("POST", "/analysis", {
          periodId: f.period.id,
          start: "1939-01-02",
          weeks: 2,
        });
        const view = (await call("GET", "/analysis/" + r.json().id)).json();
        const source = view.proposals.filter(
          (p: any) =>
            p.from.workingId === f.ws[0].id &&
            p.from.date.startsWith("1939-01-02"),
        );
        assert.equal(source.length, 2);
        assert.ok(
          source.every((p: any) => p.kind === "CANDIDATE" && !p.approved),
        );
        const generated = (
          await call("POST", `/analysis/${r.json().id}/chains`, {})
        ).json();
        assert.ok(
          generated
            .filter((p: any) => p.snapshot.nodes[0].workingId === f.ws[0].id)
            .every((p: any) => p.snapshot.nodes.length === 1),
        );
      },
    );
    await t.test(
      "Saturday-only stock is stored between dated uses",
      async () => {
        const f = await fixture(["SAT"], [[5]]);
        await db.nextWorkingReference.updateMany({
          where: { workingId: f.ws[0].id },
          data: {
            kind: "STABLED",
            offsetDays: 7,
            storageStationId: f.station.id,
          },
        });
        const r = await call("POST", "/analysis", {
          periodId: f.period.id,
          start: "1939-01-02",
          weeks: 4,
        });
        const c = await call("POST", `/analysis/${r.json().id}/chains`, {});
        assert.equal(c.json().length, 1);
        assert.equal(
          c.json()[0].snapshot.links[0].storage.stationName,
          "Scarborough",
        );
      },
    );
  } finally {
    await app.close();
  }
});
