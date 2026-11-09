import { assertAllocation } from "./rotations.js";
import { guardLockedLink } from "./research-guards.js";
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { workingInclude, audit, formationInclude } from "./data.js";
import {
  addDays,
  dateKey,
  weekday,
  onCalendar,
  targetDate,
  formationCount,
  setCode,
} from "./calendar.js";
import { uuid, text, httpError } from "./validation.js";
const range = z.object({
  start: z.iso.date(),
  weeks: z.coerce.number().int().min(1).max(26).default(1),
});
export function registerTimetable(app: FastifyInstance, db: PrismaClient) {
  app.post("/api/timetable/materialize", async (req) => {
    const q = range.parse(req.body),
      start = new Date(q.start);
    const workings = await db.workingDefinition.findMany({
      where: {
        archived: false,
        diagram: { archived: false, period: { archived: false } },
      },
      include: workingInclude,
    });
    if (workings.length > 2000)
      throw httpError(
        400,
        "Limit this timetable to 2,000 working definitions.",
      );
    await db.$transaction(
      async (tx) => {
        for (let n = 0; n < q.weeks * 7; n++) {
          const date = addDays(start, n);
          for (const w of workings) {
            if (!onCalendar(w.calendar, date, w.diagram.period)) continue;
            const occurrence = await tx.workingOccurrence.upsert({
              where: { workingId_date: { workingId: w.id, date } },
              create: { workingId: w.id, date },
              update: {},
            });
            const r = w.nextRules.find((r) => r.weekday === weekday(date));
            let toId: string | null = null,
              note = "Next working unknown — no instruction entered.",
              kind = r?.kind || "UNKNOWN";
            if (r) {
              note =
                r.notes ||
                "Entered instruction — check its live continuity in Stock Chains.";
              const target = targetDate(date, r);
              if (r.kind === "TARGET" && r.targetWorkingId && target) {
                const next = workings.find((x) => x.id === r.targetWorkingId);
                if (
                  next &&
                  onCalendar(next.calendar, target, next.diagram.period)
                ) {
                  const to = await tx.workingOccurrence.upsert({
                    where: {
                      workingId_date: { workingId: next.id, date: target },
                    },
                    create: { workingId: next.id, date: target },
                    update: {},
                  });
                  toId = to.id;
                } else
                  note =
                    "Selected target has no occurrence on that calendar date. Instruction retained; not continuity-checked.";
              } else if (r.kind === "TARGET")
                note =
                  "Unresolved published number; select a specific daily working.";
              else if (r.kind === "STABLED")
                note =
                  "Stabled / no working" +
                  (target
                    ? " until " + dateKey(target)
                    : "; duration unknown") +
                  ". No movement has been invented.";
              else if (r.kind === "END") note = "No further working recorded.";
            }
            await tx.occurrenceReference.upsert({
              where: { fromId: occurrence.id },
              create: { fromId: occurrence.id, toId, kind, note },
              update: { toId, kind, note },
            });
          }
        }
      },
      { timeout: 60000, maxWait: 10000 },
    );
    return { status: "Materialized", start: q.start, weeks: q.weeks };
  });
  app.get("/api/timetable", async (req) => {
    const q = range.parse(req.query),
      start = new Date(q.start),
      end = addDays(start, q.weeks * 7);
    const all = await db.workingOccurrence.findMany({
      where: { date: { gte: start, lt: end } },
      include: {
        working: { include: workingInclude },
        assignments: {
          where: { active: true },
          include: { physicalSet: true },
        },
        outgoing: {
          include: {
            to: { include: { working: { include: { diagram: true } } } },
          },
        },
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });
    const approved = await db.approvedConnection.findMany({
      where: { active: true, fromId: { in: all.map((o) => o.id) } },
    });
    const issues = await db.planningIssue.findMany({
      where: { active: true, fromId: { in: all.map((o) => o.id) } },
    });
    const rotations = await db.savedRotation.findMany({
      where: { active: true },
    });
    const occurrences = all
      .filter(
        (o) =>
          o.assignments.length ||
          (!o.working.archived &&
            !o.working.diagram.archived &&
            onCalendar(o.working.calendar, o.date, o.working.diagram.period)),
      )
      .map((o) => {
        const variation = o.working.variations.find(
          (v) => v.weekday === weekday(o.date),
        );
        const formation = variation ? variation.formation : o.working.formation;
        return {
          ...o,
          onCalendar:
            !o.working.archived &&
            !o.working.diagram.archived &&
            onCalendar(o.working.calendar, o.date, o.working.diagram.period),
          formation,
          formationCount: formationCount(formation),
          instructions: o.working.instructions.filter(
            (i) => !i.weekdays.length || i.weekdays.includes(weekday(o.date)),
          ),
          changes: o.working.changes.filter(
            (c) => !c.weekdays.length || c.weekdays.includes(weekday(o.date)),
          ),
          assignments: o.assignments.map((a) => ({
            ...a,
            physicalSet: {
              ...a.physicalSet,
              code: setCode(a.physicalSet.serial),
            },
            workingRevised: a.definitionRevision !== o.working.revision,
          })),
          connectionStatus: issues.some(
            (i) => i.fromId === o.id && i.severity === "Error",
          )
            ? "In conflict"
            : approved.some((a) => a.fromId === o.id)
              ? "Confirmed by research — review current issues"
              : "Unverified — check connections in Stock Chains",
        };
      });
    return {
      start: q.start,
      dates: Array.from({ length: q.weeks * 7 }, (_, i) =>
        dateKey(addDays(start, i)),
      ),
      occurrences,
      storage: rotations.flatMap((r) =>
        ((r.snapshot as any).links || [])
          .filter((l: any) => l.storage)
          .map((l: any) => ({ ...l.storage, physicalSetId: r.physicalSetId })),
      ),
      physicalSets: (
        await db.physicalSet.findMany({ orderBy: { serial: "asc" } })
      ).map((s) => ({ ...s, code: setCode(s.serial) })),
    };
  });
  app.post("/api/assignments", async (req, reply) => {
    const data = z
      .object({ physicalSetId: uuid, occurrenceId: uuid, notes: text.min(1) })
      .parse(req.body);
    return reply.code(201).send(
      await db.$transaction(async (tx) => {
        const o = await tx.workingOccurrence.findUniqueOrThrow({
          where: { id: data.occurrenceId },
          include: { working: { include: workingInclude } },
        });
        if (
          o.working.archived ||
          o.working.diagram.archived ||
          !onCalendar(o.working.calendar, o.date, o.working.diagram.period)
        )
          throw httpError(
            400,
            "This occurrence is outside the current operating calendar. Edit the working or choose another occurrence.",
          );
        await assertAllocation(tx, data.physicalSetId, o);
        const before = await tx.rotationAssignment.findUnique({
          where: {
            physicalSetId_occurrenceId: {
              physicalSetId: data.physicalSetId,
              occurrenceId: data.occurrenceId,
            },
          },
        });
        if (before?.active)
          throw httpError(
            409,
            "This physical set is already assigned to that dated occurrence.",
          );
        const row = await tx.rotationAssignment.upsert({
          where: {
            physicalSetId_occurrenceId: {
              physicalSetId: data.physicalSetId,
              occurrenceId: data.occurrenceId,
            },
          },
          create: {
            ...data,
            definitionRevision: o.working.revision,
            exclusiveKey: o.working.exclusive ? o.id : null,
          },
          update: {
            notes: data.notes,
            active: true,
            definitionRevision: o.working.revision,
            exclusiveKey: o.working.exclusive ? o.id : null,
          },
        });
        await audit(
          tx,
          o.workingId,
          "Manual assignment",
          "Assigned",
          data.notes,
          before,
          row,
        );
        return row;
      }),
    );
  });
  app.delete("/api/assignments/:id", async (req) => {
    const id = uuid.parse((req.params as any).id),
      { reason } = z.object({ reason: text.min(1) }).parse(req.body);
    return db.$transaction(async (tx) => {
      const before = await tx.rotationAssignment.findUniqueOrThrow({
        where: { id },
        include: { occurrence: true },
      });
      await guardLockedLink(tx, before.occurrenceId);
      const after = await tx.rotationAssignment.update({
        where: { id },
        data: { active: false, exclusiveKey: null },
      });
      await audit(
        tx,
        before.occurrence.workingId,
        "Manual assignment",
        "Unassigned",
        reason,
        before,
        after,
      );
      return after;
    });
  });
}
