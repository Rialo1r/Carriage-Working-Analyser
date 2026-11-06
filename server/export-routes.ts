import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { createHash } from "node:crypto";
import { dailyInclude } from "./daily-routes.js";
import { csvCell } from "./domain.js";
export const schemaVersion = "lner-research/v1";
function stable(value: any): any {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, stable(value[k])]),
    );
  return value;
}
export function renderExport(payload: any, format: string) {
  payload = stable(payload);
  if (format === "JSON") return JSON.stringify(payload, null, 2) + "\n";
  const headers = [
    "schemaVersion",
    "diagramId",
    "publishedNumber",
    "operatingDays",
    "verificationStatus",
    "trainNumber",
    "origin",
    "destination",
    "departureMinutes",
    "arrivalMinutes",
    "intermediateCalls",
    "compositionRequirements",
    "compositionChanges",
    "physicalAssignments",
    "rotations",
    "sourceEvidence",
    "calendarExceptions",
    "researchNotes",
    "timetableLinks",
  ];
  const rows = [headers.map(csvCell).join(",")];
  for (const d of payload.diagrams)
    for (const m of d.movements.length ? d.movements : [{}])
      rows.push(
        [
          payload.schemaVersion,
          d.id,
          d.publishedNumber,
          d.operatingDays,
          d.status,
          m.trainNumber,
          m.origin?.name,
          m.destination?.name,
          m.departureMinutes,
          m.arrivalMinutes,
          m.calls || [],
          d.requirements,
          m.changes || [],
          d.operations,
          payload.rotations.filter((r: any) =>
            r.steps.some((s: any) => s.diagramId === d.id),
          ),
          d.evidence,
          d.calendarRules,
          d.researchNotes,
          m.serviceLinks || [],
        ]
          .map(csvCell)
          .join(","),
      );
  return rows.join("\r\n") + "\r\n";
}
export function registerExports(app: FastifyInstance, db: PrismaClient) {
  app.get("/api/exports", () =>
    db.exportBatch.findMany({
      select: {
        id: true,
        format: true,
        schemaVersion: true,
        warnings: true,
        sha256: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  );
  app.post("/api/exports/preview", async (req, reply) => {
    const data = z
      .object({
        format: z.enum(["JSON", "CSV"]),
        diagramIds: z.array(z.string().uuid()).max(1000).optional(),
        verifiedOnly: z.boolean().default(true),
      })
      .parse(req.body);
    const diagrams = await db.diagram.findMany({
      where: {
        ...(data.diagramIds ? { id: { in: data.diagramIds } } : {}),
        ...(data.verifiedOnly
          ? { status: { in: ["Verified against source", "Ready for export"] } }
          : {}),
      },
      include: {
        ...dailyInclude,
        verifications: true,
        operations: {
          include: {
            assignments: {
              include: {
                formation: {
                  include: {
                    physicalSet: true,
                    members: { include: { type: true, carriage: true } },
                  },
                },
              },
            },
          },
        },
        movements: {
          ...dailyInclude.movements,
          include: {
            ...dailyInclude.movements.include,
            serviceLinks: {
              include: {
                service: {
                  include: {
                    document: true,
                    entries: { include: { station: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    const warnings: string[] = [];
    if (!diagrams.length)
      warnings.push(
        "No diagrams match the export selection and verification filter.",
      );
    if (data.diagramIds)
      for (const id of data.diagramIds)
        if (!diagrams.some((d) => d.id === id))
          warnings.push(`Diagram ${id} was excluded or does not exist.`);
    const rotations = await db.rotation
      .findMany({
        include: {
          scenario: true,
          stepRecords: { orderBy: { sequence: "asc" } },
        },
      })
      .then((rs) =>
        rs.filter((r) =>
          (r.steps as any[]).some((s) =>
            diagrams.some((d) => d.id === s.diagramId),
          ),
        ),
      );
    for (const d of diagrams) {
      if (!d.evidence.length)
        warnings.push(
          `Diagram ${d.publishedNumber || d.id}: no source citation.`,
        );
      if (!d.movements.length)
        warnings.push(
          `Diagram ${d.publishedNumber || d.id}: no recorded movements.`,
        );
      if (!d.operatingDays.length)
        warnings.push(
          `Diagram ${d.publishedNumber || d.id}: operating days unknown.`,
        );
      if (!["Verified against source", "Ready for export"].includes(d.status))
        warnings.push(
          `Diagram ${d.publishedNumber || d.id}: unverified research data.`,
        );
      for (const m of d.movements)
        if (
          !m.originId ||
          !m.destinationId ||
          m.departureMinutes == null ||
          m.arrivalMinutes == null
        )
          warnings.push(`Movement ${m.id}: route or times incomplete.`);
    }
    for (const r of rotations) {
      if (r.status !== "Confirmed")
        warnings.push(`Rotation ${r.name}: ${r.status}; not source-confirmed.`);
      if (
        diagrams.some(
          (d) =>
            d.updatedAt > r.createdAt &&
            (r.steps as any[]).some((s) => s.diagramId === d.id),
        )
      )
        warnings.push(
          `Rotation ${r.name}: diagram changed after rotation snapshot; rebuild and review it.`,
        );
    }
    const serialised = JSON.parse(
      JSON.stringify({
        schemaVersion,
        generatedAt: new Date().toISOString(),
        purpose: data.verifiedOnly
          ? "Verified research interchange"
          : "Research review — includes unverified data",
        warnings,
        diagrams,
        rotations,
      }),
    );
    // Storage keys are implementation details, never part of the interchange contract.
    for (const d of serialised.diagrams)
      for (const e of d.evidence) delete e.page.file.storageKey;
    const text = renderExport(serialised, data.format),
      sha256 = createHash("sha256").update(text).digest("hex");
    const batch = await db.exportBatch.create({
      data: {
        format: data.format,
        schemaVersion,
        payload: serialised,
        warnings,
        sha256,
      },
    });
    return reply.code(201).send({
      ...batch,
      text,
      downloadUrl: `/api/exports/${batch.id}/download`,
    });
  });
  app.get("/api/exports/:id/download", async (req, reply) => {
    const batch = await db.exportBatch.findUniqueOrThrow({
      where: {
        id: z
          .string()
          .uuid()
          .parse((req.params as any).id),
      },
    });
    return reply
      .type(
        batch.format === "JSON"
          ? "application/json"
          : "text/csv; charset=utf-8",
      )
      .header(
        "Content-Disposition",
        `attachment; filename="lner-research-${batch.id}.${batch.format.toLowerCase()}"`,
      )
      .header("X-Content-SHA256", batch.sha256)
      .send(renderExport(batch.payload, batch.format));
  });
}
