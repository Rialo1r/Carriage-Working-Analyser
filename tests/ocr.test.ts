import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { migrate } from "../server/migrate.js";
import { processOcrJob } from "../server/ocr.js";
import { buildApp } from "../server/app.js";
test("Phase 2 real local OCR, crop, revisions, correction suggestions and rerun isolation", async () => {
  const url = process.env.TEST_DATABASE_URL!;
  assert.ok(url);
  assert.match(new URL(url).pathname, /_test$/);
  await migrate(url);
  const storage = await mkdtemp(path.join(tmpdir(), "lner-ocr-test-"));
  const { app, db } = await buildApp({
    databaseUrl: url,
    storageDir: storage,
    serveWeb: false,
  });
  try {
    const pdf = await PDFDocument.create();
    const p = pdf.addPage([600, 300]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    p.drawText("SYNTHETIC TEST YORK SCARBOROUGH 123", {
      x: 30,
      y: 200,
      size: 20,
      font,
    });
    const key = randomUUID() + ".pdf";
    await writeFile(path.join(storage, key), await pdf.save());
    const doc = await db.document.create({
      data: {
        title: "Synthetic OCR test",
        files: {
          create: {
            storageKey: key,
            originalName: "test.pdf",
            sha256: "test",
            size: 100,
            pageCount: 1,
            pages: { create: { pdfPage: 1 } },
          },
        },
      },
      include: { files: { include: { pages: true } } },
    });
    const pageId = doc.files[0].pages[0].id;
    const queued = await app.inject({
      method: "POST",
      url: "/api/ocr",
      payload: { pageId, region: { x: 0, y: 0, width: 1, height: 0.6 } },
    });
    assert.equal(queued.statusCode, 201);
    assert.equal(await processOcrJob(db, storage), true);
    const job = await db.ocrJob.findUniqueOrThrow({
      where: { id: queued.json().id },
    });
    assert.equal(job.status, "Completed", job.error ?? "");
    assert.match(job.rawText!, /YORK/);
    assert.ok(job.confidence! > 0);
    assert.ok(job.imageKey);
    const revision = await app.inject({
      method: "POST",
      url: `/api/ocr/${job.id}/revisions`,
      payload: {
        text: "Manual YORK correction",
        notes: "Checked synthetic source",
      },
    });
    assert.equal(revision.statusCode, 201);
    await db.correctionRule.create({
      data: {
        original: "YORK",
        replacement: "York",
        notes: "Synthetic test rule",
      },
    });
    const sug = await app.inject({ url: `/api/ocr/${job.id}/suggestions` });
    assert.ok(sug.json().some((s: any) => s.replacement === "York"));
    await db.ocrJob.create({ data: { pageId } });
    assert.equal(await processOcrJob(db, storage), true);
    assert.equal(
      (
        await db.transcriptionRevision.findUniqueOrThrow({
          where: { id: revision.json().id },
        })
      ).text,
      "Manual YORK correction",
    );
    const result = await app.inject({ url: "/api/source-search?q=correction" });
    assert.ok(result.json().some((j: any) => j.id === job.id));
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/ocr",
          payload: {
            pageId,
            region: { x: 0.9, y: 0, width: 0.2, height: 0.3 },
          },
        })
      ).statusCode,
      400,
    );
  } finally {
    await app.close();
    await rm(storage, { recursive: true, force: true });
  }
});
