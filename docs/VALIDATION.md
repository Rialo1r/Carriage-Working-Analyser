# Updated planner validation

Validation targets the manual-entry planner and the updated roster/continuity/rotation build. Synthetic fixtures are confined to disposable test databases; historical research is not seeded.

- TypeScript checking and production Vite build pass.
- PostgreSQL integration tests cover catalogue editing, safe replacement/archive/restore, hidden permanent identities, multi-day entry, exact continuation selection, distinct dated occurrences, repeated materialisation, exclusive allocation conflicts, stale-edit protection and retained audit history.
- Continuity tests exercise destination mismatch, missing times, formation differences and legitimate attachments, overnight Sunday/Monday timing, unknown continuations, repeatable analysis, original findings and dismissal history.
- Rotation tests exercise the weekly 262/822A pattern with SF instructions Monday–Saturday, a full 14-day pattern over six weeks, an open three-day chain without an unsupported recurrence claim, Saturday-only stabling, repeatable proposal generation, physical-set creation, exclusive conflicts and locked snapshot preservation.
- Chromium tests cover the complete manual-entry workflow and the new connection-analysis → generate → approve → locked-rotation workflow, issues navigation, hidden UUIDs and an iPad-sized viewport.
- The isolated Docker test stack passes the integration and browser workflows. Production Compose starts with additive migrations and the phase 3 health response; no synthetic research is seeded.
- A custom-format backup restores saved rotations, dated workings and audit records into a separate disposable database.
- npm audit reports zero known production dependency vulnerabilities.
- Additive migrations run twice in the integration harness to verify repeat application is safe.

The documented Windows instructions use the same Docker Compose files. Validation runs on Linux Docker and Chromium; native Windows 11, PowerShell, Safari and physical iPad networking have not been directly exercised. GitHub Actions is configured; local results do not imply a later remote CI run succeeded.

PDF/Excel/CSV report exports remain deferred. Missing evidence and open ends are deliberately visible, rather than treated as verified research.
