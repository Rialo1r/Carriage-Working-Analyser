import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import path from "node:path";
const id = z.string().uuid();
export function registerOcr(
  app: FastifyInstance,
  db: PrismaClient,
  storage: string,
) {
  app.get("/api/ocr", () =>
    db.ocrJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        page: { include: { file: { include: { document: true } } } },
        revisions: { orderBy: { createdAt: "desc" } },
      },
    }),
  );
  app.post("/api/ocr", async (req, reply) => {
    const data = z
      .object({
        pageId: id,
        rotation: z
          .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
          .default(0),
        layout: z
          .union([z.literal(3), z.literal(4), z.literal(6), z.literal(11)])
          .default(6),
        region: z
          .object({
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
            width: z.number().positive().max(1),
            height: z.number().positive().max(1),
          })
          .refine(
            (r) => r.x + r.width <= 1 && r.y + r.height <= 1,
            "Crop must fit inside the page",
          )
          .optional(),
      })
      .parse(req.body);
    return reply.code(201).send(await db.ocrJob.create({ data }));
  });
  app.get("/api/ocr/:id/image", async (req, reply) => {
    const job = await db.ocrJob.findUniqueOrThrow({
      where: { id: id.parse((req.params as any).id) },
    });
    if (!job.imageKey)
      return reply.code(404).send({ error: "Image not ready" });
    return reply
      .type("image/png")
      .send(await readFile(path.join(storage, job.imageKey)));
  });
  app.post("/api/ocr/:id/revisions", async (req, reply) => {
    const data = z
      .object({
        text: z.string().max(200000),
        notes: z.string().trim().min(1).max(10000),
      })
      .parse(req.body);
    return reply.code(201).send(
      await db.$transaction(async (tx) => {
        const job = await tx.ocrJob.findUniqueOrThrow({
          where: { id: id.parse((req.params as any).id) },
        });
        if (job.status !== "Completed")
          throw Object.assign(new Error("OCR must complete first"), {
            statusCode: 409,
          });
        const r = await tx.transcriptionRevision.create({
          data: { ...data, jobId: job.id },
        });
        await tx.auditEvent.create({
          data: {
            entityId: job.id,
            entityType: "Transcription",
            action: "Manual revision saved",
            detail: { revisionId: r.id, notes: data.notes },
          },
        });
        return r;
      }),
    );
  });
  app.get("/api/correction-rules", () => db.correctionRule.findMany());
  app.post("/api/correction-rules", async (req, reply) =>
    reply.code(201).send(
      await db.correctionRule.create({
        data: z
          .object({
            original: z.string().min(1).max(200),
            replacement: z.string().min(1).max(200),
            notes: z.string().max(2000).default(""),
            enabled: z.boolean().default(true),
          })
          .parse(req.body),
      }),
    ),
  );
  app.patch("/api/correction-rules/:id", (req) =>
    db.correctionRule.update({
      where: { id: id.parse((req.params as any).id) },
      data: z.object({ enabled: z.boolean() }).parse(req.body),
    }),
  );
  app.get("/api/ocr/:id/suggestions", async (req) => {
    const job = await db.ocrJob.findUniqueOrThrow({
      where: { id: id.parse((req.params as any).id) },
      include: { revisions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    const text = job.revisions[0]?.text ?? job.rawText ?? "";
    const rules = await db.correctionRule.findMany({
      where: { enabled: true },
    });
    return rules
      .filter((r) => text.includes(r.original))
      .map((r) => ({
        ruleId: r.id,
        original: r.original,
        replacement: r.replacement,
        notes: r.notes,
      }));
  });
  app.get("/api/source-search", async (req) => {
    const q = z
      .object({ q: z.string().trim().min(2).max(200) })
      .parse(req.query).q;
    return db.ocrJob.findMany({
      where: {
        OR: [
          { rawText: { contains: q, mode: "insensitive" } },
          {
            revisions: { some: { text: { contains: q, mode: "insensitive" } } },
          },
        ],
      },
      take: 100,
      include: {
        page: { include: { file: { include: { document: true } } } },
        revisions: { orderBy: { createdAt: "desc" } },
      },
    });
  });
  app.post("/api/ocr/:id/extract", async (req, reply) => {
    const data = z
      .object({
        publishedNumber: z.string().max(200).optional(),
        title: z.string().max(500).optional(),
        originalText: z.string().max(20000),
        transcription: z.string().max(20000),
        notes: z.string().trim().min(1).max(10000),
      })
      .parse(req.body);
    return reply.code(201).send(
      await db.$transaction(async (tx) => {
        const job = await tx.ocrJob.findUniqueOrThrow({
          where: { id: id.parse((req.params as any).id) },
          include: { page: { include: { file: true } } },
        });
        if (job.status !== "Completed")
          throw Object.assign(new Error("OCR must complete first"), {
            statusCode: 409,
          });
        const d = await tx.diagram.create({
          data: {
            publishedNumber: data.publishedNumber,
            title: data.title,
            documentId: job.page.file.documentId,
            status: "Needs correction",
            notes: data.notes,
            evidence: {
              create: {
                pageId: job.pageId,
                originalText: data.originalText,
                transcription: data.transcription,
                notes: `OCR job ${job.id}. ${data.notes}`,
              },
            },
          },
        });
        await tx.auditEvent.create({
          data: {
            entityId: d.id,
            entityType: "Diagram",
            action: "Created from selected OCR text",
            detail: { jobId: job.id },
          },
        });
        return d;
      }),
    );
  });
}
