# Validation evidence

Validated in the managed Linux/Docker environment on 7 November 2026 (Australia/Brisbane).

- TypeScript checking and production Vite build passed.
- 20 PostgreSQL/domain integration checks passed; none skipped. These include a real Tesseract/Poppler OCR run, crop handling, preserved manual revisions, physical set/vehicle identities, calendar/rotation conflicts, cross-year timetable review, previewed import idempotency and byte-stable JSON/CSV exports.
- Both Chromium browser workflows passed, including source PDFs, OCR correction, manually approved rotations, timetable discrepancy review, export previews and tablet layout.
- The isolated Docker test runner passed the same 20 integration checks and both browser workflows with a fresh ephemeral PostgreSQL database.
- Research and synthetic-demo Compose stacks started successfully with independent volumes. Demo OCR completed through its separate worker.
- Restarting the demo app/worker and rerunning the seed preserved both original PDF SHA-256 checksums, retained exactly three demonstration diagrams and did not duplicate seed records.
- npm dependency audit reported zero known vulnerabilities at validation time.

The source fixture data is fictional and explicitly labelled. The original historical PDFs have not been available for OCR accuracy or historical-working validation. Windows 11 Docker Desktop and Windows-specific backup/restore commands have not been exercised in this Linux environment.

GitHub Actions configuration is included. A local test pass does not establish a remote Actions run result; inspect the repository's Actions tab after publication.
