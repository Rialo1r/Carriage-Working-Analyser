import Fastify from "fastify";
import staticFiles from "@fastify/static";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { access } from "node:fs/promises";
import path from "node:path";
import { createDb } from "./data.js";
import { registerManagement } from "./management.js";
import { registerCatalog } from "./catalog.js";
import { registerWorkings } from "./workings.js";
import { registerTimetable } from "./timetable.js";
export async function buildApp(
  options: { databaseUrl?: string; serveWeb?: boolean } = {},
) {
  const db = createDb(options.databaseUrl);
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    bodyLimit: 2 * 1024 * 1024,
  });
  app.addHook("onRequest", async (req, reply) => {
    if (
      req.headers.origin &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method)
    ) {
      let host;
      try {
        host = new URL(req.headers.origin).host;
      } catch {
        return reply.code(403).send({ error: "Unsupported request origin" });
      }
      if (host !== req.headers.host)
        return reply
          .code(403)
          .send({ error: "Cross-origin writes are not permitted" });
    }
  });
  app.setErrorHandler((error: any, _req, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        error: error.issues
          .map((i) => i.path.join(".") + ": " + i.message)
          .join("; "),
      });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025")
        return reply.code(404).send({ error: "Record not found" });
      if (error.code === "P2002")
        return reply.code(409).send({
          error:
            "This entry or exclusive occurrence is already assigned. Nothing was reassigned.",
        });
      if (error.code === "P2003")
        return reply
          .code(400)
          .send({ error: "A referenced record does not exist." });
    }
    if (error.statusCode && error.statusCode < 500)
      return reply.code(error.statusCode).send({ error: error.message });
    app.log.error(error);
    return reply
      .code(500)
      .send({ error: "Operation failed; inspect the application log." });
  });
  app.get("/api/health", async () => {
    await db.$queryRaw`SELECT 1`;
    return {
      status: "ok",
      application: "LNER Carriage Working & Rotation Planner",
      phase: 1,
    };
  });
  app.get("/api/dashboard", async () => ({
    phase: 1,
    diagrams: await db.publishedDiagram.count(),
    workings: await db.workingDefinition.count(),
    physicalSets: await db.physicalSet.count(),
    assignments: await db.rotationAssignment.count({ where: { active: true } }),
    unresolvedInstructions: await db.nextWorkingReference.count({
      where: {
        OR: [{ kind: "UNKNOWN" }, { kind: "TARGET", targetWorkingId: null }],
      },
    }),
    recent: await db.auditEvent.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
    }),
  }));
  registerCatalog(app, db);
  registerManagement(app, db);
  registerWorkings(app, db);
  registerTimetable(app, db);
  if (options.serveWeb !== false) {
    try {
      await access(path.resolve("dist/index.html"));
      await app.register(staticFiles, { root: path.resolve("dist") });
      app.setNotFoundHandler((req, reply) =>
        req.url.startsWith("/api/")
          ? reply.code(404).send({ error: "Endpoint not found" })
          : reply.sendFile("index.html"),
      );
    } catch {
      app.log.info("Frontend not built; run npm run build");
    }
  }
  app.addHook("onClose", () => db.$disconnect());
  return { app, db };
}
