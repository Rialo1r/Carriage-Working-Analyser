import Fastify from "fastify";
import { registerExports } from "./export-routes.js";
import { registerTimetable } from "./timetable-routes.js";
import { registerRotations } from "./rotation-routes.js";
import { registerDaily } from "./daily-routes.js";
import { registerOcr } from "./ocr-routes.js";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import { PrismaPg } from "@prisma/adapter-pg";
import { PDFDocument } from "pdf-lib";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink, access } from "node:fs/promises";
import path from "node:path";

const uuid = z.string().uuid();
const short = z.string().trim().max(500);
const optional = short.nullable().optional();
const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
export const statuses = [
  "Not reviewed",
  "Needs correction",
  "Partially verified",
  "Verified against source",
  "Connection unresolved",
  "Ready for export",
] as const;
const diagramInput = z.object({
  publishedNumber: optional,
  title: optional,
  documentId: uuid.nullable().optional(),
  operatingPeriod: optional,
  operatingDays: z.array(z.enum(days)).max(7).default([]),
  calendarNotes: z.string().max(10000).default(""),
  compositionText: z.string().max(10000).default(""),
  instructions: z.string().max(10000).default(""),
  notes: z.string().max(10000).default(""),
});
const movementInput = z.object({
  sequence: z.number().int().min(1).max(10000),
  trainNumber: optional,
  originId: uuid.nullable().optional(),
  destinationId: uuid.nullable().optional(),
  departureMinutes: z.number().int().min(0).max(10079).nullable().optional(),
  arrivalMinutes: z.number().int().min(0).max(10079).nullable().optional(),
  originalTimeText: z.string().max(1000).default(""),
  activity: z
    .enum(["Unknown", "Passenger", "Empty coaching stock", "Shunting", "Other"])
    .default("Unknown"),
  notes: z.string().max(10000).default(""),
});
const diagramInclude = {
  document: true,
  operations: {
    include: {
      assignments: {
        include: { formation: { include: { physicalSet: true } } },
      },
    },
  },
  movements: {
    orderBy: { sequence: "asc" as const },
    include: {
      origin: { include: { aliases: true } },
      destination: { include: { aliases: true } },
      calls: { include: { station: { include: { aliases: true } } } },
    },
  },
  evidence: { include: { page: { include: { file: true } } } },
  verifications: { orderBy: { createdAt: "desc" as const } },
};

export async function buildApp(
  options: {
    databaseUrl?: string;
    storageDir?: string;
    serveWeb?: boolean;
  } = {},
) {
  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: options.databaseUrl || process.env.DATABASE_URL,
    }),
  });
  const storage = path.resolve(
    options.storageDir || process.env.STORAGE_DIR || ".data",
  );
  await mkdir(storage, { recursive: true });
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    bodyLimit: 1024 * 1024,
  });
  await app.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 6 },
  });
  app.addHook("onRequest", async (req, reply) => {
    // Personal application: reject browser writes originating from another site.
    const origin = req.headers.origin;
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      origin &&
      new URL(origin).host !== req.headers.host
    )
      return reply
        .code(403)
        .send({ error: "Cross-origin writes are not permitted" });
  });
  app.setErrorHandler((error: any, _req, reply) => {
    if (error instanceof z.ZodError)
      return reply
        .code(400)
        .send({ error: "Invalid input", details: error.issues });
    if (error instanceof Prisma.PrismaClientKnownRequestError)
      return reply.code(error.code === "P2025" ? 404 : 409).send({
        error: "Record missing or conflicts with existing research data",
      });
    if (error.statusCode && error.statusCode < 500)
      return reply.code(error.statusCode).send({ error: error.message });
    app.log.error(error);
    return reply.code(500).send({ error: "Operation failed; see server log" });
  });
  const id = (req: any) => uuid.parse(req.params.id);
  const audit = (
    tx: any,
    entityId: string,
    entityType: string,
    action: string,
    detail: unknown,
  ) => tx.auditEvent.create({ data: { entityId, entityType, action, detail } });
  app.get("/api/health", async () => {
    await db.$queryRaw`SELECT 1`;
    return { status: "ok" };
  });
  app.get("/api/dashboard", async () => ({
    demoMode: process.env.DEMO_MODE === "true",
    documents: await db.document.count(),
    diagrams: await db.diagram.count(),
    movements: await db.movement.count(),
    verified: await db.diagram.count({
      where: { status: "Verified against source" },
    }),
    rotations: await db.rotation.count({ where: { status: "Confirmed" } }),
    unresolved: await db.diagramTransition.count({
      where: {
        OR: [
          { decision: "Pending" },
          { kind: "Unresolved gap" },
          { confidence: "Conflict" },
        ],
      },
    }),
    ocrReview: await db.ocrJob.count({
      where: { status: "Completed", revisions: { none: {} } },
    }),
    activity: await db.auditEvent.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
    }),
  }));
  app.get("/api/documents", () =>
    db.document.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        files: { include: { pages: { orderBy: { pdfPage: "asc" } } } },
      },
    }),
  );
  app.post("/api/documents", async (req, reply) => {
    const fields: Record<string, string> = {};
    let bytes: Buffer | undefined;
    let filename = "source.pdf";
    for await (const part of req.parts()) {
      if (part.type === "file") {
        filename = path.basename(part.filename);
        bytes = await part.toBuffer();
      } else fields[part.fieldname] = String(part.value);
    }
    const metadata = z
      .object({
        title: z.string().trim().min(1).max(500),
        sourceDate: optional,
        operatingPeriod: optional,
        region: optional,
        description: z.string().max(10000).optional(),
      })
      .parse(fields);
    if (!bytes || !bytes.subarray(0, 1024).includes(Buffer.from("%PDF-")))
      return reply.code(400).send({ error: "A valid PDF is required" });
    let pdf: PDFDocument;
    try {
      pdf = await PDFDocument.load(bytes);
    } catch {
      return reply.code(400).send({
        error:
          "PDF cannot be read. Encrypted or damaged files are not supported.",
      });
    }
    if (pdf.getPageCount() < 1)
      return reply.code(400).send({ error: "PDF has no pages" });
    const key = `${randomUUID()}.pdf`;
    await writeFile(path.join(storage, key), bytes, { flag: "wx" });
    try {
      const result = await db.$transaction(async (tx) => {
        const doc = await tx.document.create({
          data: {
            ...metadata,
            files: {
              create: {
                originalName: filename,
                storageKey: key,
                sha256: createHash("sha256").update(bytes!).digest("hex"),
                size: bytes!.length,
                pageCount: pdf.getPageCount(),
                pages: {
                  create: Array.from(
                    { length: pdf.getPageCount() },
                    (_, i) => ({ pdfPage: i + 1 }),
                  ),
                },
              },
            },
          },
          include: { files: { include: { pages: true } } },
        });
        await audit(tx, doc.id, "Document", "Uploaded", { title: doc.title });
        return doc;
      });
      return reply.code(201).send(result);
    } catch (e) {
      await unlink(path.join(storage, key));
      throw e;
    }
  });
  app.get("/api/files/:id", async (req, reply) => {
    const file = await db.documentFile.findUnique({ where: { id: id(req) } });
    if (!file) return reply.code(404).send({ error: "File not found" });
    reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", 'inline; filename="source.pdf"')
      .header("X-Content-Type-Options", "nosniff");
    return readFile(path.join(storage, file.storageKey));
  });
  app.patch("/api/pages/:id", async (req) => {
    const data = z
      .object({ printedLabel: z.string().max(100).nullable() })
      .parse(req.body);
    return db.$transaction(async (tx) => {
      const old = await tx.documentPage.findUniqueOrThrow({
        where: { id: id(req) },
      });
      const page = await tx.documentPage.update({
        where: { id: old.id },
        data,
      });
      await audit(tx, old.id, "DocumentPage", "Printed label updated", {
        before: old.printedLabel,
        after: page.printedLabel,
      });
      return page;
    });
  });
  app.get("/api/stations", () =>
    db.station.findMany({
      orderBy: { name: "asc" },
      include: { aliases: true },
    }),
  );
  app.post("/api/stations", async (req, reply) => {
    const data = z
      .object({
        name: z.string().trim().min(1).max(200),
        aliases: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
      })
      .parse(req.body);
    return reply.code(201).send(
      await db.station.create({
        data: {
          name: data.name,
          aliases: { create: data.aliases.map((name) => ({ name })) },
        },
      }),
    );
  });
  app.get("/api/diagrams", async (req) => {
    const q = z
      .object({
        search: z.string().max(200).optional(),
        station: uuid.optional(),
      })
      .parse(req.query);
    const result = await db.diagram.findMany({
      include: diagramInclude,
      orderBy: { createdAt: "desc" },
      where: q.station
        ? {
            movements: {
              some: {
                OR: [{ originId: q.station }, { destinationId: q.station }],
              },
            },
          }
        : undefined,
    });
    if (!q.search) return result;
    const term = q.search.toLowerCase();
    return result.filter((d) =>
      [
        d.publishedNumber,
        d.title,
        d.notes,
        ...d.movements.flatMap((m) => [
          m.trainNumber,
          m.origin?.name,
          m.destination?.name,
          ...m.calls.flatMap((c) => [
            c.station.name,
            ...c.station.aliases.map((a) => a.name),
          ]),
          ...(m.origin?.aliases.map((a) => a.name) || []),
          ...(m.destination?.aliases.map((a) => a.name) || []),
        ]),
      ].some((v) => v?.toLowerCase().includes(term)),
    );
  });
  app.get("/api/diagrams/:id", async (req, reply) => {
    const d = await db.diagram.findUnique({
      where: { id: id(req) },
      include: diagramInclude,
    });
    return d || reply.code(404).send({ error: "Diagram not found" });
  });
  app.post("/api/diagrams", async (req, reply) => {
    const data = diagramInput.parse(req.body);
    const d = await db.$transaction(async (tx) => {
      const d = await tx.diagram.create({ data });
      await audit(tx, d.id, "Diagram", "Created", data);
      return d;
    });
    return reply.code(201).send(d);
  });
  app.put("/api/diagrams/:id", async (req) => {
    const { revision, ...data } = diagramInput
      .extend({ revision: z.number().int().positive() })
      .parse(req.body);
    return db.$transaction(async (tx) => {
      const before = await tx.diagram.findUniqueOrThrow({
        where: { id: id(req) },
      });
      const after = await tx.diagram.update({
        where: { id: before.id, revision },
        data: {
          ...data,
          revision: { increment: 1 },
          ...(["Verified against source", "Ready for export"].includes(
            before.status,
          )
            ? { status: "Needs correction" }
            : {}),
        },
      });
      await audit(tx, after.id, "Diagram", "Edited", { before, after });
      return after;
    });
  });
  app.post("/api/diagrams/:id/movements", async (req, reply) => {
    const data = movementInput.parse(req.body);
    const m = await db.$transaction(async (tx) => {
      const m = await tx.movement.create({
        data: { ...data, diagramId: id(req) },
      });
      await tx.diagram.update({
        where: { id: m.diagramId },
        data: { revision: { increment: 1 }, status: "Needs correction" },
      });
      await audit(tx, m.diagramId, "Diagram", "Movement added", m);
      return m;
    });
    return reply.code(201).send(m);
  });
  app.put("/api/movements/:id", async (req) => {
    const data = movementInput.parse(req.body);
    return db.$transaction(async (tx) => {
      const before = await tx.movement.findUniqueOrThrow({
        where: { id: id(req) },
      });
      const after = await tx.movement.update({
        where: { id: before.id },
        data,
      });
      await tx.diagram.update({
        where: { id: after.diagramId },
        data: { revision: { increment: 1 }, status: "Needs correction" },
      });
      await audit(tx, after.diagramId, "Diagram", "Movement edited", {
        before,
        after,
      });
      return after;
    });
  });
  app.post("/api/diagrams/:id/evidence", async (req, reply) => {
    const data = z
      .object({
        pageId: uuid,
        originalText: z.string().max(20000).default(""),
        transcription: z.string().max(20000).default(""),
        notes: z.string().max(10000).default(""),
      })
      .parse(req.body);
    return reply.code(201).send(
      await db.$transaction(async (tx) => {
        const e = await tx.evidence.create({
          data: { ...data, diagramId: id(req) },
        });
        await audit(tx, e.diagramId, "Diagram", "Evidence added", e);
        return e;
      }),
    );
  });
  app.post("/api/diagrams/:id/verification", async (req, reply) => {
    const data = z
      .object({
        status: z.enum(statuses),
        notes: z.string().trim().min(1).max(10000),
      })
      .parse(req.body);
    return db.$transaction(async (tx) => {
      if (
        ["Verified against source", "Ready for export"].includes(data.status) &&
        !(await tx.evidence.count({ where: { diagramId: id(req) } }))
      )
        return reply.code(400).send({
          error:
            "Add a source citation before marking this diagram verified or ready for export",
        });
      const d = await tx.diagram.update({
        where: { id: id(req) },
        data: {
          status: data.status,
          revision: { increment: 1 },
          verifications: { create: data },
        },
      });
      await audit(tx, d.id, "Diagram", "Review status changed", data);
      return d;
    });
  });
  app.get("/api/diagrams/:id/history", (req) =>
    db.auditEvent.findMany({
      where: { entityId: id(req) },
      orderBy: { createdAt: "desc" },
    }),
  );
  registerOcr(app, db, storage);
  registerDaily(app, db);
  registerRotations(app, db);
  registerTimetable(app, db);
  registerExports(app, db);
  if (options.serveWeb !== false) {
    try {
      await access(path.resolve("dist/index.html"));
      await app.register(staticFiles, { root: path.resolve("dist") });
      app.setNotFoundHandler((req, reply) =>
        req.url.startsWith("/api/")
          ? reply.code(404).send({ error: "Not found" })
          : reply.sendFile("index.html"),
      );
    } catch {
      app.log.info("Build web assets with npm run build");
    }
  }
  app.addHook("onClose", () => db.$disconnect());
  return { app, db };
}
