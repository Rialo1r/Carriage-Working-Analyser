import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { audit } from "./data.js";
import { uuid, text, httpError } from "./validation.js";
const models: Record<string, string> = {
  stations: "station",
  types: "carriageType",
  diagrams: "publishedDiagram",
  workings: "workingDefinition",
  formations: "formation",
  "physical-sets": "physicalSet",
  periods: "historicalPeriod",
};
export async function usage(tx: any, kind: string, id: string) {
  const counts: Record<string, number> = {};
  const count = async (model: string, label: string, where: any) => {
    if (tx[model]) counts[label] = await tx[model].count({ where });
  };
  if (kind === "stations") {
    await count("workingDefinition", "Starting workings", {
      startStationId: id,
    });
    await count("workingDefinition", "Finishing workings", {
      finishStationId: id,
    });
    await count("routeCall", "Intermediate calls", { stationId: id });
    await count("nextWorkingReference", "Stabling instructions", {
      storageStationId: id,
    });
    await count("connectingMovement", "Connecting movements", {
      OR: [{ startStationId: id }, { finishStationId: id }],
    });
  }
  if (kind === "types") {
    await count("formationMember", "Formation members", { typeId: id });
    await count("formationChange", "Formation changes", { typeId: id });
  }
  if (kind === "diagrams")
    await count("workingDefinition", "Working definitions", { diagramId: id });
  if (kind === "periods")
    await count("publishedDiagram", "Published diagrams", { periodId: id });
  if (kind === "workings") {
    await count("workingOccurrence", "Dated occurrences", { workingId: id });
    await count("nextWorkingReference", "Continuation instructions", {
      OR: [{ workingId: id }, { targetWorkingId: id }],
    });
    await count("operatingCalendar", "Calendar and entered roster details", {
      workingId: id,
    });
    await count("sourceReference", "Source references", { workingId: id });
  }
  if (kind === "formations") {
    await count("formationMember", "Composition members", { formationId: id });
    await count("workingDefinition", "Base working formations", {
      formationId: id,
    });
    await count("formationVariation", "Day-specific formations", {
      formationId: id,
    });
  }
  if (kind === "physical-sets") {
    await count(
      "rotationAssignment",
      "Assignments including retained history",
      { physicalSetId: id },
    );
    await count("savedRotation", "Saved rotations", { physicalSetId: id });
  }
  return Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0));
}
export function registerManagement(app: FastifyInstance, db: PrismaClient) {
  const record = (req: any) => {
    const kind = z
      .enum([
        "stations",
        "types",
        "diagrams",
        "workings",
        "formations",
        "physical-sets",
        "periods",
      ])
      .parse(req.params.kind);
    return { kind, id: uuid.parse(req.params.id), model: models[kind] };
  };
  app.get("/api/records/:kind/:id/usage", async (req) => {
    const { kind, id, model } = record(req);
    const row = await (db as any)[model].findUniqueOrThrow({ where: { id } });
    return {
      record: row,
      counts: await usage(db, kind, id),
      replaceAllowed: ["stations", "types"].includes(kind),
    };
  });
  app.put("/api/records/:kind/:id", async (req) => {
    const { kind, id, model } = record(req);
    if (!["stations", "types", "periods"].includes(kind))
      throw httpError(
        400,
        "Use the roster or formation editor for this record.",
      );
    const { reason, ...data } = z
      .object({
        name: text.min(1),
        notes: text.default(""),
        code: z.string().trim().max(100).nullable().optional(),
        reason: text.min(1),
      })
      .parse(req.body);
    return db.$transaction(async (tx: any) => {
      const before = await tx[model].findUniqueOrThrow({ where: { id } });
      const fields =
        kind === "types" ? data : { name: data.name, notes: data.notes };
      const after = await tx[model].update({
        where: { id },
        data: {
          ...fields,
          ...(kind !== "periods" ? { revision: { increment: 1 } } : {}),
        },
      });
      await audit(tx, id, kind, "Edited", reason, before, after);
      return after;
    });
  });
  app.post("/api/records/:kind/:id/restore", async (req) => {
    const { kind, id, model } = record(req);
    const { reason } = z.object({ reason: text.min(1) }).parse(req.body);
    return db.$transaction(async (tx: any) => {
      const before = await tx[model].findUniqueOrThrow({ where: { id } });
      const after = await tx[model].update({
        where: { id },
        data: { archived: false },
      });
      await audit(tx, id, kind, "Restored", reason, before, after);
      return after;
    });
  });
  app.delete("/api/records/:kind/:id", async (req) => {
    const { kind, id, model } = record(req);
    const { mode, reason, replacementId } = z
      .object({
        mode: z.enum(["delete", "archive", "replace"]),
        reason: text.min(1),
        replacementId: uuid.optional(),
      })
      .parse(req.body);
    return db.$transaction(
      async (tx: any) => {
        const before = await tx[model].findUniqueOrThrow({ where: { id } }),
          counts = await usage(tx, kind, id);
        if (mode === "delete") {
          if (Object.keys(counts).length)
            throw httpError(
              409,
              "This entry is referenced. Review a replacement or archive it to retain research.",
            );
          await tx[model].delete({ where: { id } });
          await audit(
            tx,
            id,
            kind,
            "Deleted unused entry",
            reason,
            before,
            null,
          );
          return { status: "Deleted" };
        }
        if (mode === "replace") {
          if (
            !["stations", "types"].includes(kind) ||
            !replacementId ||
            replacementId === id
          )
            throw httpError(
              400,
              "Choose a different active station or carriage type.",
            );
          const target = await tx[model].findUniqueOrThrow({
            where: { id: replacementId },
          });
          if (target.archived)
            throw httpError(400, "The replacement must be active.");
          if (kind === "stations") {
            const affected = await tx.workingDefinition.findMany({
              where: {
                OR: [
                  { startStationId: id },
                  { finishStationId: id },
                  { routeCalls: { some: { stationId: id } } },
                  { nextRules: { some: { storageStationId: id } } },
                ],
              },
              select: { id: true },
            });
            await tx.workingDefinition.updateMany({
              where: { startStationId: id },
              data: { startStationId: replacementId },
            });
            await tx.workingDefinition.updateMany({
              where: { finishStationId: id },
              data: { finishStationId: replacementId },
            });
            await tx.routeCall.updateMany({
              where: { stationId: id },
              data: { stationId: replacementId },
            });
            await tx.nextWorkingReference.updateMany({
              where: { storageStationId: id },
              data: { storageStationId: replacementId },
            });
            if (tx.connectingMovement) {
              await tx.connectingMovement.updateMany({
                where: { startStationId: id },
                data: { startStationId: replacementId },
              });
              await tx.connectingMovement.updateMany({
                where: { finishStationId: id },
                data: { finishStationId: replacementId },
              });
            }
            if (affected.length)
              await tx.workingDefinition.updateMany({
                where: { id: { in: affected.map((w: any) => w.id) } },
                data: { revision: { increment: 1 } },
              });
          } else {
            const affected = await tx.formationMember.findMany({
              where: { typeId: id },
              select: { formationId: true },
            });
            await tx.formationMember.updateMany({
              where: { typeId: id },
              data: { typeId: replacementId },
            });
            await tx.formationChange.updateMany({
              where: { typeId: id },
              data: { typeId: replacementId },
            });
            if (affected.length)
              await tx.formation.updateMany({
                where: { id: { in: affected.map((m: any) => m.formationId) } },
                data: { revision: { increment: 1 } },
              });
          }
          await tx[model].update({ where: { id }, data: { archived: true } });
          await audit(
            tx,
            id,
            kind,
            "Replaced references and archived original",
            reason,
            { record: before, counts },
            { replacement: target },
          );
          return { status: "Replaced", counts };
        }
        const after = await tx[model].update({
          where: { id },
          data: { archived: true },
        });
        await audit(tx, id, kind, "Archived", reason, before, after);
        return { status: "Archived", counts };
      },
      { timeout: 20000 },
    );
  });
}
