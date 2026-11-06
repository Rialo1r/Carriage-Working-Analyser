import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "../server/app.js";
import { migrate } from "../server/migrate.js";
import { processOcrJob } from "../server/ocr.js";
let instance: Awaited<ReturnType<typeof buildApp>>, storage: string;
let diagrams: any[] = [];
test.beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL!;
  assert.match(new URL(url).pathname, /_test$/);
  await migrate(url);
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query(
    'TRUNCATE "Document","Station","Diagram","AuditEvent","AnalysisScenario","Formation","PhysicalSet","CarriageType","ImportBatch","ExportBatch","CorrectionRule" CASCADE',
  );
  await c.end();
  storage = await mkdtemp(path.join(tmpdir(), "lner-research-browser-"));
  instance = await buildApp({ databaseUrl: url, storageDir: storage });
  const { db } = instance;
  const pdf = await PDFDocument.create(),
    p = pdf.addPage([600, 400]),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  p.drawText("SYNTHETIC YORK SCARBOROUGH 123", {
    x: 20,
    y: 300,
    size: 24,
    font,
  });
  await writeFile(path.join(storage, "fixture.pdf"), await pdf.save());
  const source = await db.document.create({
    data: {
      title: "SYNTHETIC roster",
      sourceDate: "1939",
      files: {
        create: {
          storageKey: "fixture.pdf",
          originalName: "fixture.pdf",
          sha256: "test",
          size: 10,
          pageCount: 1,
          pages: { create: { pdfPage: 1 } },
        },
      },
    },
    include: { files: { include: { pages: true } } },
  });
  const stations = await Promise.all(
    ["York", "Scarborough", "Huttons Ambo"].map((name) =>
      db.station.create({ data: { name } }),
    ),
  );
  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  for (let i = 0; i < 3; i++)
    diagrams.push(
      await db.diagram.create({
        data: {
          publishedNumber: String(15 + i),
          documentId: source.id,
          operatingDays: days,
          requirements: { create: { typeCode: "BT", quantity: 2 } },
          movements: {
            create: {
              sequence: 1,
              trainNumber: String(123 + i),
              originId: stations[i].id,
              destinationId: stations[(i + 1) % 3].id,
              departureMinutes: 480,
              arrivalMinutes: 600,
            },
          },
          evidence: {
            create: {
              pageId: source.files[0].pages[0].id,
              originalText: "SYNTHETIC test evidence",
            },
          },
        },
        include: { movements: true },
      }),
    );
  const tt = await db.document.create({
    data: { title: "SYNTHETIC timetable", sourceDate: "1937" },
  });
  await db.trainService.create({
    data: {
      documentId: tt.id,
      publishedNumber: "123",
      operatingDays: days,
      entries: {
        create: [
          { sequence: 1, stationId: stations[0].id, departureMinutes: 490 },
          { sequence: 2, stationId: stations[1].id, arrivalMinutes: 610 },
        ],
      },
    },
  });
  await instance.app.listen({ port: 3100, host: "127.0.0.1" });
});
test.afterAll(async () => {
  await instance?.app.close();
  if (storage) await rm(storage, { recursive: true, force: true });
});
test("OCR review, approved multi-day rotation, cross-year timetable review and frozen export in browser", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "OCR", exact: true }).click();
  await page.getByLabel("OCR source page").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Queue OCR", exact: true }).click();
  await expect.poll(() => instance.db.ocrJob.count()).toBe(1);
  await processOcrJob(instance.db, storage);
  await page
    .getByRole("button", { name: "Review transcription", exact: true })
    .click();
  await page
    .getByLabel("Corrected transcription", { exact: true })
    .fill("Manually checked synthetic YORK text");
  await page
    .getByLabel("Reason for revision")
    .fill("Synthetic browser verification");
  await page
    .getByRole("button", { name: "Save new transcription revision" })
    .click();
  await expect.poll(() => instance.db.transcriptionRevision.count()).toBe(1);
  await page.getByRole("button", { name: "Rotations", exact: true }).click();
  for (let i = 15; i < 18; i++)
    await page.getByRole("checkbox", { name: String(i), exact: true }).check();
  await page.getByLabel("Scenario name").fill("Synthetic browser rotation");
  await page.getByLabel("First date").fill("1939-07-03");
  await page.getByLabel("Last date").fill("1939-08-14");
  await page
    .getByLabel("Source periods, calendar assumptions and uncertainty")
    .fill("Synthetic daily diagrams");
  await page
    .getByRole("button", { name: "Create analysis scenario", exact: true })
    .click();
  await page
    .getByLabel("Open rotation scenario")
    .selectOption({ label: "Synthetic browser rotation" });
  await page
    .getByRole("button", { name: "Suggest next-day connections" })
    .click();
  await expect(page.locator(".connection")).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const card = page.locator(".connection").nth(i);
    await card.getByText("Review this connection", { exact: true }).click();
    await card.getByLabel("Research decision").selectOption("Approved");
    await card
      .getByLabel("Review rationale / uncertainty")
      .fill("Synthetic approved hypothesis");
    await card
      .getByRole("button", { name: "Record connection decision", exact: true })
      .click();
    await expect(
      card.locator(".badge").filter({ hasText: /^Approved$/ }),
    ).toBeVisible();
  }
  await page
    .getByLabel("Rotation name", { exact: true })
    .fill("Synthetic browser circuit");
  await page
    .getByLabel("Starting diagram", { exact: true })
    .selectOption(diagrams[0].id);
  await page.getByLabel("Rotation research notes").fill("No historical claim");
  await page
    .getByRole("button", {
      name: "Build rotation from approved links",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Repeats every 3 days within the checked scenario", {
      exact: false,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/rotation-analysis.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Timetable", exact: true }).click();
  await page
    .getByLabel("Cross-reference movement")
    .selectOption(diagrams[0].movements[0].id);
  await expect(
    page.getByText(/Different sources: carriage 1939; timetable 1937/),
  ).toBeVisible();
  await page.getByLabel("Match decision").selectOption("Rejected");
  await page
    .getByLabel("Evidence and cross-period reasoning")
    .fill("Same number alone is insufficient");
  await page
    .getByRole("button", { name: "Review timetable match", exact: true })
    .click();
  await expect(
    page.getByText("Decision: Rejected", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Export Centre", exact: true })
    .click();
  await page
    .getByRole("checkbox", {
      name: "Verified / ready-for-export diagrams only",
    })
    .uncheck();
  await page
    .getByRole("button", { name: "Preview export", exact: true })
    .click();
  await expect(page.getByText("3 diagrams · 1 rotations")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download exactly this preview" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
