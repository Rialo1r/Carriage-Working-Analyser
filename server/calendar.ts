export const weekdayNames = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export const dateKey = (value: Date | string) =>
  new Date(value).toISOString().slice(0, 10);
export const weekday = (date: Date) => (date.getUTCDay() + 6) % 7;
export const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * 86400000);
export function onCalendar(calendar: any, date: Date, period?: any): boolean {
  if (period?.archived) return false;
  const key = dateKey(date);
  if (
    (period?.startDate && key < dateKey(period.startDate)) ||
    (period?.endDate && key > dateKey(period.endDate))
  )
    return false;
  if (
    (calendar?.validFrom && key < dateKey(calendar.validFrom)) ||
    (calendar?.validTo && key > dateKey(calendar.validTo))
  )
    return false;
  const exception = calendar?.exceptions?.find(
    (e: any) => dateKey(e.date) === key,
  );
  if (exception) return exception.operates;
  if (calendar?.cycleWeeks > 1) {
    if (!calendar.anchorDate) return false;
    const anchor = new Date(calendar.anchorDate);
    anchor.setUTCDate(anchor.getUTCDate() - weekday(anchor));
    const week = Math.floor(
      (date.getTime() - anchor.getTime()) / (7 * 86400000),
    );
    if (
      !(calendar.weekOffsets || [0]).includes(
        ((week % calendar.cycleWeeks) + calendar.cycleWeeks) %
          calendar.cycleWeeks,
      )
    )
      return false;
  }
  return !!calendar?.weekdays?.includes(weekday(date));
}
export function targetDate(date: Date, rule: any): Date | null {
  if (rule.targetDate) return new Date(rule.targetDate);
  if (rule.offsetDays != null) return addDays(date, rule.offsetDays);
  if (rule.targetWeekday != null)
    return addDays(date, (rule.targetWeekday - weekday(date) + 7) % 7 || 7);
  return null;
}
export function formationCount(formation: any) {
  if (!formation)
    return { total: null, knownMinimum: 0, description: "Unknown formation" };
  const knownMinimum = formation.members.reduce(
    (sum: number, m: any) => sum + (m.quantity ?? 0),
    0,
  );
  const exact =
    formation.completeness === "Known" &&
    formation.members.length > 0 &&
    formation.members.every((m: any) => m.quantity != null);
  return {
    total: exact ? knownMinimum : null,
    knownMinimum,
    description: exact
      ? `${knownMinimum} carriage${knownMinimum === 1 ? "" : "s"}`
      : knownMinimum
        ? `At least ${knownMinimum}; incomplete`
        : "Unknown total",
  };
}
export const setCode = (serial: number) =>
  "CS-" + String(serial).padStart(4, "0");
