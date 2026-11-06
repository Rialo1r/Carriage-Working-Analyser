import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { migrate } from "./migrate.js";
import { assessConnection, buildRotation } from "./rotation-engine.js";
import { dailyInclude } from "./daily-routes.js";
const url = process.env.DATABASE_URL;
if (
  process.env.ALLOW_DEMO_SEED !== "true" ||
  !url ||
  new URL(url).pathname !== "/lner_demo"
)
  throw new Error(
    "Demo seed is restricted to the lner_demo database with ALLOW_DEMO_SEED=true.",
  );
await migrate(url);
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});
const storage = path.resolve(process.env.STORAGE_DIR || ".data-demo");
await mkdir(storage, { recursive: true });
try {
  await db.$transaction(
    async (db) => {
      const existing = await db.auditEvent.findFirst({
        where: { action: "Demo seeded" },
      });
      if (existing) {
        console.log("Demo already seeded; existing research preserved.");
      } else {
        const stations = await Promise.all(
          ["York", "Huttons Ambo", "Scarborough"].map((name) =>
            db.station.upsert({
              where: { name },
              create: { name },
              update: {},
            }),
          ),
        );
        const [york, huttons, scarborough] = stations;
        await db.stationAlias.create({
          data: { stationId: huttons.id, name: "Hutton's Ambo" },
        });
        async function source(title: string, date: string, lines: string[]) {
          const pdf = await PDFDocument.create();
          const p = pdf.addPage([800, 1000]);
          const font = await pdf.embedFont(StandardFonts.Helvetica);
          p.drawText("SYNTHETIC DEMONSTRATION - NOT HISTORICAL EVIDENCE", {
            x: 30,
            y: 950,
            size: 17,
            font,
          });
          p.drawText(title, { x: 30, y: 910, size: 18, font });
          for (let i = 0; i < lines.length; i++)
            p.drawText(lines[i], { x: 35, y: 860 - i * 38, size: 15, font });
          const bytes = Buffer.from(await pdf.save());
          const key = "demo-" + date + "-" + randomUUID() + ".pdf";
          await writeFile(path.join(storage, key), bytes, { flag: "wx" });
          return db.document.create({
            data: {
              title,
              sourceDate: date,
              region: "Synthetic York-Scarborough example",
              description:
                "Invented test data only. Do not use as historical evidence.",
              files: {
                create: {
                  originalName: key,
                  storageKey: key,
                  sha256: createHash("sha256").update(bytes).digest("hex"),
                  size: bytes.length,
                  pageCount: 1,
                  pages: { create: { pdfPage: 1, printedLabel: "DEMO" } },
                },
              },
            },
            include: { files: { include: { pages: true } } },
          });
        }
        const roster = await source(
          "SYNTHETIC DEMO — 1939 carriage roster",
          "1939",
          [
            "Diagram 15: York 08:00 to Scarborough 10:00. Train 123.",
            "Intermediate: Huttons Ambo 09:00. Two BT and one T.",
            "Diagram 22: Scarborough 08:00 to Huttons Ambo 09:00. Train 456.",
            "Diagram 31: Huttons Ambo 08:00 to York 09:00. Train 789.",
            "ALL WORKINGS AND CONTINUATIONS ARE INVENTED FOR TESTING.",
            "OCR rule examples: Buttons Ambo / Scarborouch",
          ],
        );
        const timetable = await source(
          "SYNTHETIC DEMO — 1937 working timetable",
          "1937",
          [
            "Train 123: York 08:10, Huttons Ambo 09:10, Scarborough 10:10.",
            "This service is not automatically linked to the 1939 working.",
            "Dates and timings are deliberately different for review tests.",
          ],
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
        const specs = [
          { number: "15", train: "123", from: york, to: scarborough, end: 600 },
          {
            number: "22",
            train: "456",
            from: scarborough,
            to: huttons,
            end: 540,
          },
          { number: "31", train: "789", from: huttons, to: york, end: 540 },
        ];
        const diagrams = [];
        for (const s of specs) {
          const d = await db.diagram.create({
            data: {
              publishedNumber: s.number,
              title: "SYNTHETIC DEMO — not historical",
              documentId: roster.id,
              operatingDays: days,
              operatingPeriod:
                "Invented daily operation for software demonstration",
              status: "Not reviewed",
              notes: "Synthetic data: no claim about actual LNER workings.",
              requirements: {
                create: [
                  { typeCode: "BT", quantity: 2, position: 1 },
                  { typeCode: "T", quantity: 1, position: 2 },
                ],
              },
              movements: {
                create: {
                  sequence: 1,
                  trainNumber: s.train,
                  originId: s.from.id,
                  destinationId: s.to.id,
                  departureMinutes: 480,
                  arrivalMinutes: s.end,
                  activity: "Passenger",
                  notes: "Synthetic demonstration movement",
                  ...(s.number === "15"
                    ? {
                        calls: {
                          create: {
                            stationId: huttons.id,
                            sequence: 1,
                            arrivalMinutes: 540,
                            departureMinutes: 542,
                            originalText: "SYNTHETIC CALL",
                          },
                        },
                      }
                    : {}),
                },
              },
              evidence: {
                create: {
                  pageId: roster.files[0].pages[0].id,
                  originalText: "SYNTHETIC DEMO ONLY: Diagram " + s.number,
                  transcription: "Invented demonstration working",
                  notes: "Not historical evidence",
                },
              },
            },
            include: dailyInclude,
          });
          diagrams.push(d);
        }
        await db.trainService.create({
          data: {
            documentId: timetable.id,
            publishedNumber: "123",
            description: "SYNTHETIC 1937 candidate with differing timings",
            operatingDays: days,
            entries: {
              create: [
                {
                  stationId: york.id,
                  sequence: 1,
                  departureMinutes: 490,
                  pageId: timetable.files[0].pages[0].id,
                },
                {
                  stationId: huttons.id,
                  sequence: 2,
                  arrivalMinutes: 550,
                  departureMinutes: 552,
                  pageId: timetable.files[0].pages[0].id,
                },
                {
                  stationId: scarborough.id,
                  sequence: 3,
                  arrivalMinutes: 610,
                  pageId: timetable.files[0].pages[0].id,
                },
              ],
            },
          },
        });
        const bt = await db.carriageType.create({
            data: {
              code: "BT",
              description: "SYNTHETIC brake third",
              brake: true,
              seatingClass: "Third",
            },
          }),
          t = await db.carriageType.create({
            data: {
              code: "T",
              description: "SYNTHETIC third",
              seatingClass: "Third",
            },
          });
        const form = await db.formation.create({
          data: {
            description:
              "SYNTHETIC demo physical stock — unidentified vehicles",
            physicalSet: { create: { researchLabel: "SYNTHETIC Set A" } },
            members: {
              create: [
                { typeId: bt.id, quantity: 2, position: 1 },
                { typeId: t.id, quantity: 1, position: 2 },
              ],
            },
          },
        });
        for (let i = 0; i < diagrams.length; i++)
          await db.diagramOperation.create({
            data: {
              diagramId: diagrams[i].id,
              date: new Date(Date.UTC(1939, 6, 3 + i)),
              assignments: {
                create: {
                  formationId: form.id,
                  notes: "Synthetic demonstration assignment",
                },
              },
            },
          });
        const scenario = await db.analysisScenario.create({
          data: {
            name: "SYNTHETIC three-day rotation",
            startDate: new Date("1939-07-03"),
            endDate: new Date("1939-08-14"),
            diagramIds: diagrams.map((d) => d.id),
            assumptions:
              "Entirely fictional. Daily calendars and compatible formations are assumed for testing. No historical continuity asserted.",
          },
        });
        const links = [];
        for (let i = 0; i < diagrams.length; i++) {
          const from = diagrams[i],
            to = diagrams[(i + 1) % diagrams.length],
            assessment = assessConnection(from, to, 1, scenario);
          links.push(
            await db.diagramTransition.create({
              data: {
                scenarioId: scenario.id,
                fromId: from.id,
                toId: to.id,
                dayOffset: 1,
                confidence: assessment.confidence,
                checks: assessment.checks,
                decision: "Approved",
                kind: assessment.kind,
                rationale:
                  "Synthetic approved hypothesis for demonstration, not source-confirmed history.",
              },
            }),
          );
        }
        const result = buildRotation(
          diagrams[0].id,
          links,
          new Map(diagrams.map((d) => [d.id, d])),
          scenario,
        );
        await db.rotation.create({
          data: {
            scenarioId: scenario.id,
            name: "SYNTHETIC Set A — three-day circuit",
            physicalSetId: form.physicalSetId,
            steps: result.steps,
            stepRecords: {
              create: result.steps.map((s: any, i: number) => ({
                diagramId: s.diagramId,
                sequence: i + 1,
                dayOffset: s.dayOffset,
              })),
            },
            repeats: result.repeats,
            periodDays: result.periodDays,
            status: result.status,
            notes: ["Fictional demonstration only.", ...result.issues].join(
              "\n",
            ),
          },
        });
        await db.correctionRule.createMany({
          data: [
            {
              original: "Buttons Ambo",
              replacement: "Huttons Ambo",
              notes: "Suggestion only; check original",
            },
            {
              original: "Scarborouch",
              replacement: "Scarborough",
              notes: "Suggestion only; check original",
            },
          ],
        });
        await db.ocrJob.create({
          data: { pageId: roster.files[0].pages[0].id, layout: 6 },
        });
        await db.auditEvent.create({
          data: {
            entityId: roster.id,
            entityType: "Demo",
            action: "Demo seeded",
            detail: { synthetic: true },
          },
        });
        console.log(
          "Synthetic demonstration seeded. No real research database was touched.",
        );
      }
    },
    { timeout: 30000 },
  );
} finally {
  await db.$disconnect();
}
