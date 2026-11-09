import { dateKey, weekday, onCalendar, formationCount } from "./calendar.js";
export type Check = {
  code: string;
  name: string;
  state: "Pass" | "Error" | "Warning" | "Unresolved";
  reason: string;
  action: string;
};
export const minuteAt = (o: any, end = false): number | null => {
  const w = o.working,
    m = end ? w.finishMinutes : w.startMinutes,
    offset = end ? w.finishDayOffset : w.startDayOffset;
  return m == null
    ? null
    : Math.floor(new Date(o.date).getTime() / 60000) + (offset || 0) * 1440 + m;
};
export const effectiveFormation = (o: any) => {
  const v = o.working.variations?.find(
    (v: any) => v.weekday === weekday(new Date(o.date)),
  );
  return v ? v.formation : o.working.formation;
};
export const effectiveChanges = (o: any) =>
  o.working.changes?.filter(
    (c: any) =>
      !c.weekdays.length || c.weekdays.includes(weekday(new Date(o.date))),
  ) || [];
function stock(o: any, atEnd: boolean) {
  const formation = effectiveFormation(o);
  let known = formation?.completeness === "Known" && !!formation.members.length,
    total = 0,
    typed = true;
  const types: Record<string, number> = {};
  for (const m of formation?.members || []) {
    if (m.quantity == null) known = false;
    else total += m.quantity;
    if (!m.typeId) typed = false;
    else if (m.quantity != null)
      types[m.typeId] = (types[m.typeId] || 0) + m.quantity;
  }
  for (const c of effectiveChanges(o)) {
    if ((atEnd && c.stage === "Start") || (!atEnd && c.stage !== "Start"))
      continue;
    const sign = (c.action === "Attach" ? 1 : -1) * (atEnd ? 1 : -1);
    if (c.quantity == null) {
      known = false;
      continue;
    }
    total += sign * c.quantity;
    if (!c.typeId) typed = false;
    else types[c.typeId] = (types[c.typeId] || 0) + sign * c.quantity;
  }
  return {
    known,
    total,
    typed,
    types,
    invalid: total < 0 || Object.values(types).some((n) => n < 0),
  };
}
const canon = (types: Record<string, number>) =>
  JSON.stringify(
    Object.entries(types)
      .filter(([, n]) => n !== 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
export function assess(
  from: any,
  to: any,
  options: { rule?: any; transfers?: any[]; storageStation?: any } = {},
) {
  const checks: Check[] = [];
  const add = (
    code: string,
    name: string,
    state: Check["state"],
    reason: string,
    action = "Review the entered source and correct or annotate the record.",
  ) => checks.push({ code, name, state, reason, action });
  const fw = from.working,
    tw = to.working;
  if (new Date(to.date) < new Date(from.date))
    add(
      "BACKWARD_DATE",
      "Calendar order",
      "Error",
      "The next working is dated before the current working.",
    );
  if (from.id === to.id)
    add(
      "SELF_REFERENCE",
      "Daily identity",
      "Error",
      "A daily occurrence cannot continue into itself. Select the following dated occurrence.",
    );
  const transfers = (options.transfers || [])
    .filter((t) => !t.archived)
    .sort((a, b) => a.sequence - b.sequence);
  if (fw.diagram.periodId !== tw.diagram.periodId)
    add(
      "SOURCE_PERIOD",
      "Historical period",
      "Error",
      "The entries belong to different historical periods. No cross-period identity is assumed.",
    );
  else
    add(
      "SOURCE_PERIOD",
      "Historical period",
      "Pass",
      "Both entries belong to the selected historical period.",
    );
  if (
    tw.archived ||
    tw.diagram.archived ||
    !onCalendar(tw.calendar, new Date(to.date), tw.diagram.period)
  )
    add(
      "CALENDAR",
      "Operating calendar",
      "Error",
      `The selected target does not operate on ${dateKey(to.date)}.`,
      "Edit the target calendar or select a different daily working.",
    );
  else
    add(
      "CALENDAR",
      "Operating calendar",
      "Pass",
      `The target operates on ${dateKey(to.date)} under its weekday/cycle/date rules.`,
    );
  let location = fw.finishStationId;
  let locationUnknown = !location;
  let mismatch = "";
  for (const t of transfers) {
    if (!location || !t.startStationId || !t.finishStationId)
      locationUnknown = true;
    else if (location !== t.startStationId)
      mismatch =
        "A recorded connecting movement does not start where the previous working or movement finishes.";
    location = t.finishStationId;
  }
  if (!tw.startStationId || !location) locationUnknown = true;
  else if (location !== tw.startStationId)
    mismatch = `Set ${fw.diagram.number} finishes at ${fw.finishStation?.name || "an unknown station"}, but set ${tw.diagram.number} starts at ${tw.startStation?.name || "an unknown station"} on ${dateKey(to.date)}. A connecting movement or correction is needed.`;
  const storageId = options.rule?.storageStationId;
  const visited = [
    fw.finishStationId,
    ...transfers.flatMap((t) => [t.startStationId, t.finishStationId]),
    tw.startStationId,
  ];
  if (storageId && !visited.includes(storageId))
    mismatch =
      "The entered storage location is not joined to the workings by recorded movements.";
  if (mismatch)
    add(
      "DESTINATION_MISMATCH",
      "Location continuity",
      "Error",
      mismatch,
      "Edit either working, record connecting movement(s), or leave the discrepancy unresolved.",
    );
  else if (locationUnknown)
    add(
      "UNKNOWN_LOCATION",
      "Location continuity",
      "Unresolved",
      "A starting, finishing or connecting-movement station is unknown.",
    );
  else
    add(
      "LOCATION",
      "Location continuity",
      "Pass",
      transfers.length
        ? "The manually entered connecting movements join the endpoint stations."
        : "The finishing and next starting stations match. This alone is not proof of stock identity.",
    );
  if (options.rule?.kind === "STABLED" && !storageId)
    add(
      "UNKNOWN_STORAGE",
      "Stabling location",
      "Unresolved",
      "The instruction records stabling but its location is unknown.",
      "Enter or explicitly accept a storage location; do not invent a transfer.",
    );
  const finish = minuteAt(from, true),
    start = minuteAt(to);
  let previous = finish,
    timeUnknown = finish == null || start == null,
    impossible = false;
  if (minuteAt(from) != null && finish != null && finish < minuteAt(from)!)
    impossible = true;
  for (const t of transfers) {
    const a =
        t.startMinutes == null
          ? null
          : new Date(t.startDate).getTime() / 60000 + t.startMinutes,
      b =
        t.finishMinutes == null
          ? null
          : new Date(t.finishDate).getTime() / 60000 + t.finishMinutes;
    if (a == null || b == null) timeUnknown = true;
    else if (b < a || (previous != null && a < previous)) impossible = true;
    previous = b;
  }
  if (previous != null && start != null && start < previous) impossible = true;
  if (impossible)
    add(
      "IMPOSSIBLE_TIME",
      "Timing",
      "Error",
      "The entered dates/times overlap, or a movement ends before it starts. Midnight crossings use explicit day offsets.",
      "Correct the clock values or day offsets; inspect connecting-movement times.",
    );
  else if (timeUnknown)
    add(
      "UNKNOWN_TIME",
      "Timing",
      "Unresolved",
      "One or more times are missing. Time compatibility is unverified.",
    );
  else
    add(
      "TIMING",
      "Timing",
      "Pass",
      `${start! - finish!} minutes between the working endpoints, with entered transfer times accounted for.`,
    );
  const a = stock(from, true),
    b = stock(to, false);
  if (a.invalid || b.invalid)
    add(
      "INVALID_FORMATION_CHANGE",
      "Formation",
      "Error",
      "A recorded attachment/detachment would require a negative carriage quantity.",
    );
  else if (!a.known || !b.known)
    add(
      "UNKNOWN_FORMATION",
      "Formation",
      "Unresolved",
      "One or both formations/changes are incomplete or unknown.",
    );
  else if (a.total !== b.total)
    add(
      "FORMATION_MISMATCH",
      "Formation",
      "Warning",
      `The finishing stock has ${a.total} carriages and the next working needs ${b.total} before its recorded Start changes.`,
      "Check day-specific formations or record legitimate attachments/detachments.",
    );
  else if (a.typed && b.typed && canon(a.types) !== canon(b.types))
    add(
      "FORMATION_TYPES",
      "Formation",
      "Warning",
      "The adjusted carriage totals agree but the recorded carriage types differ.",
      "Check exchanges, portions and formation changes.",
    );
  else if (!a.typed || !b.typed)
    add(
      "FORMATION_TYPES_UNKNOWN",
      "Formation",
      "Warning",
      "The adjusted carriage totals agree; carriage-type compatibility remains unverified.",
    );
  else
    add(
      "FORMATION",
      "Formation",
      "Pass",
      "Carriage types and quantities agree after finishing changes and before the target’s Start changes.",
    );
  const sourceSets = (from.assignments || [])
      .filter((a: any) => a.active !== false)
      .map((a: any) => a.physicalSetId),
    targetSets = (to.assignments || [])
      .filter((a: any) => a.active !== false)
      .map((a: any) => a.physicalSetId);
  if (
    sourceSets.length &&
    targetSets.length &&
    !sourceSets.some((s: string) => targetSets.includes(s)) &&
    tw.exclusive
  )
    add(
      "ALLOCATION_CONFLICT",
      "Recorded assignments",
      "Error",
      "The two workings are assigned to different physical sets. No assignment was changed.",
      "Review manual allocations before establishing continuity.",
    );
  else
    add(
      "ALLOCATION",
      "Recorded assignments",
      "Pass",
      "No contradictory exclusive stock assignment is recorded. This is not evidence of historical identity.",
    );
  const errors = checks.some((c) => c.state === "Error"),
    sourceVerified =
      !!options.rule?.verified &&
      options.rule?.targetWorkingId === to.workingId;
  const classification = errors
    ? "Incompatible"
    : sourceVerified
      ? "Confirmed by entered source instructions"
      : checks.every((c) => c.state === "Pass")
        ? "Strong candidate"
        : checks.find((c) => c.name === "Location continuity")?.state === "Pass"
          ? "Possible candidate"
          : "Insufficient information";
  const score =
    checks.reduce(
      (n, c) =>
        n +
        (c.state === "Pass"
          ? c.name === "Location continuity"
            ? 40
            : 10
          : c.state === "Error"
            ? -100
            : 0),
      0,
    ) + (options.rule?.targetWorkingId === to.workingId ? 15 : 0);
  const gapDays = Math.round(
    (new Date(to.date).getTime() - new Date(from.date).getTime()) / 86400000,
  );
  let storage: any = null;
  if (gapDays > 1 || options.rule?.kind === "STABLED")
    storage = {
      stationId:
        storageId ||
        (!mismatch && !locationUnknown ? fw.finishStationId : null),
      stationName:
        options.storageStation?.name ||
        (!mismatch && !locationUnknown ? fw.finishStation?.name : null) ||
        "Unknown storage location",
      start: finish == null ? null : new Date(finish * 60000).toISOString(),
      end: start == null ? null : new Date(start * 60000).toISOString(),
      fromDate: dateKey(from.date),
      toDate: dateKey(to.date),
      basis:
        options.rule?.kind === "STABLED"
          ? "Entered stabling instruction"
          : "Proposed storage between workings — requires approval",
      verified: false,
    };
  return {
    checks,
    classification,
    score,
    sourceVerified,
    storage,
    hasErrors: errors,
    fullyChecked: checks.every((c) => c.state === "Pass"),
  };
}
export function describe(o: any) {
  const w = o.working;
  return {
    workingId: w.id,
    diagram: w.diagram.number,
    label: w.label,
    date: dateKey(o.date),
    start: w.startStation?.name || "Unknown",
    finish: w.finishStation?.name || "Unknown",
    startStationId: w.startStationId,
    finishStationId: w.finishStationId,
    period: w.diagram.period.name,
    sources: w.sources || [],
  };
}
