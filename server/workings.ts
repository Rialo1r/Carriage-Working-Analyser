import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { audit, workingInclude } from "./data.js";
import {
  workingInput,
  calendarData,
  uuid,
  text,
  days,
  ruleInput,
  sourceInput,
  httpError,
} from "./validation.js";
export function registerWorkings(app: FastifyInstance, db: PrismaClient) {
  const id = (r: any) => uuid.parse(r.params.id);
  const bump = async (tx: any, workingId: string) =>
    tx.workingDefinition.update({
      where: { id: workingId },
      data: { revision: { increment: 1 } },
    });
  app.get("/api/workings", async (req) => {
    const q = z
      .object({
        q: z.string().max(200).default(""),
        weekday: z.coerce.number().int().min(0).max(6).optional(),
        stationId: uuid.optional(),
      })
      .parse(req.query);
    const all = await db.workingDefinition.findMany({
      where:{archived:false,diagram:{archived:false,period:{archived:false}}},
      include: workingInclude,
      orderBy: { createdAt: "asc" },
    });
    return all
      .filter(
        (w) =>
          (q.weekday == null || w.calendar?.weekdays.includes(q.weekday)) &&
          (!q.stationId ||
            w.startStationId === q.stationId ||
            w.finishStationId === q.stationId ||
            w.routeCalls.some((c) => c.stationId === q.stationId)),
      )
      .filter(
        (w) =>
          !q.q ||
          [
            w.diagram.number,
            w.diagram.period.name,
            w.label,
            w.startStation?.name,
            w.finishStation?.name,
            w.routeText,
            ...w.routeCalls.map((c) => c.station.name),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q.q.toLowerCase()),
      );
  });
  app.get("/api/workings/:id", (req) =>
    db.workingDefinition.findUniqueOrThrow({
      where: { id: id(req) },
      include: workingInclude,
    }),
  );
  app.get("/api/working-candidates", async (req) => {
    const q = z
      .object({
        number: z.string().trim().min(1).max(100),
        periodId: uuid.optional(),
      })
      .parse(req.query);
    return db.workingDefinition.findMany({
      where: {
        archived:false,
        diagram: {
          archived:false,
          number: { equals: q.number, mode: "insensitive" },
          ...(q.periodId ? { periodId: q.periodId } : {}),
        },
      },
      include: workingInclude,
    });
  });
  app.post("/api/workings", async (req, reply) => {
    const { calendar, routeCalls, instructions, sources, ...data } =
      workingInput.parse(req.body);
    return reply.code(201).send(
      await db.$transaction(async (tx) => {
        const w = await tx.workingDefinition.create({
          data: {
            ...data,
            calendar: { create: calendarData(calendar) },
            routeCalls: { create: routeCalls },
            instructions: { create: instructions },
            sources: { create: sources },
          },
          include: workingInclude,
        });
        await audit(
          tx,
          w.id,
          "Daily working",
          "Created",
          "Manual entry",
          null,
          w,
        );
        return w;
      }),
    );
  });
  app.put("/api/workings/:id", async (req) => {
    const { revision, reason } = z
      .object({ revision: z.number().int().positive(), reason: text.min(1) })
      .parse(req.body);
    const { calendar, routeCalls, instructions, sources, ...data } =
      workingInput.parse(req.body);
    if (sources.length)
      throw httpError(
        400,
        "Add citations separately; existing source references are retained.",
      );
    return db.$transaction(
      async (tx) => {
        const before = await tx.workingDefinition.findUniqueOrThrow({
          where: { id: id(req) },
          include: workingInclude,
        });
        const changed = await tx.workingDefinition.updateMany({
          where: { id: id(req), revision },
          data: { ...data, revision: { increment: 1 } },
        });
        if (!changed.count)
          throw httpError(409, "Working changed. Reload it before saving.");
        if (data.exclusive) {
          const duplicate = await tx.rotationAssignment.groupBy({
            by: ["occurrenceId"],
            where: { active: true, occurrence: { workingId: id(req) } },
            _count: true,
            having: { occurrenceId: { _count: { gt: 1 } } },
          });
          if (duplicate.length)
            throw httpError(
              409,
              "Multiple sets are already assigned. Remove the extra manual assignments before making this working exclusive.",
            );
        }
        const assignments = await tx.rotationAssignment.findMany({
          where: { active: true, occurrence: { workingId: id(req) } },
        });
        for (const a of assignments)
          await tx.rotationAssignment.update({
            where: { id: a.id },
            data: { exclusiveKey: data.exclusive ? a.occurrenceId : null },
          });
        await tx.routeCall.deleteMany({ where: { workingId: id(req) } });
        await tx.specialInstruction.deleteMany({
          where: { workingId: id(req) },
        });
        if (before.calendar)
          await tx.calendarException.deleteMany({
            where: { calendarId: before.calendar.id },
          });
        await tx.operatingCalendar.upsert({
          where: { workingId: id(req) },
          create: { workingId: id(req), ...calendarData(calendar) },
          update: calendarData(calendar),
        });
        for (const c of routeCalls)
          await tx.routeCall.create({ data: { ...c, workingId: id(req) } });
        for (const i of instructions)
          await tx.specialInstruction.create({
            data: { ...i, workingId: id(req) },
          });
        const after = await tx.workingDefinition.findUniqueOrThrow({
          where: { id: id(req) },
          include: workingInclude,
        });
        await audit(
          tx,
          id(req),
          "Daily working",
          "Edited",
          reason,
          before,
          after,
        );
        return after;
      },
      { timeout: 20000 },
    );
  });
  app.put("/api/workings/:id/next", async (req) => {
    const data = z
      .object({ rules: z.array(ruleInput).max(7), reason: text.min(1) })
      .refine(
        (v) => new Set(v.rules.map((r) => r.weekday)).size === v.rules.length,
        "Only one instruction per weekday",
      )
      .parse(req.body);
    return db.$transaction(async (tx) => {
      const before = await tx.workingDefinition.findUniqueOrThrow({
        where: { id: id(req) },
        include: workingInclude,
      });
      await bump(tx, id(req));
      for (const r of data.rules) {
        if (r.targetWorkingId)
          await tx.workingDefinition.findUniqueOrThrow({
            where: { id: r.targetWorkingId },
          });
        if(r.verified&&(!r.notes.trim()||!before.sources.length))throw httpError(400,"A source-verified continuation requires source wording in notes and a source citation on this working.");
        const rule = {
          ...r,
          targetWorkingId: r.targetWorkingId ?? null,
          storageStationId:r.storageStationId??null,
          enteredNumber: r.enteredNumber ?? null,
          offsetDays: r.offsetDays ?? null,
          targetWeekday: r.targetWeekday ?? null,
          targetDate: r.targetDate ? new Date(r.targetDate) : null,
        };
        await tx.nextWorkingReference.upsert({
          where: {
            workingId_weekday: { workingId: id(req), weekday: r.weekday },
          },
          create: { ...rule, workingId: id(req) },
          update: rule,
        });
      }
      const after = await tx.workingDefinition.findUniqueOrThrow({
        where: { id: id(req) },
        include: workingInclude,
      });
      await audit(
        tx,
        id(req),
        "Continuation instructions",
        "Edited",
        data.reason,
        before.nextRules,
        after.nextRules,
      );
      return after;
    });
  });
  app.post("/api/workings/:id/sources", async (req, reply) => {
    const data = sourceInput.parse(req.body);
    return reply.code(201).send(
      await db.$transaction(async (tx) => {
        const row = await tx.sourceReference.create({
          data: { ...data, workingId: id(req) },
        });
        await bump(tx, id(req));
        await audit(
          tx,
          id(req),
          "Source reference",
          "Added",
          "Manual citation",
          null,
          row,
        );
        return row;
      }),
    );
  });
  app.post("/api/workings/:id/notes", async (req, reply) => {
    const data = z.object({ text: text.min(1) }).parse(req.body);
    return reply.code(201).send(
      await db.$transaction(async (tx) => {
        const n = await tx.researchNote.create({
          data: { ...data, workingId: id(req) },
        });
        await audit(
          tx,
          id(req),
          "Research note",
          "Added",
          "Manual research note",
          null,
          n,
        );
        return n;
      }),
    );
  });
  app.put("/api/workings/:id/variations", async (req) => {
    const data = z
      .object({
        weekday: z.number().int().min(0).max(6),
        formationId: uuid.nullable(),
        notes: text.min(1),
      })
      .parse(req.body);
    return db.$transaction(async (tx) => {
      const before = await tx.formationVariation.findUnique({
        where: {
          workingId_weekday: { workingId: id(req), weekday: data.weekday },
        },
      });
      const v = await tx.formationVariation.upsert({
        where: {
          workingId_weekday: { workingId: id(req), weekday: data.weekday },
        },
        create: { ...data, workingId: id(req) },
        update: data,
      });
      await bump(tx, id(req));
      await audit(
        tx,
        id(req),
        "Day-specific formation",
        "Edited",
        data.notes,
        before,
        v,
      );
      return v;
    });
  });
  app.post("/api/workings/:id/changes", async (req, reply) => {
    const data = z
      .object({
        weekdays: days,
        action: z.enum(["Attach", "Detach"]),
        stage: z.enum(["Start", "En route", "Finish"]),
        typeId: uuid.nullable().optional(),
        quantity: z.number().int().positive().max(1000).nullable().optional(),
        notes: text.min(1),
      })
      .parse(req.body);
    return reply.code(201).send(
      await db.$transaction(async (tx) => {
        const row = await tx.formationChange.create({
          data: { ...data, workingId: id(req) },
        });
        await bump(tx, id(req));
        await audit(
          tx,
          id(req),
          "Formation change",
          "Recorded",
          data.notes,
          null,
          row,
        );
        return row;
      }),
    );
  });
  app.get("/api/history", async (req) => {
    const q = z.object({ entityId: uuid.optional() }).parse(req.query);
    return db.auditEvent.findMany({
      where: q.entityId ? { entityId: q.entityId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  });
}
