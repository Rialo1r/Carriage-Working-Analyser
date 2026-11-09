# Phase 1 architecture

The application is a fresh manual-entry planner. React/TypeScript calls a Fastify/TypeScript API. PostgreSQL stores all research records through Prisma's JavaScript query engine and PostgreSQL driver adapter. Docker Compose runs only the app and database. There is no OCR worker, PDF processor, AI extraction service or Railway Operations Manager integration.

## Identity model

```mermaid
erDiagram
    HistoricalPeriod ||--o{ PublishedDiagram : scopes
    PublishedDiagram ||--o{ WorkingDefinition : describes
    WorkingDefinition ||--o| OperatingCalendar : operates
    OperatingCalendar ||--o{ CalendarException : overrides
    WorkingDefinition ||--o{ RouteCall : visits
    Station ||--o{ RouteCall : identifies
    WorkingDefinition ||--o{ SpecialInstruction : instructs
    WorkingDefinition ||--o{ NextWorkingReference : continues
    WorkingDefinition ||--o{ WorkingOccurrence : instantiates
    WorkingOccurrence ||--o| OccurrenceReference : references
    PhysicalSet ||--o{ RotationAssignment : assigned
    WorkingOccurrence ||--o{ RotationAssignment : receives
    Formation ||--o{ FormationMember : contains
    CarriageType o|--o{ FormationMember : describes
    WorkingDefinition ||--o{ FormationVariation : varies
    Formation o|--o{ FormationVariation : replaces
    WorkingDefinition ||--o{ FormationChange : records
    WorkingDefinition ||--o{ SourceReference : cites
    WorkingDefinition ||--o{ ResearchNote : documents
```

A published number is never a physical identity. Published diagram UUIDs are scoped by a historical period; identical number strings are allowed without automatic merging. A working definition can operate Monday–Friday and have a distinct Saturday variant with the same published number. A dated occurrence has a unique `(workingId, date)` key. Repeated timetable builds reuse that occurrence; the next Monday gets another UUID.

Physical sets have UUID primary keys and database-generated permanent serials displayed as `CS-0001`, etc. The API cannot change the serial. Serial gaps are allowed; numbers are not recycled through application operations. A manual assignment links a physical set to an occurrence, not to an unqualified diagram number.

For exclusive occurrences, a unique database key provides atomic allocation protection. Removing an assignment marks it inactive and records its prior values rather than deleting the research record. Nonexclusive workings can intentionally receive several sets; more sophisticated physical-stock compatibility and overlap checks belong to Phase 2.

## Calendars and dates

Weekdays are Monday=0 through Sunday=6. Optional historical-period and working bounds are inclusive. Dated exceptions override weekday rules within those bounds. Dates are PostgreSQL `date`, carried through the API as calendar dates; modern time-zone conversion is not applied to historical clock values.

Starting/finishing times are optional minutes from midnight with separate explicit day offsets. The data model preserves missing times, same-day references and overnight workings. Phase 1 does not infer an end-day offset from a clock time or check whether a proposed connection is physically possible.

## Entered continuation references

Each working can have a different next-working reference for each source weekday. A reference retains the entered published number, optional selected target working UUID, one date rule (elapsed days, next weekday or explicit date), instruction kind and notes. An ambiguous typed number remains unresolved; the app never picks the first candidate.

When a timetable is materialised, resolved references identify the target dated occurrence through a separate `OccurrenceReference`. A target not operating on its entered calendar does not receive an invented occurrence. The entered instruction is retained, with a descriptive note in the timetable. This is calendar rendering, not the Phase 2 continuity engine. All connection states remain unverified.

Stabling has no invented train movement or target stock identity. Duration may be unknown. A date rule selecting the same weekday means the following week; an explicit day offset of zero represents the same day.

## Formations and source evidence

Formation members may have an unknown type, quantity or position. An identified vehicle number requires quantity one. Exact totals require a known formation with known member quantities; incomplete/unknown records show only the known minimum. Day variations override the base formation; an explicit unknown variation remains unknown. Attach/detach records preserve entered facts without automatically proving composition compatibility.

Sources are manually typed citations; no files are processed. Working edits retain citations. Changes to route calls, instructions, exceptions and formation members keep their previous values in an audit snapshot. Material edits require a reason and working/formation revisions protect against stale saves.

## Later phases — not implemented

Phase 2 adds continuity findings, issue reviews, source-to-target calendar validation, timing/formation checks, duplicate/contradiction detection and overlap checks. Dismissal must remain distinct from resolution.

Phase 3 adds separate proposed and approved connections, versioned/locked physical-set rotations, multi-week generation and proposal comparisons. It must analyse at least two weeks, extend its horizon for longer cycles, preserve alternatives and never overwrite approved research. Merely revisiting a published number or station is not proof of recurrence.

Phase 4 adds printable reports, PDF/Excel/CSV exports and summaries. Native browser printing is not an implemented report-export pipeline.
