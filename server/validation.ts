import { z } from "zod";
export const uuid = z.string().uuid();
export const text = z.string().trim().max(10000);
export const days = z
  .array(z.number().int().min(0).max(6))
  .max(7)
  .refine((v) => new Set(v).size === v.length, "Choose each weekday once");
export const optionalDate = z.iso.date().nullable().optional();
const minute = z.number().int().min(0).max(1439).nullable().optional();
const nullableId = uuid.nullable().optional();
export const periodInput = z
  .object({
    name: text.min(1),
    startDate: optionalDate,
    endDate: optionalDate,
    notes: text.default(""),
  })
  .refine(
    (v) => !v.startDate || !v.endDate || v.startDate <= v.endDate,
    "Period end precedes start",
  );
export const formationInput = z
  .object({
    name: text.min(1),
    completeness: z.enum(["Known", "Incomplete", "Unknown"]),
    notes: text.default(""),
    members: z
      .array(
        z.object({
          typeId: nullableId,
          quantity: z.number().int().positive().max(1000).nullable().optional(),
          position: z.number().int().positive().max(1000).nullable().optional(),
          vehicleNumber: z.string().trim().max(100).nullable().optional(),
          notes: text.default(""),
        }),
      )
      .max(100),
  })
  .refine(
    (v) => v.members.every((m) => !m.vehicleNumber || m.quantity === 1),
    "An individually identified carriage must have quantity one",
  )
  .refine(
    (v) =>
      v.completeness !== "Known" ||
      (v.members.length > 0 && v.members.every((m) => m.quantity != null)),
    "A known formation requires members with known quantities",
  );
export const calendarInput = z
  .object({
    weekdays: days,
    cycleWeeks:z.number().int().min(1).max(12).default(1),
    anchorDate:optionalDate,
    weekOffsets:z.array(z.number().int().min(0).max(11)).min(1).max(12).default([0]),
    validFrom: optionalDate,
    validTo: optionalDate,
    notes: text.default(""),
    exceptions: z
      .array(
        z.object({
          date: z.iso.date(),
          operates: z.boolean(),
          notes: text.min(1),
        }),
      )
      .max(1000)
      .default([]),
  })
  .refine(v=>v.weekOffsets.every(n=>n<v.cycleWeeks)&&new Set(v.weekOffsets).size===v.weekOffsets.length,'Cycle weeks must be distinct and within the selected cycle')
  .refine(v=>v.cycleWeeks===1||!!v.anchorDate,'Alternate-week rules require an anchor date')
  .refine(
    (v) => !v.validFrom || !v.validTo || v.validFrom <= v.validTo,
    "Calendar end precedes start",
  )
  .refine(
    (v) =>
      new Set(v.exceptions.map((e) => e.date)).size === v.exceptions.length,
    "Only one exception per date",
  );
export const sourceInput = z.object({
  title: text.min(1),
  sourceDate: z.string().trim().max(200).nullable().optional(),
  page: z.string().trim().max(100).nullable().optional(),
  notes: text.default(""),
});
export const ruleInput = z
  .object({
    weekday: z.number().int().min(0).max(6),
    kind: z.enum(["UNKNOWN", "TARGET", "STABLED", "END"]),
    targetWorkingId: nullableId,
    enteredNumber: z.string().trim().max(100).nullable().optional(),
    offsetDays: z.number().int().min(0).max(366).nullable().optional(),
    targetWeekday: z.number().int().min(0).max(6).nullable().optional(),
    targetDate: optionalDate,
    storageStationId:nullableId,
    verified:z.boolean().default(false),
    notes: text.default(""),
  })
  .superRefine((r, ctx) => {
    const modes = [r.offsetDays, r.targetWeekday, r.targetDate].filter(
      (v) => v != null,
    ).length;
    if (modes > 1 || (r.kind === "TARGET" && modes !== 1))
      ctx.addIssue({ code: "custom", message: "Choose one target date rule" });
    if (r.kind === "TARGET" && !r.targetWorkingId && !r.enteredNumber)
      ctx.addIssue({
        code: "custom",
        message:
          "Choose a specific working, or retain an unresolved published number",
      });
    if (!["TARGET", "STABLED"].includes(r.kind) && (r.targetWorkingId || r.enteredNumber))
      ctx.addIssue({
        code: "custom",
        message: "Only a next-working instruction can reference a working",
      });
  });
export const workingInput = z
  .object({
    diagramId: uuid,
    label: text.default(""),
    startStationId: nullableId,
    finishStationId: nullableId,
    startMinutes: minute,
    finishMinutes: minute,
    startDayOffset: z.number().int().min(0).max(14).default(0),
    finishDayOffset: z.number().int().min(0).max(14).default(0),
    formationId: nullableId,
    routeText: text.default(""),
    notes: text.default(""),
    exclusive: z.boolean().default(true),
    calendar: calendarInput,
    routeCalls: z
      .array(
        z.object({
          stationId: uuid,
          sequence: z.number().int().positive(),
          notes: text.default(""),
        }),
      )
      .max(100)
      .default([]),
    instructions: z
      .array(z.object({ weekdays: days, text: text.min(1) }))
      .max(100)
      .default([]),
    sources: z.array(sourceInput).max(100).default([]),
  })
  .refine(
    (v) =>
      new Set(v.routeCalls.map((c) => c.sequence)).size === v.routeCalls.length,
    "Route positions must be distinct",
  );
export function calendarData(c: z.infer<typeof calendarInput>) {
  return {
    ...c,
    anchorDate:c.anchorDate?new Date(c.anchorDate):null,
    validFrom: c.validFrom ? new Date(c.validFrom) : null,
    validTo: c.validTo ? new Date(c.validTo) : null,
    exceptions: {
      create: c.exceptions.map((e) => ({ ...e, date: new Date(e.date) })),
    },
  };
}
export const httpError = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { statusCode });
