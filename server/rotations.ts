import { createHash } from "node:crypto";
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  analysisView,
  loadOccurrence,
  checkedPair,
} from "./analysis-service.js";
import { approvePair } from "./research-guards.js";
import { dateKey, setCode, weekday, onCalendar } from "./calendar.js";
import {
  effectiveFormation,
  effectiveChanges,
  minuteAt,
} from "./continuity.js";
import { audit, json } from "./data.js";
import { uuid, text, httpError } from "./validation.js";
export function repeatLength(nodes: any[], links: any[]) {
  if (nodes.length < 3 || links.length < nodes.length - 1) return null;
  const state = (o: any) =>
    JSON.stringify({
      w: o.workingId,
      f: effectiveFormation(o),
      c: effectiveChanges(o),
      instructions: o.working.instructions
        .filter(
          (i: any) =>
            !i.weekdays.length ||
            i.weekdays.includes(weekday(new Date(o.date))),
        )
        .map((i: any) => i.text),
    });
  const map = new Map(nodes.map((n) => [dateKey(n.date), state(n)]));
  const first = new Date(nodes[0].date).getTime(),
    last = new Date(nodes.at(-1).date).getTime();
  for (
    let days = 1;
    days <= Math.floor((last - first) / 86400000 / 2);
    days++
  ) {
    let matches = 0,
      valid = true;
    for (const n of nodes) {
      const shifted = new Date(new Date(n.date).getTime() + days * 86400000);
      if (shifted.getTime() > last) continue;
      if (map.get(dateKey(shifted)) !== state(n)) {
        valid = false;
        break;
      }
      matches++;
    }
    if (valid && matches >= 2) return days;
  }
  return null;
}
export async function generateChains(db: any, id: string) {
  return db.$transaction(
    async (tx: any) => {
      const view = await analysisView(tx, id);
      if (view.stale)
        throw httpError(
          409,
          "The roster changed. Check all connections again before generating chains.",
        );
      const nodes = await tx.workingOccurrence.findMany({
        where: {
          working: { diagram: { periodId: view.periodId } },
          date: { gte: view.startDate, lte: view.endDate },
        },
        include: {
          working: { include: (await import("./data.js")).workingInclude },
          assignments: {
            where: { active: true },
            include: { physicalSet: true },
          },
        },
        orderBy: [{ date: "asc" }, { workingId: "asc" }],
      });
      const active = nodes.filter(
        (n: any) =>
          !n.working.archived &&
          !n.working.diagram.archived &&
          onCalendar(
            n.working.calendar,
            new Date(n.date),
            n.working.diagram.period,
          ),
      );
      const map = new Map<string, any>(active.map((n: any) => [n.id, n]));
      const outgoing = new Map<string, any>();
      for (const p of view.proposals) {
        if (
          p.review?.decision === "Rejected" ||
          p.classification === "Incompatible"
        )
          continue;
        if (p.approved || ["EXPLICIT", "STABLED"].includes(p.kind)) {
          const old = outgoing.get(p.fromId);
          if (!old || p.approved) outgoing.set(p.fromId, p);
        }
      }
      const incoming = new Map<string, number>();
      for (const p of outgoing.values())
        if (map.has(p.toId))
          incoming.set(p.toId, (incoming.get(p.toId) || 0) + 1);
      const visited = new Set<string>(),
        results: any[] = [];
      const roots = [
        ...active.filter((n: any) => !incoming.has(n.id)),
        ...active,
      ];
      for (const root of roots) {
        if (visited.has(root.id)) continue;
        const path: any[] = [],
          links: any[] = [],
          warnings: string[] = [];
        let cursor: any = root;
        while (cursor && !visited.has(cursor.id)) {
          visited.add(cursor.id);
          path.push(cursor);
          const p = outgoing.get(cursor.id);
          if (!p) {
            warnings.push(
              "Open end: no approved or explicitly entered usable continuation. Candidate matches were not chosen automatically.",
            );
            break;
          }
          if ((incoming.get(p.toId) || 0) > 1) {
            warnings.push(
              "Conflicting predecessors: more than one stock chain enters the next daily working.",
            );
            break;
          }
          if (!map.has(p.toId)) {
            warnings.push(
              "The continuation extends beyond the displayed analysis range.",
            );
            break;
          }
          if (visited.has(p.toId)) {
            warnings.push(
              "The continuation joins another chain or revisits a dated occurrence; review the alternatives.",
            );
            break;
          }
          links.push({
            fromId: p.fromId,
            toId: p.toId,
            classification: p.classification,
            checks: p.checks,
            storage: p.storage,
            approved: p.approved,
          });
          cursor = map.get(p.toId);
        }
        const snapshot = {
          nodes: path,
          links,
          warnings,
          repeatDays: repeatLength(path, links),
          inputVersion: view.inputVersion,
          analysisId: id,
          start: view.startDate,
          end: view.endDate,
        };
        const signature = createHash("sha256")
          .update(JSON.stringify(json(snapshot)))
          .digest("hex");
        const proposal = await tx.chainProposal.upsert({
          where: { analysisId_signature: { analysisId: id, signature } },
          create: { analysisId: id, signature, snapshot: json(snapshot) },
          update: {},
        });
        results.push(proposal);
      }
      return results;
    },
    { timeout: 120000 },
  );
}
export async function assertAllocation(tx: any, setId: string, o: any) {
  await tx.$queryRaw`SELECT "id" FROM "PhysicalSet" WHERE "id" = ${setId}::uuid FOR UPDATE`;
  const physical = await tx.physicalSet.findUniqueOrThrow({
    where: { id: setId },
  });
  if (physical.archived)
    throw httpError(400, "Restore the physical set before assigning it.");
  const existing = await tx.rotationAssignment.findFirst({
    where: { active: true, occurrenceId: o.id, physicalSetId: { not: setId } },
  });
  if (existing && o.working.exclusive)
    throw httpError(
      409,
      "This exclusive daily occurrence already belongs to another physical set. Nothing was reassigned.",
    );
  const others = await tx.rotationAssignment.findMany({
    where: { active: true, physicalSetId: setId, occurrenceId: { not: o.id } },
    include: { occurrence: { include: { working: true } } },
  });
  for (const a of others) {
    const s = minuteAt(o),
      e = minuteAt(o, true),
      as = minuteAt(a.occurrence),
      ae = minuteAt(a.occurrence, true);
    if (s != null && e != null && as != null && ae != null && s < ae && as < e)
      throw httpError(
        409,
        "This physical set already has an overlapping working. Nothing was reassigned.",
      );
  }
}
export function registerRotations(app: FastifyInstance, db: PrismaClient) {
  app.post("/api/analysis/:id/chains", (req) =>
    generateChains(db, uuid.parse((req.params as any).id)),
  );
  app.get("/api/analysis/:id/chains", (req) =>
    db.chainProposal.findMany({
      where: { analysisId: uuid.parse((req.params as any).id) },
      orderBy: { createdAt: "desc" },
    }),
  );
  app.get("/api/rotations", async () => {
    const rows = await db.savedRotation.findMany({
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(
      rows.map(async (r) => {
        const s = await db.physicalSet.findUniqueOrThrow({
          where: { id: r.physicalSetId },
        });
        return { ...r, physicalSet: { ...s, code: setCode(s.serial) } };
      }),
    );
  });
  app.post("/api/chains/:id/save", async (req, reply) => {
    const id = uuid.parse((req.params as any).id),
      data = z
        .object({
          physicalSetId: uuid.nullable().default(null),
          name: text.min(1),
          reason: text.min(1),
          acknowledge: z.boolean().default(false),
          locked: z.boolean().default(true),
        })
        .parse(req.body);
    return reply.code(201).send(
      await db.$transaction(
        async (tx) => {
          await tx.datasetState.upsert({
            where: { id: "main" },
            create: { id: "main", version: 0 },
            update: { version: { increment: 0 } },
          });
          const p = await tx.chainProposal.findUniqueOrThrow({ where: { id } });
          if (p.status === "Rejected")
            throw httpError(
              409,
              "This proposal was rejected. Generate a new reviewed proposal.",
            );
          const saved = await tx.savedRotation.findUnique({
            where: { proposalId: id },
          });
          if (saved) return saved;
          const snapshot = p.snapshot as any;
          const state = await tx.datasetState.findUnique({
            where: { id: "main" },
          });
          if (state?.version !== snapshot.inputVersion)
            throw httpError(
              409,
              "The roster changed. Recheck and generate a fresh proposal.",
            );
          if (
            !data.acknowledge &&
            (snapshot.warnings.length ||
              snapshot.links.some((l: any) =>
                l.checks.some((c: any) => c.state !== "Pass"),
              ))
          )
            throw httpError(
              400,
              "Acknowledge all displayed uncertainties before saving.",
            );
          const set = data.physicalSetId
            ? await tx.physicalSet.findUniqueOrThrow({
                where: { id: data.physicalSetId },
              })
            : await tx.physicalSet.create({ data: { label: data.name } });
          if (set.archived)
            throw httpError(
              400,
              "Restore the physical set before assigning it.",
            );
          for (const n of snapshot.nodes) {
            const o = await loadOccurrence(tx, n.id);
            await assertAllocation(tx, set.id, o);
          }
          for (const l of snapshot.links)
            await approvePair(
              tx,
              l.fromId,
              l.toId,
              data.reason,
              data.acknowledge,
            );
          const rotation = await tx.savedRotation.create({
            data: {
              proposalId: id,
              physicalSetId: set.id,
              name: data.name,
              reason: data.reason,
              locked: data.locked,
              snapshot: p.snapshot!,
            },
          });
          for (const n of snapshot.nodes) {
            const o = await loadOccurrence(tx, n.id);
            const old = await tx.rotationAssignment.findUnique({
              where: {
                physicalSetId_occurrenceId: {
                  physicalSetId: set.id,
                  occurrenceId: n.id,
                },
              },
            });
            if (!old?.active) {
              await tx.rotationAssignment.upsert({
                where: {
                  physicalSetId_occurrenceId: {
                    physicalSetId: set.id,
                    occurrenceId: n.id,
                  },
                },
                create: {
                  physicalSetId: set.id,
                  occurrenceId: n.id,
                  exclusiveKey: o.working.exclusive ? n.id : null,
                  definitionRevision: o.working.revision,
                  notes: data.reason,
                },
                update: {
                  active: true,
                  exclusiveKey: o.working.exclusive ? n.id : null,
                  definitionRevision: o.working.revision,
                  notes: data.reason,
                },
              });
            }
          }
          await tx.chainProposal.update({
            where: { id },
            data: { status: "Saved" },
          });
          await audit(
            tx,
            rotation.id,
            "Rotation",
            "Approved",
            data.reason,
            null,
            rotation,
          );
          return rotation;
        },
        { timeout: 120000 },
      ),
    );
  });
  app.post("/api/chains/:id/reject", async (req) => {
    const id = uuid.parse((req.params as any).id),
      { reason } = z.object({ reason: text.min(1) }).parse(req.body);
    return db.$transaction(async (tx) => {
      const old = await tx.chainProposal.findUniqueOrThrow({ where: { id } });
      if (old.status === "Saved")
        throw httpError(
          409,
          "An approved rotation must be retained. Unlock it and review its connections separately.",
        );
      const row = await tx.chainProposal.update({
        where: { id },
        data: { status: "Rejected" },
      });
      await audit(tx, id, "Rotation review", "Rejected", reason, old, row);
      return row;
    });
  });
  app.post("/api/rotations/:id/lock", async (req) => {
    const id = uuid.parse((req.params as any).id),
      data = z
        .object({ locked: z.boolean(), reason: text.min(1) })
        .parse(req.body);
    return db.$transaction(async (tx) => {
      const old = await tx.savedRotation.findUniqueOrThrow({ where: { id } }),
        row = await tx.savedRotation.update({
          where: { id },
          data: { locked: data.locked },
        });
      await audit(
        tx,
        id,
        "Rotation review",
        data.locked ? "Locked" : "Unlocked",
        data.reason,
        old,
        row,
      );
      return row;
    });
  });
}
