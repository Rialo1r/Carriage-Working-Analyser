import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "../server/app.js";
import { migrate } from "../server/migrate.js";
let instance: Awaited<ReturnType<typeof buildApp>>;
let storage: string;
test.beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url);
  assert.match(new URL(url).pathname, /_test$/);
  await migrate(url);
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query(
    'TRUNCATE TABLE "Document", "Station", "Diagram", "AuditEvent" CASCADE',
  );
  await c.end();
  storage = await mkdtemp(path.join(tmpdir(), "lner-browser-"));
  instance = await buildApp({ databaseUrl: url, storageDir: storage });
  await instance.app.listen({ host: "127.0.0.1", port: 3100 });
});
test.afterAll(async () => {
  await instance?.app.close();
  if (storage) await rm(storage, { recursive: true, force: true });
});
test("personal research workflow: upload, zoom, source citation, manual entry and tablet layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await page
    .getByLabel("Document title")
    .fill("Synthetic browser fixture — not historical");
  await page.getByLabel("Source date").fill("1939");
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]);
  pdf.addPage([300, 400]);
  const bytes = Buffer.from(await pdf.save());
  await page
    .getByLabel("Original scanned PDF")
    .setInputFiles({
      name: "fixture.pdf",
      mimeType: "application/pdf",
      buffer: bytes,
    });
  await page.getByRole("button", { name: "Upload PDF", exact: true }).click();
  await expect(page.getByText("2 pages · original preserved")).toBeVisible();
  await page.getByRole("button", { name: "View PDF", exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect
    .poll(() =>
      page.locator("canvas").evaluate((c: HTMLCanvasElement) => c.width),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "PDF page" })).toHaveValue(
    "2",
  );
  await page.getByRole("button", { name: "+", exact: true }).click();
  await expect(page.getByText("130%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stations", exact: true }).click();
  await page.getByLabel("Station name", { exact: true }).fill("York");
  await page.getByRole("button", { name: "Add station", exact: true }).click();
  await expect(page.getByText("No aliases recorded")).toBeVisible();
  await page.getByRole("button", { name: "Diagrams", exact: true }).click();
  await page.getByLabel("Published diagram/set number").fill("TEST-15");
  await page.getByLabel("Research title").fill("Synthetic manual working");
  await page.getByRole("button", { name: "Create incomplete diagram" }).click();
  await expect(
    page.getByRole("heading", { name: "Diagram TEST-15", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Published train number", { exact: true }).fill("001");
  await page
    .getByLabel("From", { exact: true })
    .selectOption({ label: "York" });
  await page.getByLabel("Departure HH:MM").fill("23:50");
  await page.getByLabel("Arrival HH:MM").fill("24:20");
  await page
    .getByRole("button", { name: "Save movement", exact: true })
    .click();
  await expect(page.getByRole("cell", { name: "23:50 / 24:20" })).toBeVisible();
  await page
    .getByLabel("Source page", { exact: true })
    .selectOption({ index: 1 });
  await page.getByLabel("Original source text").fill("Synthetic source text");
  await page
    .getByLabel("Corrected transcription")
    .fill("Synthetic corrected transcription");
  await page.getByRole("button", { name: "Add source citation" }).click();
  await page
    .getByRole("button", { name: "Open PDF page 1", exact: true })
    .click();
  await expect(page.locator("canvas")).toBeVisible();
  await page
    .getByLabel("Review status", { exact: true })
    .selectOption("Verified against source");
  await page.getByLabel("Review rationale").fill("Synthetic fixture checked");
  await page.getByRole("button", { name: "Record review" }).click();
  await expect(
    page.getByText("Verified against source — Synthetic fixture checked"),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Diagrams", exact: true }).click();
  await page
    .getByRole("button", { name: "Diagram TEST-15 Synthetic manual working" })
    .click();
  await expect(page.getByRole("cell", { name: "23:50 / 24:20" })).toBeVisible();
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/phase1-tablet.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
