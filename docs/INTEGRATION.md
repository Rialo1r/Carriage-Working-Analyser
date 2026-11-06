# Future Railway Operations Manager interface

This application has no connection to Railway Operations Manager. Research exports are files for deliberate review, not instructions to allocate stock or execute trains.

Version `lner-research/v1` is the current interchange boundary. JSON contains `schemaVersion`, `generatedAt`, `purpose`, `warnings`, `diagrams` and `rotations`. Each diagram retains its UUID, source-scoped published number, operating days, calendar exceptions, movements and intermediate calls, composition requirements/changes, operation assignments, original/corrected source evidence, verification records and research notes. Movements include manually reviewed timetable links and their discrepancies. Source PDFs are not embedded; file IDs, checksums and page references identify them.

CSV contains one row per movement (or one empty-movement row for an incomplete diagram). Compound columns are quoted JSON. Spreadsheet formula prefixes are escaped in CSV; JSON preserves original strings. The preview and download share canonical serialization and a SHA-256 digest. An export is an immutable snapshot even if records change later.

A future importer must validate the schema version, UUIDs and verification status, inspect warnings, require explicit mapping to its own station/vehicle identities, present a change preview, and require a deliberate commit in that application. Diagram numbers and train numbers must never be used alone as identity keys. Unknown values stay unknown. Approved hypotheses and source-confirmed rotations remain distinguishable. Re-importing a snapshot should use UUIDs plus source/revision metadata for idempotency.

Exports are not yet a certified Railway Operations Manager import format. That application's importer and operating rules require a separate integration task. No operational execution, stock allocation or live tracking belongs in this research application.
