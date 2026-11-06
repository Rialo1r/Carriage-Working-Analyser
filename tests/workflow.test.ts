import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../server/app.js";
import { migrate } from "../server/migrate.js";
test("Reviewed rotations persist decisions, require confirmation evidence and block stale conflicts", async () => {
  const url = process.env.TEST_DATABASE_URL!;
  assert.match(new URL(url).pathname, /_test$/);
  await migrate(url);
  const { app, db } = await buildApp({ databaseUrl: url, serveWeb: false });
  try {
    const doc = await db.document.create({
      data: {
        title: "Synthetic rotation workflow",
        sourceDate: "1939",
        files: {
          create: {
            originalName: "synthetic.pdf",
            storageKey: "synthetic-" + Date.now() + ".pdf",
            sha256: "synthetic",
            size: 1,
            pageCount: 1,
            pages: { create: { pdfPage: 1 } },
          },
        },
      },
      include: { files: { include: { pages: true } } },
    });
    const stations = await Promise.all(
      ["A", "B", "C"].map((name) =>
        db.station.create({
          data: { name: "Synthetic " + name + " " + doc.id },
        }),
      ),
    );
    const ds = [];
    for (let i = 0; i < 3; i++)
      ds.push(
        await db.diagram.create({
          data: {
            documentId: doc.id,
            publishedNumber: "W" + i,
            operatingDays: [
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
              "Sunday",
            ],
            requirements: { create: { typeCode: "BT", quantity: 2 } },
            movements: {
              create: {
                sequence: 1,
                originId: stations[i].id,
                destinationId: stations[(i + 1) % 3].id,
                departureMinutes: 480,
                arrivalMinutes: 600,
              },
            },
            evidence: {
              create: {
                pageId: doc.files[0].pages[0].id,
                originalText:
                  "SYNTHETIC explicit continuation for testing only",
              },
            },
          },
          include: { evidence: true, movements: true },
        }),
      );
    const scenario = (
      await app.inject({
        method: "POST",
        url: "/api/scenarios",
        payload: {
          name: "Synthetic dates",
          startDate: "1939-07-03",
          endDate: "1939-08-14",
          diagramIds: ds.map((d) => d.id),
          assumptions: "Fictional daily operation",
        },
      })
    ).json();
    const analyse = () =>
      app.inject({
        method: "POST",
        url: "/api/scenarios/" + scenario.id + "/analyse",
        payload: {},
      });
    assert.equal((await analyse()).statusCode, 200);
    let links = await db.diagramTransition.findMany({
      where: { scenarioId: scenario.id },
    });
    assert.equal(links.length, 3);
    const review = (id: string, body: any) =>
      app.inject({
        method: "POST",
        url: "/api/connections/" + id + "/review",
        payload: body,
      });
    assert.equal(
      (
        await review(links[0].id, {
          decision: "Rejected",
          confidence: "Possible",
          rationale: "Synthetic rejection",
        })
      ).statusCode,
      200,
    );
    await analyse();
    assert.equal(
      (
        await db.diagramTransition.findUniqueOrThrow({
          where: { id: links[0].id },
        })
      ).decision,
      "Rejected",
    );
    for (const l of links)
      assert.equal(
        (
          await review(l.id, {
            decision: "Approved",
            confidence: "Probable",
            rationale: "Synthetic hypothesis",
          })
        ).statusCode,
        200,
      );
    assert.equal(
      (
        await review(links[0].id, {
          decision: "Approved",
          confidence: "Confirmed",
          rationale: "No citation",
        })
      ).statusCode,
      400,
    );
    const r = await app.inject({
      method: "POST",
      url: `/api/scenarios/${scenario.id}/rotations`,
      payload: {
        name: "Synthetic circuit",
        startDiagramId: ds[0].id,
        notes: "Test",
      },
    });
    assert.equal(r.statusCode, 201, r.body);
    assert.equal(r.json().repeats, true);
    assert.equal(r.json().periodDays, 3);
    const gap = await app.inject({
      method: "POST",
      url: `/api/scenarios/${scenario.id}/connections`,
      payload: {
        fromId: ds[0].id,
        toId: ds[2].id,
        dayOffset: 1,
        rationale: "Missing movement",
      },
    });
    assert.equal(gap.statusCode, 201);
    assert.equal(gap.json().kind, "Unresolved gap");
    assert.equal(
      (
        await review(gap.json().id, {
          decision: "Approved",
          confidence: "Confirmed",
          evidenceId: ds[0].evidence[0].id,
          rationale: "Cannot invent missing transfer",
        })
      ).statusCode,
      409,
    );
    await db.movement.update({
      where: { id: ds[0].movements[0].id },
      data: { arrivalMinutes: 2200 },
    });
    const stale = await db.diagramTransition.findFirstOrThrow({
      where: { scenarioId: scenario.id, fromId: ds[0].id, toId: ds[1].id },
    });
    assert.equal(
      (
        await review(stale.id, {
          decision: "Approved",
          confidence: "Probable",
          rationale: "Stale timing must fail",
        })
      ).statusCode,
      409,
    );
    const rebuild = await app.inject({
      method: "POST",
      url: `/api/scenarios/${scenario.id}/rotations`,
      payload: {
        name: "Rechecked conflict",
        startDiagramId: ds[0].id,
        notes: "Recheck",
      },
    });
    assert.equal(rebuild.json().repeats, false);
    assert.equal(rebuild.json().status, "Needs review");
  } finally {
    await app.close();
  }
});
