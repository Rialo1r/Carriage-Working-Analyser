# LNER Carriage Working Analyser

Standalone, personal research application. **Phase 1 only.** It has its own PostgreSQL database and file volumes and never connects to Railway Operations Manager.

## Run on Windows 11

Install Docker Desktop with Linux containers enabled. From this repository in PowerShell:

```powershell
docker compose up -d --build
```

Open `http://localhost:3000` on your own computer. The port is bound to loopback for personal use. The database has no published host port. Local database credentials in Compose are development defaults, not credentials for another application.

After the initial image/dependency downloads, routine use is local and offline. Later starts use `docker compose up -d --no-build`. Stop with `docker compose stop`. Do not use `docker compose down -v`: that removes research volumes.

## Phase 1 workflow

1. Upload an original, unencrypted PDF (maximum 100 MB) under Documents. Titles, source dates, operating periods, regions and descriptions are recorded separately. No historical records are preloaded.
2. Open the PDF, change page and zoom. Optionally enter printed page labels; PDF pages are always numbered from 1.
3. Register stations and aliases as encountered in the sources.
4. Create only the diagrams you want to research. All historical fields can be unknown. A whole source PDF can be retained without transcribing every working.
5. Add and edit movements. Enter times as `HH:MM`; use `24:20` only when next-day timing is supported. Blank means unknown. Preserve original notation separately. Movement order is manually recorded, not inferred from incomplete times.
6. Attach page citations, original text, corrected transcription and uncertainty notes. Open a citation to jump to its PDF page. Citations are append-only in this phase; add a clarifying citation if interpretation changes.
7. Record review status and rationale. Verification/ready-for-export statuses require a citation. The application does not independently authenticate historical claims.

The focus is York–Scarborough, including Huttons Ambo. The Phase 1 shortcut filters **recorded endpoints** at York, Scarborough or Huttons Ambo; it is not yet a route inference engine. Intermediate calls and richer route filtering are Phase 3.

The timetable photos supplied in chat have not been imported. Their visible headings cover Newcastle/Blyth-area routes. Do not identify timetable column numbers as carriage set numbers without evidence. Use the York–Scarborough pages and the relevant carriage roster when available.

## Domain boundaries

`Diagram` is a source-specific published daily working; published numbers are not unique keys. `DiagramOperation` represents a dated/scenario-day instance. `PhysicalSet`, `Formation`, `FormationMember`, `Carriage` and `OperationAssignment` keep physical stock separate from published instructions. Phase 1 provides these foundation tables but no stock-allocation UI or rotation algorithm.

The 1937 and 1939 sources stay separate. Similar numbers do not merge records. Original PDFs are immutable, UUID-addressed and SHA-256 recorded. Source citations and reviews are retained; no delete endpoints are provided. Important diagram, movement, citation, page-label and review changes are audited. Diagram edits use revisions to reject stale saves.

## Development

Use the existing checkout; this cloud task is already isolated. Do not create a worktree unless explicitly requested.

Node 22+, npm and PostgreSQL 16 are required. Install using the committed lockfile:

```sh
npm ci
# Set DATABASE_URL to your local development PostgreSQL connection.
export DATABASE_URL=postgresql://lner:lner_local_only@127.0.0.1:5432/lner
npm run db:generate
npm run db:migrate
npm run build
npm start
```

PowerShell uses `$env:DATABASE_URL = 'postgresql://...'` instead of `export`. `.env.example` documents names; scripts do not automatically load `.env`. For live frontend development run `npm run dev` and `npm run web` in separate terminals. Vite proxies API requests to port 3000.

Prisma 6.19 uses its JavaScript query engine and PostgreSQL driver adapter. Client generation needs DATABASE_URL set, even when generation does not connect to it. `prisma.config.ts` enables the CLI adapter path to avoid unnecessary native engine downloads. No checksum or TLS checks are disabled.

SQL migrations live in `prisma/migrations`. `npm run db:migrate` uses a small transactional PostgreSQL runner with advisory locking and recorded SHA-256 checksums. It runs on every container start and skips previously applied migrations. Do not edit an applied migration: add another migration and update `schema.prisma`, then regenerate the client. Do not mix Prisma Migrate's migration history with this runner. Tests exercise the actual schema through Prisma.

## Tests

Tests need a separate disposable PostgreSQL database whose name ends in `_test`. **They clear research tables in that database.** Never point them at your research database.

```sh
export TEST_DATABASE_URL=postgresql://lner:lner_local_only@127.0.0.1:5432/lner_test
NODE_ENV=test npm test
npm run build
npx playwright install chromium
NODE_ENV=test npm run test:browser
```

If using an installed Chromium, set `BROWSER_EXECUTABLE_PATH` to its executable. The browser test starts its own server on port 3100. Run integration and browser tests sequentially; both use the disposable database. Synthetic fixtures are explicitly labelled and never enter the main application database.

The integration checks cover file validation, byte-preserving retrieval, page labels, incomplete records, separate identifiers, referential validation, movement edits, stale saves, citation requirements, audit history and application restart. The browser test covers upload, PDF rendering/page navigation/zoom, manual entry, citations, review and a tablet viewport.

## Cloud Docker builds

The cloud proxy CA must be available during networked build steps:

```sh
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t lner-analyser:local .
docker compose up -d --no-build
```

On Windows without that proxy, the normal Compose build needs no secret. TLS verification remains enabled.

## Persistence and backup

Named volumes `lner-carriage-analyser_database` and `lner-carriage-analyser_documents` hold database state and original PDFs respectively. Back up both together. Keep the app stopped while making a consistent pair of backups; database service remains running.

Example PowerShell procedure (choose a fresh backup directory, preserving earlier backups):

```powershell
New-Item -ItemType Directory -Path backups/research-001
docker compose stop app
docker compose exec -T db pg_dump -U lner -Fc -f /tmp/lner.dump lner
docker compose cp db:/tmp/lner.dump backups/research-001/lner.dump
docker compose cp app:/data backups/research-001/documents
docker compose start app
```

Using `docker compose cp` avoids binary corruption from older PowerShell output redirection. Test restoration into separate volumes before relying on a backup. The backup/restore workflow has not been validated on a Windows machine in this cloud task.

## Next phases — not implemented

2. Local OCR, source crops, correction rules and transcription revisions.
3. Intermediate calls, full calendars, daily timelines and composition events.
4. Reviewed transitions and multi-day stock rotations with explicit gaps/conflicts.
5. Cross-period timetable candidate matching.
6. Versioned CSV/JSON export preview and validation.

Phase 1 stops here pending further instructions. No external integration, OCR, historical extraction or rotation claims are included.
