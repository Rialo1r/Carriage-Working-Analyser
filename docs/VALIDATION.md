# Phase 1 validation evidence

This evidence applies to the fresh **LNER Carriage Working & Rotation Planner**, not the deleted analyser implementation.

- TypeScript checking and production Vite build passed.
- Ten named PostgreSQL integration scenarios passed (11 Node test results including the parent group), with no failures or skipped tests.
- The Chromium end-to-end workflow passed: manual station/type/period/diagram entry, formation totals, one weekday definition, Saturday/Sunday copies, ambiguous continuation alternatives, exact target selection, an audited edit, permanent physical-set creation and seven manual dated assignments.
- A two-week timetable retained distinct Monday occurrence UUIDs. Sunday referenced the following Monday without an automatic continuity or recurrence claim. SF instructions appeared on Monday–Saturday only, with the separate Sunday instruction preserved.
- Repeated timetable materialisation reused occurrence UUIDs and did not duplicate rows. Competing exclusive manual allocations produced one success and one conflict response without silent reassignment.
- The isolated Docker test stack passed the integration group and browser workflow against a fresh ephemeral PostgreSQL database.
- A custom-format PostgreSQL backup restored working definitions, dated occurrences, next-working references, sources, audit records, physical-set IDs and manual assignments into a separate disposable database. The permanent CS serial sequence continued correctly.
- Restarting the PostgreSQL container preserved the entered records and UUIDs.
- The actual planner Compose stack started successfully on port 4310 with an empty research database. Synthetic fixtures were confined to test databases.
- npm audit reported zero known vulnerabilities after updating Fastify to its patched release.

The browser workflow caught and verified fixes for copied-weekday state leaking into an edit and a late refresh reopening a working after navigation.

Validation ran in Linux Docker/Chromium. Windows 11 Docker Desktop and native PowerShell execution have not been directly exercised. The Windows instructions use the same verified Compose files and include file-location checks. GitHub Actions is configured, but local test results do not establish the result of a later remote CI run.

Automatic continuity checks, suggestions, rotation generation, approval/locking and PDF/Excel/CSV reporting are outside Phase 1 and were not implemented or claimed as tested. Phase 2 awaits approval.
