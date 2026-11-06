import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { stockConflicts } from "./domain.js";
import { dailyInclude } from "./daily-routes.js";
import { assessConnection, buildRotation } from "./rotation-engine.js";
const uuid = z.string().uuid(),
  note = z.string().trim().min(1).max(10000);
export function registerRotations(app: FastifyInstance, db: PrismaClient) {
  const id = (req: any) => uuid.parse(req.params.id);
  const full = async (scenarioId: string) => {
    const scenario = await db.analysisScenario.findUniqueOrThrow({
      where: { id: scenarioId },
    });
    const diagrams = await db.diagram.findMany({
      where: { id: { in: scenario.diagramIds } },
      include: dailyInclude,
    });
    return { scenario, diagrams };
  };
  app.get("/api/scenarios", () =>
    db.analysisScenario.findMany({ orderBy: { createdAt: "desc" } }),
  );
  app.post("/api/scenarios", async (req, reply) => {
    const data = z
      .object({
        name: note,
        startDate: z.iso.date(),
        endDate: z.iso.date(),
        diagramIds: z.array(uuid).min(1).max(500),
        assumptions: note,
      })
      .refine(
        (d) =>
          new Date(d.endDate) > new Date(d.startDate) &&
          new Date(d.endDate).getTime() - new Date(d.startDate).getTime() <=
            366 * 86400000,
        "Choose an increasing range up to 366 days",
      )
      .parse(req.body);
    const count = await db.diagram.count({
      where: { id: { in: data.diagramIds } },
    });
    if (count !== new Set(data.diagramIds).size)
      return reply
        .code(400)
        .send({ error: "Scenario contains missing diagrams" });
    return reply.code(201).send(
      await db.analysisScenario.create({
        data: {
          ...data,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
        },
      }),
    );
  });
  app.get("/api/scenarios/:id", async (req) => ({
    ...(await full(id(req))),
    transitions: await db.diagramTransition.findMany({
      where: { scenarioId: id(req) },
      include: { from: true, to: true },
      orderBy: { createdAt: "asc" },
    }),
    rotations: await db.rotation.findMany({ where: { scenarioId: id(req) } }),
  }));
  app.post("/api/scenarios/:id/analyse", async (req) => {
    const { scenario, diagrams } = await full(id(req));
    let created = 0;
    for (const from of diagrams)
      for (const to of diagrams) {
        if (!from.movements.length || !to.movements.length) continue;
        const assessed = assessConnection(from, to, 1, scenario);
        if (assessed.kind === "Unresolved gap") continue;
        const exists = await db.diagramTransition.findUnique({
          where: {
            scenarioId_fromId_toId_dayOffset: {
              scenarioId: scenario.id,
              fromId: from.id,
              toId: to.id,
              dayOffset: 1,
            },
          },
        });
        if (!exists) {
          await db.diagramTransition.create({
            data: {
              scenarioId: scenario.id,
              fromId: from.id,
              toId: to.id,
              dayOffset: 1,
              confidence: assessed.confidence,
              kind: assessed.kind,
              checks: assessed.checks,
            },
          });
          created++;
        }
      }
    return { created };
  });
  app.post("/api/scenarios/:id/connections", async (req, reply) => {
    const data = z
      .object({
        fromId: uuid,
        toId: uuid,
        dayOffset: z.number().int().min(1).max(14),
        rationale: note,
        transferMovementId: uuid.optional(),
      })
      .parse(req.body);
    const { scenario, diagrams } = await full(id(req));
    const from = diagrams.find((d) => d.id === data.fromId),
      to = diagrams.find((d) => d.id === data.toId);
    if (!from || !to)
      return reply
        .code(400)
        .send({ error: "Both diagrams must be in this scenario" });
    let transfer: any;
    if (data.transferMovementId) {
      transfer = await db.movement.findUniqueOrThrow({
        where: { id: data.transferMovementId },
        include: { diagram: { include: { evidence: true } } },
      });
      if (!transfer.diagram.evidence.length)
        return reply.code(400).send({
          error: "Documented transfer must belong to a source-cited diagram",
        });
    }
    const assessed = assessConnection(
      from,
      to,
      data.dayOffset,
      scenario,
      transfer,
    );
    return reply.code(201).send(
      await db.diagramTransition.create({
        data: {
          ...data,
          scenarioId: scenario.id,
          checks: assessed.checks,
          confidence: assessed.confidence,
          kind: assessed.kind,
        },
      }),
    );
  });
  app.post("/api/connections/:id/review", async (req, reply) => {
    const data = z
      .object({
        decision: z.enum(["Approved", "Rejected", "Pending"]),
        confidence: z.enum([
          "Confirmed",
          "Probable",
          "Possible",
          "Conflict",
          "Unknown",
        ]),
        rationale: note,
        evidenceId: uuid.optional(),
      })
      .parse(req.body);
    const link = await db.diagramTransition.findUniqueOrThrow({
      where: { id: id(req) },
    });
    const { scenario, diagrams } = await full(link.scenarioId);
    const from = diagrams.find((d) => d.id === link.fromId)!,
      to = diagrams.find((d) => d.id === link.toId)!;
    const transfer = link.transferMovementId
      ? await db.movement.findUnique({ where: { id: link.transferMovementId } })
      : undefined;
    const assessed = assessConnection(
      from,
      to,
      link.dayOffset,
      scenario,
      transfer,
    );
    if (
      data.decision === "Approved" &&
      (assessed.confidence === "Conflict" || data.confidence === "Conflict")
    )
      return reply.code(409).send({
        error: "Resolve conflicting evidence before approving this connection",
      });
    if (data.confidence === "Confirmed") {
      if (!data.evidenceId)
        return reply.code(400).send({
          error: "Confirmed continuity requires explicit source evidence",
        });
      const evidence = await db.evidence.findUniqueOrThrow({
        where: { id: data.evidenceId },
      });
      if (
        ![link.fromId, link.toId].includes(evidence.diagramId) ||
        !evidence.originalText.trim()
      )
        return reply.code(400).send({
          error: "Cite explicit source text attached to one of these diagrams",
        });
      if (assessed.kind === "Unresolved gap")
        return reply
          .code(409)
          .send({ error: "A missing transfer cannot be confirmed" });
    }
    return db.$transaction(async (tx) => {
      const result = await tx.diagramTransition.update({
        where: { id: link.id },
        data: { ...data, checks: assessed.checks, kind: assessed.kind },
      });
      await tx.auditEvent.create({
        data: {
          entityId: link.id,
          entityType: "Connection",
          action: "Connection reviewed",
          detail: { before: link, after: result } as any,
        },
      });
      return result;
    });
  });
  app.post("/api/scenarios/:id/rotations", async (req, reply) => {
    const data = z
      .object({
        name: note,
        startDiagramId: uuid,
        physicalSetId: uuid.optional(),
        notes: note,
      })
      .parse(req.body);
    const { scenario, diagrams } = await full(id(req));
    const links = await db.diagramTransition.findMany({
      where: { scenarioId: scenario.id, decision: "Approved" },
    });
    const map = new Map(diagrams.map((d) => [d.id, d]));
    const current = await Promise.all(
      links.map(async (l) => {
        const transfer = l.transferMovementId
          ? await db.movement.findUnique({
              where: { id: l.transferMovementId },
            })
          : undefined;
        const assessment = assessConnection(
          map.get(l.fromId),
          map.get(l.toId),
          l.dayOffset,
          scenario,
          transfer,
        );
        return {
          ...l,
          checks: assessment.checks,
          confidence:
            assessment.confidence === "Conflict" ? "Conflict" : l.confidence,
          kind: assessment.kind,
        };
      }),
    );
    const result = buildRotation(data.startDiagramId, current, map, scenario);
    if (data.physicalSetId) {
      const issues = stockConflicts(
        await db.formation.findMany({
          where: { physicalSetId: data.physicalSetId },
          include: {
            assignments: {
              include: {
                operation: {
                  include: { diagram: { include: { movements: true } } },
                },
              },
            },
          },
        }),
      );
      if (issues.length) {
        result.issues.push(...issues.map((i) => i.reason));
        result.repeats = false;
        result.status = "Needs review";
      }
    }
    if (!result.steps.length)
      return reply
        .code(400)
        .send({ error: "Starting diagram is not in scenario" });
    return reply.code(201).send(
      await db.rotation.create({
        data: {
          scenarioId: scenario.id,
          name: data.name,
          physicalSetId: data.physicalSetId,
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
          notes: [data.notes, ...result.issues].join("\n"),
        },
      }),
    );
  });
  app.get("/api/connections", () =>
    db.diagramTransition.findMany({
      include: { from: true, to: true, scenario: true },
      orderBy: { updatedAt: "desc" },
    }),
  );
  app.get("/api/station-analysis/:id", async (req) => {
    const stationId = id(req);
    const diagrams = await db.diagram.findMany({ include: dailyInclude });
    return {
      station: await db.station.findUniqueOrThrow({ where: { id: stationId } }),
      starting: diagrams.filter((d) => d.movements[0]?.originId === stationId),
      finishing: diagrams.filter(
        (d) => d.movements.at(-1)?.destinationId === stationId,
      ),
      passing: diagrams.filter((d) =>
        d.movements.some((m) => m.calls.some((c) => c.stationId === stationId)),
      ),
      connections: await db.diagramTransition
        .findMany({
          include: {
            from: { include: dailyInclude },
            to: { include: dailyInclude },
          },
        })
        .then((ls) =>
          ls.filter(
            (l) =>
              l.from.movements.at(-1)?.destinationId === stationId ||
              l.to.movements[0]?.originId === stationId,
          ),
        ),
    };
  });
}
