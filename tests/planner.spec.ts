import { test, expect, Page, Locator } from "@playwright/test";
import { setup } from "./helpers.js";
import type { buildApp } from "../server/app.js";
let instance: Awaited<ReturnType<typeof buildApp>>;
test.beforeAll(async () => {
  instance = await setup(true);
  await instance.app.listen({ host: "127.0.0.1", port: 4311 });
});
test.afterAll(async () => {
  await instance?.app.close();
});
async function choose(locator: Locator, pattern: RegExp) {
  const option = locator.locator("option").filter({ hasText: pattern });
  await expect(option).toHaveCount(1);
  await locator.selectOption((await option.getAttribute("value"))!);
}
async function nav(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", {
      name: name === "Workings" ? "Carriage Roster" : name,
      exact: true,
    })
    .click();
}
async function openWorking(page: Page, label: string) {
  await nav(page, "Workings");
  const back = page.getByRole("button", {
    name: "← All workings",
    exact: true,
  });
  if (await back.isVisible()) await back.click();
  await page.getByRole("button", { name: label, exact: true }).click();
}
test("Phase 1 end-to-end manual entry, variants, exact continuation selection and weekly assignments", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your research desk" }),
  ).toBeVisible();
  await nav(page, "Stations & Types");
  for (const name of ["Scarborough", "Hull", "Neville Hill"]) {
    await page
      .getByRole("button", { name: "Add Station", exact: true })
      .click();
    const modal = page.getByRole("dialog", {
      name: "Add Station",
      exact: true,
    });
    await modal.getByLabel("Station name", { exact: true }).fill(name);
    await modal
      .getByRole("button", { name: "Save station", exact: true })
      .click();
    await expect(modal).not.toBeVisible();
  }
  await page
    .getByRole("button", { name: "Add Carriage Type", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Carriage type name")
    .fill("SYNTHETIC Brake Third");
  await page.getByRole("dialog").getByLabel("Type code (optional)").fill("BT");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save carriage type" })
    .click();
  await nav(page, "Published Diagrams");
  await page
    .getByLabel("Period name", { exact: true })
    .fill("SYNTHETIC LNER 1939 — testing only");
  await page.getByLabel("Period begins (optional)").fill("1939-01-01");
  await page.getByLabel("Period ends (optional)").fill("1939-12-31");
  await page.getByRole("button", { name: "Add period", exact: true }).click();
  await choose(
    page.getByLabel("Historical period", { exact: true }),
    /^SYNTHETIC LNER/,
  );
  for (const number of ["262", "822A"]) {
    await page
      .getByLabel("Published diagram / set number", { exact: true })
      .fill(number);
    await page
      .getByRole("button", { name: "Add diagram", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: number, exact: true }),
    ).toBeVisible();
  }
  await nav(page, "Formations");
  await page
    .getByLabel("Formation name", { exact: true })
    .fill("Synthetic four coaches");
  await page.getByLabel("Formation completeness").selectOption("Known");
  await page
    .getByRole("button", { name: "Add formation member", exact: true })
    .click();
  await choose(
    page.getByLabel("Type for member 1", { exact: true }),
    /^SYNTHETIC Brake Third/,
  );
  await page.getByLabel("Quantity for member 1").fill("4");
  await expect(page.getByText("4 carriages in total")).toBeVisible();
  await page
    .getByRole("button", { name: "Save formation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Synthetic four coaches", exact: true }),
  ).toBeVisible();
  await nav(page, "Workings");
  await page.getByRole("button", { name: "Add Working", exact: true }).click();
  await choose(page.getByLabel("Published diagram", { exact: true }), /^262 ·/);
  await page.getByLabel("Working label / variant").fill("Monday–Friday");
  await page
    .getByRole("button", { name: "Monday–Friday", exact: true })
    .click();
  await choose(
    page.getByLabel("Starting station", { exact: true }),
    /^Scarborough(?: ·|$)/,
  );
  await choose(
    page.getByLabel("Finishing station", { exact: true }),
    /^Scarborough(?: ·|$)/,
  );
  await page.getByLabel("Starting time (HH:MM, optional)").fill("08:00");
  await page.getByLabel("Finishing time (HH:MM, optional)").fill("18:00");
  await page.getByLabel("Route description").fill("Via Hull");
  await page.getByText("Intermediate stations (0)", { exact: true }).click();
  await page
    .getByRole("button", { name: "Add intermediate station", exact: true })
    .click();
  await choose(
    page.getByLabel("Intermediate station 1", { exact: true }),
    /^Hull(?: ·|$)/,
  );
  await choose(
    page.getByLabel("Base carriage formation", { exact: true }),
    /^Synthetic four coaches/,
  );
  await page
    .getByLabel("Instruction text 1", { exact: true })
    .fill("SYNTHETIC SF attached");
  await page
    .getByLabel("Source document title", { exact: true })
    .fill("Synthetic manual source — not historical evidence");
  await page.getByLabel("Source page number", { exact: true }).fill("96");
  await page.getByRole("button", { name: "Save working", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Diagram 262 · Monday–Friday",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Copy as Saturday variant", exact: true })
    .click();
  await page.getByLabel("Working label / variant").fill("Saturday");
  await choose(
    page.getByLabel("Finishing station", { exact: true }),
    /^Neville Hill(?: ·|$)/,
  );
  await page.getByRole("button", { name: "Save working", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Diagram 262 · Saturday", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Copy as Sunday variant", exact: true })
    .click();
  await page.getByLabel("Working label / variant").fill("Sunday");
  await choose(
    page.getByLabel("Published diagram", { exact: true }),
    /^822A ·/,
  );
  await choose(
    page.getByLabel("Starting station", { exact: true }),
    /^Neville Hill(?: ·|$)/,
  );
  await choose(
    page.getByLabel("Finishing station", { exact: true }),
    /^Scarborough(?: ·|$)/,
  );
  await page
    .getByLabel("Instruction text 1", { exact: true })
    .fill("SYNTHETIC no SF");
  await page.getByRole("button", { name: "Save working", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Diagram 822A · Sunday", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Different Diagram Next Day", exact: true })
    .click();
  await page.getByLabel("Find next published number").fill("262");
  await expect(
    page.getByLabel("Specific next daily working", { exact: true }),
  ).toHaveValue("");
  await expect(
    page
      .getByLabel("Specific next daily working", { exact: true })
      .locator("option"),
  ).toHaveCount(3);
  await choose(
    page.getByLabel("Specific next daily working", { exact: true }),
    /Monday–Friday/,
  );
  await page
    .getByLabel("Reason for continuation change")
    .fill("Synthetic Sunday to Monday instruction");
  await page
    .getByRole("button", { name: "Save next-working instructions" })
    .click();
  await expect(
    page.getByRole("cell", { name: "Sunday", exact: true }),
  ).toBeVisible();
  await openWorking(page, "Diagram 262 · Saturday");
  await page
    .getByRole("button", { name: "Different Diagram Next Day", exact: true })
    .click();
  await page.getByLabel("Find next published number").fill("822A");
  await choose(
    page.getByLabel("Specific next daily working", { exact: true }),
    /Sunday/,
  );
  await page
    .getByLabel("Reason for continuation change")
    .fill("Synthetic Saturday to Sunday instruction");
  await page
    .getByRole("button", { name: "Save next-working instructions" })
    .click();
  await openWorking(page, "Diagram 262 · Monday–Friday");
  await page
    .getByRole("button", { name: "Same Diagram Next Day", exact: true })
    .click();
  await choose(
    page.getByLabel("Specific next daily working", { exact: true }),
    /Monday–Friday/,
  );
  const scope = page.getByRole("group", {
    name: "Source days for this instruction",
  });
  await scope.getByRole("checkbox", { name: "Friday", exact: true }).uncheck();
  await page
    .getByLabel("Reason for continuation change")
    .fill("Synthetic Monday to Thursday instruction");
  await page
    .getByRole("button", { name: "Save next-working instructions" })
    .click();
  for (const d of ["Monday", "Tuesday", "Wednesday", "Thursday"])
    await scope.getByRole("checkbox", { name: d, exact: true }).uncheck();
  await scope.getByRole("checkbox", { name: "Friday", exact: true }).check();
  await choose(
    page.getByLabel("Specific next daily working", { exact: true }),
    /Saturday/,
  );
  await page
    .getByLabel("Reason for continuation change")
    .fill("Synthetic Friday to Saturday instruction");
  await page
    .getByRole("button", { name: "Save next-working instructions" })
    .click();
  await page
    .getByRole("button", { name: "Edit Daily Working", exact: true })
    .click();
  await page
    .getByLabel("Working notes", { exact: true })
    .fill("Edited by browser test");
  await page
    .getByLabel("Reason for working edit")
    .fill("Synthetic edit audit test");
  await page.getByRole("button", { name: "Save working changes" }).click();
  await expect(
    page.getByText("Edited by browser test", { exact: true }),
  ).toBeVisible();
  await nav(page, "Physical Sets");
  await page.getByLabel("Research label (optional)").fill("Synthetic Set A");
  await page
    .getByRole("button", { name: "Create physical set", exact: true })
    .click();
  const catalog = await (await page.request.get("/api/catalog")).json();
  expect(catalog.sets).toHaveLength(1);
  const set = catalog.sets[0];
  expect(set.code).toMatch(/^CS-\d{4,}$/);
  await nav(page, "Weekly Timetable");
  await page.getByLabel("Timetable first date").fill("1939-07-03");
  await page.getByLabel("Timetable weeks").selectOption("2");
  await page.getByRole("button", { name: "Build weekly timetable" }).click();
  await choose(
    page.getByLabel("Physical set for assignment", { exact: true }),
    /Synthetic Set A/,
  );
  await page
    .getByLabel("Assignment evidence / notes")
    .fill("Synthetic manual allocation only");
  for (let date = 3; date <= 9; date++) {
    await choose(
      page.getByLabel("Dated daily working", { exact: true }),
      new RegExp("^1939-07-0" + date + " ·"),
    );
    await page
      .getByRole("button", { name: "Assign physical set", exact: true })
      .click();
    await expect
      .poll(async () => {
        const d = await (await page.request.get("/api/dashboard")).json();
        return d.assignments;
      })
      .toBe(date - 2);
  }
  const board = page.locator("table.board");
  await expect(
    board.getByText("SYNTHETIC SF attached", { exact: true }),
  ).toHaveCount(6);
  await expect(board.getByText("SYNTHETIC no SF", { exact: true })).toHaveCount(
    1,
  );
  await expect(
    board.getByText("Unverified — check connections in Stock Chains", {
      exact: true,
    }),
  ).toHaveCount(7);
  const timetable = await (
    await page.request.get("/api/timetable?start=1939-07-03&weeks=2")
  ).json();
  expect(timetable.occurrences).toHaveLength(14);
  const mondays = timetable.occurrences.filter((o: any) =>
    ["1939-07-03", "1939-07-10"].includes(o.date.slice(0, 10)),
  );
  expect(mondays[0].id).not.toBe(mondays[1].id);
  await page.screenshot({
    path: "test-results/planner-weekly-board.png",
    fullPage: true,
  });
  await nav(page, "History");
  await expect(
    page.getByText("Synthetic edit audit test", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await nav(page, "Workings");
  await expect(
    page.getByRole("button", {
      name: "Diagram 262 · Monday–Friday",
      exact: true,
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("Updated roster, connection checks, approved rotation and iPad layout", async ({
  page,
}) => {
  const { db } = instance;
  const p = await db.historicalPeriod.create({
    data: { name: "SYNTHETIC browser rotation" },
  });
  const station = await db.station.create({ data: { name: "Synthetic York" } });
  const d = await db.publishedDiagram.create({
    data: { periodId: p.id, number: "BROWSER-A" },
  });
  const w = await db.workingDefinition.create({
    data: {
      diagramId: d.id,
      label: "Browser daily",
      startStationId: station.id,
      finishStationId: station.id,
      calendar: { create: { weekdays: [0, 1, 2, 3, 4, 5, 6] } },
    },
  });
  for (let weekday = 0; weekday < 7; weekday++)
    await db.nextWorkingReference.create({
      data: {
        workingId: w.id,
        weekday,
        kind: "TARGET",
        targetWorkingId: w.id,
        offsetDays: 1,
      },
    });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await nav(page, "Stock Chains");
  await choose(
    page.getByLabel("Historical period", { exact: true }),
    /SYNTHETIC browser rotation/,
  );
  await page.getByLabel("Weeks to analyse").fill("2");
  await page
    .getByRole("button", { name: "Check All Connections", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Connection review", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Possible candidate", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Generate Rotations", exact: true })
    .click();
  await page.getByText(/BROWSER-A · 1939-01-02 · 14 workings/).click();
  await page
    .getByRole("button", { name: "Approve & assign physical set", exact: true })
    .click();
  expect(errors).toEqual([]);
  await page.getByLabel("Rotation name").fill("Browser approved stock");
  await page
    .getByLabel("Approval evidence / reason")
    .fill("Synthetic manual review of missing times and formation");
  await page
    .getByLabel("I accept the displayed uncertainties and open ends.")
    .check();
  await page
    .getByRole("button", { name: "Save approved rotation", exact: true })
    .click();
  await expect(
    page.getByText(/CS-\d+ · Browser approved stock · Locked/),
  ).toBeVisible();
  await nav(page, "Issues");
  await expect(
    page.getByRole("heading", { name: "Issues & conflicts" }),
  ).toBeVisible();
  await expect(page.getByText(/Timing/).first()).toBeVisible();
  await page.setViewportSize({ width: 820, height: 1180 });
  await nav(page, "Stations & Types").catch(async () => nav(page, "Registers"));
  await expect(
    page.getByRole("heading", { name: "Stations & carriage types" }),
  ).toBeVisible();
  expect(await page.locator("main").innerText()).not.toMatch(
    /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}/,
  );
  expect(errors).toEqual([]);
});
