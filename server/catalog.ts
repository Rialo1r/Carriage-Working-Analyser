import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { audit, formationInclude } from "./data.js";
import { formationCount, setCode } from "./calendar.js";
import {
  uuid,
  text,
  periodInput,
  formationInput,
  httpError,
} from "./validation.js";
export function registerCatalog(app: FastifyInstance, db: PrismaClient) {
  app.get("/api/catalog", async (req) => {
    const includeArchived =
      z
        .object({ includeArchived: z.enum(["true", "false"]).optional() })
        .parse(req.query).includeArchived === "true";
    const where = includeArchived ? {} : { archived: false };
    return {
      periods: await db.historicalPeriod.findMany({
        where,
        orderBy: { name: "asc" },
      }),
      diagrams: await db.publishedDiagram.findMany({
        where,
        include: { period: true },
        orderBy: [{ number: "asc" }, { createdAt: "asc" }],
      }),
      stations: await db.station.findMany({ where, orderBy: { name: "asc" } }),
      types: await db.carriageType.findMany({
        where,
        orderBy: { name: "asc" },
      }),
      formations: (
        await db.formation.findMany({
          where,
          include: formationInclude,
          orderBy: { createdAt: "desc" },
        })
      ).map((f) => ({ ...f, count: formationCount(f) })),
      sets: (
        await db.physicalSet.findMany({ where, orderBy: { serial: "asc" } })
      ).map((s) => ({ ...s, code: setCode(s.serial) })),
    };
  });
  app.post("/api/periods", async (req, reply) => {
    const data = periodInput.parse(req.body);
    const period = await db.$transaction(async (tx) => {
      const p = await tx.historicalPeriod.create({
        data: {
          ...data,
          startDate: data.startDate ? new Date(data.startDate) : null,
          endDate: data.endDate ? new Date(data.endDate) : null,
        },
      });
      await audit(tx, p.id, "Period", "Created", "Manual entry", null, p);
      return p;
    });
    return reply.code(201).send(period);
  });
  app.post("/api/diagrams", async (req, reply) => {
    const data = z
      .object({
        periodId: uuid,
        number: z.string().trim().min(1).max(100),
        description: text.default(""),
      })
      .parse(req.body);
    const d = await db.$transaction(async (tx) => {
      const d = await tx.publishedDiagram.create({
        data,
        include: { period: true },
      });
      await audit(
        tx,
        d.id,
        "Published diagram",
        "Created",
        "Manual entry",
        null,
        d,
      );
      return d;
    });
    return reply.code(201).send(d);
  });
  app.put("/api/diagrams/:id", async (req) => {
    const id = uuid.parse((req.params as any).id);
    const { revision, reason, ...data } = z
      .object({
        periodId: uuid,
        number: z.string().trim().min(1).max(100),
        description: text.default(""),
        revision: z.number().int().positive(),
        reason: text.min(1),
      })
      .parse(req.body);
    return db.$transaction(async (tx) => {
      const before = await tx.publishedDiagram.findUniqueOrThrow({
        where: { id },
      });
      const result = await tx.publishedDiagram.updateMany({
        where: { id, revision },
        data: { ...data, revision: { increment: 1 } },
      });
      if (!result.count)
        throw httpError(409, "Diagram changed. Reload before saving.");
      const after = await tx.publishedDiagram.findUniqueOrThrow({
        where: { id },
      });
      await audit(tx, id, "Published diagram", "Edited", reason, before, after);
      return after;
    });
  });
  for (const kind of ["stations", "types"] as const) {
    app.post("/api/" + kind, async (req, reply) => {
      const data = z
        .object({
          name: z.string().trim().min(1).max(200),
          code: z.string().trim().max(100).nullable().optional(),
          notes: text.default(""),
        })
        .parse(req.body);
      const row = await db.$transaction(async (tx) => {
        const row =
          kind === "stations"
            ? await tx.station.create({
                data: { name: data.name, notes: data.notes },
              })
            : await tx.carriageType.create({ data });
        await audit(tx, row.id, kind, "Created", "Manual entry", null, row);
        return row;
      });
      return reply.code(201).send(row);
    });
  }
  app.post("/api/formations", async (req, reply) => {
    const { members, ...data } = formationInput.parse(req.body);
    return reply.code(201).send(
      await db.$transaction(async (tx) => {
        const f = await tx.formation.create({
          data: { ...data, members: { create: members } },
          include: formationInclude,
        });
        await audit(tx, f.id, "Formation", "Created", "Manual entry", null, f);
        return { ...f, count: formationCount(f) };
      }),
    );
  });
  app.put("/api/formations/:id", async (req) => {
    const raw = z
      .object({ revision: z.number().int().positive(), reason: text.min(1) })
      .parse(req.body);
    const { members, ...data } = formationInput.parse(req.body);
    const id = uuid.parse((req.params as any).id);
    return db.$transaction(async (tx) => {
      const before = await tx.formation.findUniqueOrThrow({
        where: { id },
        include: formationInclude,
      });
      const updated = await tx.formation.updateMany({
        where: { id, revision: raw.revision },
        data: { ...data, revision: { increment: 1 } },
      });
      if (!updated.count)
        throw httpError(409, "Formation changed. Reload before saving.");
      await tx.formationMember.deleteMany({ where: { formationId: id } });
      for (const member of members)
        await tx.formationMember.create({
          data: { ...member, formationId: id },
        });
      const after = await tx.formation.findUniqueOrThrow({
        where: { id },
        include: formationInclude,
      });
      await audit(tx, id, "Formation", "Edited", raw.reason, before, after);
      return { ...after, count: formationCount(after) };
    });
  });
  app.post("/api/physical-sets", async (req, reply) => {
    const data = z
      .object({ label: text.default(""), notes: text.default("") })
      .strict()
      .parse(req.body);
    return reply.code(201).send(
      await db.$transaction(async (tx) => {
        const s = await tx.physicalSet.create({ data });
        await audit(
          tx,
          s.id,
          "Physical set",
          "Created",
          "Manual entry",
          null,
          s,
        );
        return { ...s, code: setCode(s.serial) };
      }),
    );
  });
  app.put("/api/physical-sets/:id", async (req) => {
    const { reason, ...data } = z
      .object({
        label: text.default(""),
        notes: text.default(""),
        reason: text.min(1),
      })
      .strict()
      .parse(req.body);
    const id = uuid.parse((req.params as any).id);
    return db.$transaction(async (tx) => {
      const before = await tx.physicalSet.findUniqueOrThrow({ where: { id } });
      const after = await tx.physicalSet.update({ where: { id }, data });
      await audit(tx, id, "Physical set", "Edited", reason, before, after);
      return { ...after, code: setCode(after.serial) };
    });
  });
}
