# Scope and acceptance plan

## Phase 1 — current deliverable

Manual entry/editing for periods, published diagrams, daily definitions, weekday/date calendars, formations and physical sets. Exact next-working selection, manual citations, notes, distinct dated occurrences, manual assignment and a basic weekly/multi-week timetable. Significant edits retain audit history. No historical fixture data is seeded into the application.

Acceptance checks:

- Save one Monday–Friday definition, a Saturday variant and an alphanumeric Sunday diagram.
- Retrieve edited records, citations and original audit values; reject stale saves.
- Keep published diagram UUIDs independent from permanent CS identities.
- Show ambiguous number matches and require explicit selection for a resolved reference.
- Resolve entered Sunday-to-Monday references to distinct calendar-date occurrences without claiming validity.
- Keep repeated materialisation idempotent; different Mondays remain different occurrences.
- Retain explicit midnight/day offsets and unknown times.
- Calculate exact/incomplete carriage totals correctly.
- Prevent silent replacement of an exclusive manual assignment; retain unassignment history.
- Display day-specific instructions such as SF attachment Monday–Saturday and no SF Sunday in a manually assigned board.
- Preserve database state across restarts and backup/restore.

The synthetic 262/822A fixture is used only to test these entry and rendering behaviors. Phase 1 does not automatically identify one physical formation or verify a repeating weekly cycle.

## Phase 2 — approval required

Implement destination mismatch, missing target, operating-day, timing and formation checks; exclusive/overlapping allocation findings; Sunday/Monday closure checks; duplicate/contradictory input findings; issue severity, investigation and resolution history. Test requested scenarios 2, 4, 5, 6 and 7 as actual continuity-engine behaviors.

## Phase 3 — only after Phase 2 acceptance

Generate suggestions and rotation chains from entered instructions. Maintain separate proposed and approved connection tables, reviewer rationale, locked/versioned rotations and comparisons of recalculated proposals. Support extended horizons and recurring calendar phase. Test the complete automatic behavior for scenarios 1, 3 and 8, including a 14-day cycle and no unsupported recurrence claim.

## Phase 4 — only after Phase 3 acceptance

Master boards, print-oriented reports, PDF/Excel/CSV downloads and research summaries. Verify that reports derive from underlying assignments, retain uncertainty/source context, and do not modify Railway Operations Manager.
