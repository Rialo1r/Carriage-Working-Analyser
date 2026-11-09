import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { onCalendar, targetDate, formationCount } from "../server/calendar.js";
test("Phase 1 manual working data, exact references and dated weekly timetable", async (t) => {
  const { app, db } = await setup();
  const call = (method: any, path: string, payload?: any) =>
    app.inject({
      method,
      url: "/api" + path,
      ...(payload === undefined ? {} : { payload }),
    });
  let periodId = "",
    diagramId = "",
    workingId = "",
    satId = "",
    sunId = "",
    scarborough = "",
    hull = "",
    neville = "",
    formationId = "",
    setId = "",
    workingRevision = 1;
  const all = [0, 1, 2, 3, 4, 5, 6];
  try {
    await t.test(
      "catalogue and physical identities are independent of published numbers",
      async () => {
        periodId = (
          await call("POST", "/periods", {
            name: "SYNTHETIC 1939 test period",
            startDate: "1939-01-01",
            endDate: "1939-12-31",
          })
        ).json().id;
        diagramId = (
          await call("POST", "/diagrams", { periodId, number: "262" })
        ).json().id;
        scarborough = (
          await call("POST", "/stations", { name: "Scarborough" })
        ).json().id;
        hull = (await call("POST", "/stations", { name: "Hull" })).json().id;
        neville = (
          await call("POST", "/stations", { name: "Neville Hill" })
        ).json().id;
        assert.equal(await db.physicalSet.count(), 0);
        const a = (
          await call("POST", "/physical-sets", { label: "Synthetic stock" })
        ).json();
        setId = a.id;
        assert.match(a.code, /^CS-\d{4,}$/);
        assert.notEqual(a.code, "262");
        assert.equal(
          (
            await call("POST", "/physical-sets", {
              serial: 999,
              label: "Invalid override",
            })
          ).statusCode,
          400,
        );
        const other = (
          await call("POST", "/periods", { name: "SYNTHETIC 1937 period" })
        ).json();
        assert.equal(
          (
            await call("POST", "/diagrams", {
              periodId: other.id,
              number: "262",
            })
          ).statusCode,
          201,
        );
      },
    );
    await t.test(
      "known and incomplete formation totals do not invent quantities",
      async () => {
        const type = (
          await call("POST", "/types", { name: "Brake Third", code: "BT" })
        ).json();
        const f = await call("POST", "/formations", {
          name: "Synthetic four-coach formation",
          completeness: "Known",
          members: [{ typeId: type.id, quantity: 4, position: 1 }],
        });
        assert.equal(f.statusCode, 201, f.body);
        formationId = f.json().id;
        assert.equal(f.json().count.total, 4);
        assert.equal(
          formationCount({
            completeness: "Incomplete",
            members: [{ quantity: 4 }, { quantity: null }],
          }).total,
          null,
        );
        assert.equal(
          (
            await call("POST", "/formations", {
              name: "Invalid known formation",
              completeness: "Known",
              members: [{ quantity: null }],
            })
          ).statusCode,
          400,
        );
        assert.equal(
          (
            await call("POST", "/formations", {
              name: "Invalid identified quantity",
              completeness: "Known",
              members: [{ quantity: 2, vehicleNumber: "SYNTHETIC" }],
            })
          ).statusCode,
          400,
        );
      },
    );
    const base = () => ({
      diagramId,
      startStationId: scarborough,
      finishStationId: scarborough,
      startMinutes: 480,
      finishMinutes: 1080,
      formationId,
      routeText: "Via Hull",
      routeCalls: [{ stationId: hull, sequence: 1 }],
      calendar: { weekdays: [0, 1, 2, 3, 4] },
      instructions: [{ weekdays: [], text: "SYNTHETIC SF attached" }],
      sources: [
        { title: "SYNTHETIC fixture — not historical evidence", page: "96" },
      ],
    });
    await t.test(
      "one weekday definition saves once and allows Saturday/Sunday variants",
      async () => {
        const weekday = await call("POST", "/workings", {
          ...base(),
          label: "Monday–Friday",
        });
        assert.equal(weekday.statusCode, 201, weekday.body);
        workingId = weekday.json().id;
        const sat = await call("POST", "/workings", {
          ...base(),
          label: "Saturday",
          finishStationId: neville,
          calendar: { weekdays: [5] },
        });
        assert.equal(sat.statusCode, 201, sat.body);
        satId = sat.json().id;
        const sundayDiagram = (
          await call("POST", "/diagrams", { periodId, number: "822A" })
        ).json();
        const sun = await call("POST", "/workings", {
          ...base(),
          diagramId: sundayDiagram.id,
          label: "Sunday",
          startStationId: neville,
          calendar: { weekdays: [6] },
          instructions: [{ weekdays: [], text: "SYNTHETIC no SF" }],
        });
        assert.equal(sun.statusCode, 201, sun.body);
        sunId = sun.json().id;
        assert.equal(await db.workingDefinition.count(), 3);
        assert.equal(await db.rotationAssignment.count(), 0);
      },
    );
    await t.test(
      "ambiguous diagram numbers return alternatives; no target is selected automatically",
      async () => {
        const c = await call(
          "GET",
          "/working-candidates?number=262&periodId=" + periodId,
        );
        assert.equal(c.json().length, 2);
        const unresolved = await call(
          "PUT",
          "/workings/" + workingId + "/next",
          {
            reason: "Retain unresolved source reference",
            rules: [
              {
                weekday: 0,
                kind: "TARGET",
                enteredNumber: "262",
                offsetDays: 1,
              },
            ],
          },
        );
        assert.equal(unresolved.statusCode, 200, unresolved.body);
        assert.equal(unresolved.json().nextRules[0].targetWorkingId, null);
        const save = await call("PUT", "/workings/" + workingId + "/next", {
          reason: "Choose exact weekday variant",
          rules: [0, 1, 2, 3]
            .map((weekday) => ({
              weekday,
              kind: "TARGET",
              targetWorkingId: workingId,
              enteredNumber: "262",
              offsetDays: 1,
            }))
            .concat([
              {
                weekday: 4,
                kind: "TARGET",
                targetWorkingId: satId,
                enteredNumber: "262",
                offsetDays: 1,
              },
            ]),
        });
        assert.equal(save.statusCode, 200, save.body);
        await call("PUT", "/workings/" + satId + "/next", {
          reason: "Synthetic Sunday continuation",
          rules: [
            {
              weekday: 5,
              kind: "TARGET",
              targetWorkingId: sunId,
              offsetDays: 1,
            },
          ],
        });
        await call("PUT", "/workings/" + sunId + "/next", {
          reason: "Synthetic following Monday continuation",
          rules: [
            {
              weekday: 6,
              kind: "TARGET",
              targetWorkingId: workingId,
              targetWeekday: 0,
            },
          ],
        });
      },
    );
    await t.test(
      "two-week expansion is idempotent and keeps each Monday distinct",
      async () => {
        const materialize = () =>
          call("POST", "/timetable/materialize", {
            start: "1939-07-03",
            weeks: 2,
          });
        assert.equal((await materialize()).statusCode, 200);
        const count = await db.workingOccurrence.count();
        assert.equal((await materialize()).statusCode, 200);
        assert.equal(await db.workingOccurrence.count(), count);
        const rows = (
          await call("GET", "/timetable?start=1939-07-03&weeks=2")
        ).json().occurrences;
        assert.equal(rows.length, 14);
        assert.equal(
          rows.filter((o: any) => o.working.diagram.number === "262").length,
          12,
        );
        const mon = rows.find((o: any) => o.date.startsWith("1939-07-03")),
          nextMon = rows.find((o: any) => o.date.startsWith("1939-07-10"));
        assert.notEqual(mon.id, nextMon.id);
        const sunday = rows.find((o: any) => o.date.startsWith("1939-07-09"));
        assert.equal(sunday.outgoing.toId, nextMon.id);
        assert.ok(
          rows
            .filter(
              (o: any) =>
                o.date.startsWith("1939-07-0") &&
                !o.date.startsWith("1939-07-09"),
            )
            .every((o: any) =>
              o.instructions.some(
                (i: any) => i.text === "SYNTHETIC SF attached",
              ),
            ),
        );
        assert.equal(sunday.instructions[0].text, "SYNTHETIC no SF");
        assert.ok(
          rows.every((o: any) => o.connectionStatus.startsWith("Unverified")),
        );
      },
    );
    await t.test(
      "manual assignment is atomic, keeps physical ID stable and never silently reallocates",
      async () => {
        const occurrence = await db.workingOccurrence.findUniqueOrThrow({
          where: {
            workingId_date: { workingId, date: new Date("1939-07-03") },
          },
        });
        const other = (
          await call("POST", "/physical-sets", {
            label: "Other synthetic stock",
          })
        ).json();
        const results = await Promise.all([
          call("POST", "/assignments", {
            physicalSetId: setId,
            occurrenceId: occurrence.id,
            notes: "Manual synthetic allocation",
          }),
          call("POST", "/assignments", {
            physicalSetId: other.id,
            occurrenceId: occurrence.id,
            notes: "Competing allocation",
          }),
        ]);
        assert.deepEqual(results.map((r) => r.statusCode).sort(), [201, 409]);
        assert.equal(
          await db.rotationAssignment.count({
            where: { occurrenceId: occurrence.id, active: true },
          }),
          1,
        );
        const assigned = await db.rotationAssignment.findFirstOrThrow({
          where: { occurrenceId: occurrence.id, active: true },
        });
        assert.equal(
          (
            await call("DELETE", "/assignments/" + assigned.id, {
              reason: "Remove manual test allocation",
            })
          ).statusCode,
          200,
        );
        assert.equal(
          (
            await db.rotationAssignment.findUniqueOrThrow({
              where: { id: assigned.id },
            })
          ).active,
          false,
        );
        assert.equal(
          (
            await call("POST", "/assignments", {
              physicalSetId: setId,
              occurrenceId: occurrence.id,
              notes: "Manual reallocation",
            })
          ).statusCode,
          201,
        );
        assert.equal(
          await db.rotationAssignment.count({
            where: { occurrenceId: occurrence.id, active: true },
          }),
          1,
        );
      },
    );
    await t.test(
      "edits, sources, exceptions and stale revisions are preserved correctly",
      async () => {
        const before = (await call("GET", "/workings/" + workingId)).json();
        workingRevision = before.revision;
        const edited = await call("PUT", "/workings/" + workingId, {
          ...base(),
          sources: [],
          label: "Corrected weekday working",
          revision: workingRevision,
          reason: "Synthetic manual correction",
          calendar: {
            weekdays: [0, 1, 2, 3, 4],
            exceptions: [
              {
                date: "1939-07-04",
                operates: false,
                notes: "Synthetic exception",
              },
            ],
          },
        });
        assert.equal(edited.statusCode, 200, edited.body);
        assert.equal(edited.json().sources.length, 1);
        assert.equal(
          (
            await call("PUT", "/workings/" + workingId, {
              ...base(),
              sources: [],
              revision: workingRevision,
              reason: "Stale save",
            })
          ).statusCode,
          409,
        );
        const history = (
          await call("GET", "/history?entityId=" + workingId)
        ).json();
        const event = history.find((e: any) => e.action === "Edited");
        assert.equal(event.before.label, "Monday–Friday");
        assert.equal(event.after.label, "Corrected weekday working");
        assert.equal(
          onCalendar(edited.json().calendar, new Date("1939-07-04")),
          false,
        );
        const dbSet = await db.physicalSet.findUniqueOrThrow({
          where: { id: setId },
        });
        assert.ok(dbSet.serial > 0);
        assert.equal(
          (await call("GET", "/workings/" + workingId)).json().startStationId,
          scarborough,
        );
      },
    );
    await t.test(
      "stabling, same-day and overnight references retain explicit dates without continuity claims",
      async () => {
        assert.equal(
          targetDate(new Date("1939-07-09"), { targetWeekday: 0 })
            ?.toISOString()
            .slice(0, 10),
          "1939-07-10",
        );
        assert.equal(
          targetDate(new Date("1939-07-03"), { offsetDays: 0 })
            ?.toISOString()
            .slice(0, 10),
          "1939-07-03",
        );
        const w = await call("POST", "/workings", {
          diagramId,
          label: "Synthetic overnight",
          startMinutes: 1380,
          finishMinutes: 30,
          finishDayOffset: 1,
          calendar: { weekdays: [6] },
        });
        assert.equal(w.statusCode, 201, w.body);
        assert.equal(w.json().finishDayOffset, 1);
        const s = await call("PUT", "/workings/" + w.json().id + "/next", {
          reason: "Synthetic stabling instruction",
          rules: [
            {
              weekday: 6,
              kind: "STABLED",
              offsetDays: 2,
              notes: "Remain stabled; no transfer inferred",
            },
          ],
        });
        assert.equal(s.statusCode, 200);
        assert.equal(s.json().nextRules[0].targetWorkingId, null);
        assert.equal(await db.physicalSet.count(), 2);
      },
    );
    await t.test(
      "day-specific formation variations and changes remain manual records",
      async () => {
        const u = (
          await call("POST", "/formations", {
            name: "Unknown Sunday composition",
            completeness: "Unknown",
            members: [],
          })
        ).json();
        assert.equal(
          (
            await call("PUT", "/workings/" + sunId + "/variations", {
              weekday: 6,
              formationId: u.id,
              notes: "Synthetic Sunday variation",
            })
          ).statusCode,
          200,
        );
        assert.equal(
          (
            await call("POST", "/workings/" + satId + "/changes", {
              weekdays: [5],
              action: "Detach",
              stage: "Finish",
              quantity: 1,
              notes: "Synthetic change; no compatibility calculation",
            })
          ).statusCode,
          201,
        );
        const before = await db.rotationAssignment.count();
        await call("POST", "/timetable/materialize", {
          start: "1939-07-03",
          weeks: 1,
        });
        const data = (
          await call("GET", "/timetable?start=1939-07-03&weeks=1")
        ).json();
        const sun = data.occurrences.find((o: any) =>
          o.date.startsWith("1939-07-09"),
        );
        assert.equal(sun.formationCount.total, null);
        assert.equal(await db.rotationAssignment.count(), before);
      },
    );
    await t.test(
      "unknown values, invalid input and cross-site writes are handled without inference",
      async () => {
        assert.equal(
          (
            await call("POST", "/workings", {
              diagramId,
              calendar: { weekdays: [] },
            })
          ).statusCode,
          201,
        );
        assert.equal(
          (
            await call("POST", "/workings", {
              diagramId,
              startMinutes: 1500,
              calendar: { weekdays: [] },
            })
          ).statusCode,
          400,
        );
        assert.equal(
          (
            await app.inject({
              method: "POST",
              url: "/api/physical-sets",
              headers: { origin: "https://outside.example" },
              payload: { label: "Rejected" },
            })
          ).statusCode,
          403,
        );
        assert.equal((await call("GET", "/ocr")).statusCode, 404);
        assert.equal(
          (await call("POST", "/generate-rotations", {})).statusCode,
          404,
        );
      },
    );
  } finally {
    await app.close();
  }
});
