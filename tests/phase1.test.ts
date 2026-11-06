import { test } from "node:test";
import pg from "pg";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildApp } from "../server/app.js";
import { migrate } from "../server/migrate.js";

const url = process.env.TEST_DATABASE_URL;
test("Phase 1 persistence, source integrity, entry, review and isolation", async (t) => {
  assert.ok(
    url,
    "Set TEST_DATABASE_URL to a disposable dedicated test database",
  );
  assert.match(
    new URL(url!).pathname,
    /_test$/,
    "Test database name must end in _test",
  );
  await migrate(url);
  await migrate(url);
  const cleanup = async () => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      await c.query(
        'TRUNCATE TABLE \"Document\", \"Station\", \"Diagram\", \"AuditEvent\" CASCADE',
      );
    } finally {
      await c.end();
    }
  };
  await cleanup();
  const storage = await mkdtemp(path.join(tmpdir(), "lner-test-"));
  let instance = await buildApp({
    databaseUrl: url,
    storageDir: storage,
    serveWeb: false,
  });
  const call = async (
    method: any,
    url: string,
    payload?: Record<string, unknown>,
  ) =>
    instance.app.inject({
      method,
      url: "/api" + url,
      ...(payload === undefined ? {} : { payload }),
    });
  let docId = "",
    fileId = "",
    pageId = "",
    diagramId = "",
    stationId = "";
  try {
    await t.test(
      "rejects invalid PDF without creating source records",
      async () => {
        const boundary = "lner-invalid";
        const payload = `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nInvalid\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="bad.pdf"\r\nContent-Type: application/pdf\r\n\r\nnot a pdf\r\n--${boundary}--\r\n`;
        const r = await instance.app.inject({
          method: "POST",
          url: "/api/documents",
          headers: {
            "content-type": `multipart/form-data; boundary=${boundary}`,
          },
          payload,
        });
        assert.equal(r.statusCode, 400);
      },
    );
    const pdf = await PDFDocument.create();
    pdf.addPage([300, 400]);
    pdf.addPage([300, 400]);
    const bytes = Buffer.from(await pdf.save());
    await t.test(
      "uploads original PDF and creates stable one-based page records",
      async () => {
        const boundary = "lner-source";
        const payload = Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nSynthetic test source (not historical)\r\n--${boundary}\r\nContent-Disposition: form-data; name="sourceDate"\r\n\r\n1939\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fixture.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
          ),
          bytes,
          Buffer.from(`\r\n--${boundary}--\r\n`),
        ]);
        const r = await instance.app.inject({
          method: "POST",
          url: "/api/documents",
          headers: {
            "content-type": `multipart/form-data; boundary=${boundary}`,
          },
          payload,
        });
        assert.equal(r.statusCode, 201, r.body);
        const d = r.json();
        docId = d.id;
        fileId = d.files[0].id;
        pageId = d.files[0].pages[0].id;
        assert.equal(d.files[0].pageCount, 2);
        assert.deepEqual(
          (await call("GET", "/files/" + fileId)).rawPayload,
          bytes,
        );
        assert.equal(
          (await call("PATCH", "/pages/" + pageId, { printedLabel: "96" }))
            .statusCode,
          200,
        );
      },
    );
    await t.test(
      "saves incomplete diagrams without assuming physical stock",
      async () => {
        const r = await call("POST", "/diagrams", {});
        assert.equal(r.statusCode, 201, r.body);
        diagramId = r.json().id;
        const d = (await call("GET", "/diagrams/" + diagramId)).json();
        assert.equal(d.publishedNumber, null);
        assert.equal(await instance.db.operationAssignment.count(), 0);
      },
    );
    await t.test(
      "duplicate published numbers stay distinct across sources",
      async () => {
        const a = await call("POST", "/diagrams", {
          publishedNumber: "015",
          documentId: docId,
        });
        const b = await call("POST", "/diagrams", { publishedNumber: "015" });
        assert.equal(a.statusCode, 201);
        assert.equal(b.statusCode, 201);
        assert.notEqual(a.json().id, b.json().id);
      },
    );
    await t.test(
      "invalid enums and nonexistent references cannot corrupt research data",
      async () => {
        assert.equal(
          (await call("POST", "/diagrams", { operatingDays: ["Inventedday"] }))
            .statusCode,
          400,
        );
        assert.equal(
          (
            await call("POST", "/diagrams", {
              documentId: "00000000-0000-4000-8000-000000000000",
            })
          ).statusCode,
          409,
        );
      },
    );
    await t.test(
      "movement times and edits persist without inferred overnight offsets",
      async () => {
        stationId = (
          await call("POST", "/stations", {
            name: "Synthetic test station",
            aliases: ["Synthetic alias"],
          })
        ).json().id;
        const r = await call("POST", "/diagrams/" + diagramId + "/movements", {
          sequence: 1,
          originId: stationId,
          departureMinutes: 1430,
          arrivalMinutes: 1460,
          trainNumber: "001",
        });
        assert.equal(r.statusCode, 201, r.body);
        const id = r.json().id;
        assert.equal(
          (
            await call("PUT", "/movements/" + id, {
              sequence: 1,
              originId: stationId,
              departureMinutes: 1430,
              arrivalMinutes: 1465,
              trainNumber: "001",
            })
          ).statusCode,
          200,
        );
        assert.equal(
          (await call("GET", "/diagrams/" + diagramId)).json().movements[0]
            .arrivalMinutes,
          1465,
        );
        assert.equal(
          (
            await call("POST", "/diagrams/" + diagramId + "/movements", {
              sequence: 1,
            })
          ).statusCode,
          409,
        );
      },
    );
    await t.test(
      "optimistic diagram revision protects against stale saves",
      async () => {
        assert.equal(
          (
            await call("PUT", "/diagrams/" + diagramId, {
              revision: 3,
              title: "Corrected research title",
            })
          ).statusCode,
          200,
        );
        assert.equal(
          (
            await call("PUT", "/diagrams/" + diagramId, {
              revision: 1,
              title: "Stale title",
            })
          ).statusCode,
          404,
        );
        assert.equal(
          (await call("GET", "/diagrams/" + diagramId)).json().title,
          "Corrected research title",
        );
      },
    );
    await t.test(
      "verification requires evidence and maintains audit history",
      async () => {
        assert.equal(
          (
            await call("POST", "/diagrams/" + diagramId + "/verification", {
              status: "Verified against source",
              notes: "Check",
            })
          ).statusCode,
          400,
        );
        assert.equal(
          (
            await call("POST", "/diagrams/" + diagramId + "/evidence", {
              pageId,
              originalText: "Buttons Ambo",
              transcription: "Huttons Ambo",
              notes: "Synthetic OCR example, not historical evidence",
            })
          ).statusCode,
          201,
        );
        assert.equal(
          (
            await call("POST", "/diagrams/" + diagramId + "/verification", {
              status: "Verified against source",
              notes: "Synthetic source checked for test",
            })
          ).statusCode,
          200,
        );
        const d = (await call("GET", "/diagrams/" + diagramId)).json();
        assert.equal(d.evidence[0].originalText, "Buttons Ambo");
        assert.equal(d.evidence[0].page.printedLabel, "96");
        assert.equal(d.verifications.length, 1);
        assert.ok(
          (await call("GET", "/diagrams/" + diagramId + "/history")).json()
            .length >= 5,
        );
      },
    );
    await t.test("cross-site browser writes are rejected", async () => {
      const r = await instance.app.inject({
        method: "POST",
        url: "/api/diagrams",
        headers: { origin: "https://other-site.example" },
        payload: {},
      });
      assert.equal(r.statusCode, 403);
    });
    await t.test(
      "sources and research survive application restart unchanged",
      async () => {
        await instance.app.close();
        instance = await buildApp({
          databaseUrl: url,
          storageDir: storage,
          serveWeb: false,
        });
        assert.deepEqual(
          (await call("GET", "/files/" + fileId)).rawPayload,
          bytes,
        );
        const d = (await call("GET", "/diagrams/" + diagramId)).json();
        assert.equal(d.status, "Verified against source");
        assert.equal(d.movements[0].trainNumber, "001");
      },
    );
  } finally {
    await instance.app.close();
    await cleanup();
    await rm(storage, { recursive: true, force: true });
  }
});
