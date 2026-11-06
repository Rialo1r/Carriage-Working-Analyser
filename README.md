# LNER Carriage Working Analyser

A standalone, personal research application for digitising historical carriage workings and reconstructing possible multi-day stock rotations. React/TypeScript, Node/TypeScript, PostgreSQL, Prisma, PDF.js, local Tesseract OCR and Docker Compose.

**Separate application and database. No connection to Railway Operations Manager. No paid cloud services. Routine operation is offline after installation.**

## Download and try the test setup

Download this GitHub repository as a ZIP, extract it, install Docker Desktop for Windows 11 with Linux containers enabled, and open PowerShell in the extracted folder:

```powershell
docker compose -f compose.demo.yaml up -d --build --wait --wait-timeout 180
```

Open `http://localhost:3001` on your computer. The demo includes **fictional** York–Scarborough workings, source PDFs, a three-day rotation, carriage formations and a mismatched 1937 timetable candidate. All are labelled synthetic. It uses separate database and document volumes from your research instance.

[Full test walkthrough](docs/TEST-SETUP.md). Optional PowerShell helpers are in `scripts/`.

## Start your empty research instance

```powershell
docker compose up -d --build --wait --wait-timeout 180
```

Open `http://localhost:3000`. No historical data is preloaded. Ports bind to loopback for personal use; PostgreSQL is not exposed to the host. This is a single-researcher application without login, intended for a trusted personal machine.

Later starts: `docker compose up -d --no-build --wait`. Stop: `docker compose stop`. Database and original documents persist in named volumes. **Do not use `docker compose down -v` on research data.**

## Research workflow

1. **Documents:** upload an unencrypted PDF up to 100 MB. Record title, source date, operating period, region and description. View/zoom pages and record printed page labels independently of PDF indices.
2. **OCR:** select only relevant pages. Rotate sideways scans; drag a crop around a table/entry. Choose an OCR layout, queue local recognition, review the rendered crop and raw text, and save corrected transcription revisions. Rules suggest corrections without silently changing evidence. Reruns create separate jobs. Search raw and corrected text for station, train and diagram references.
3. **Diagrams:** create selected source-linked workings with incomplete fields allowed. Add/edit multiple movements, intermediate station calls, original time notation, operating days, date exceptions, composition requirements and attach/detach instructions. View the timeline, layovers and conflicts. Times are minutes from service-day midnight; explicit next-day times can be entered as `24:20`. Unknown stays unknown.
4. **Formations:** record carriage types, anonymous quantities or identified vehicles and physical stock research identities. Assign a formation to a dated/scenario-day operation; a diagram number never permanently identifies that stock.
5. **Rotations:** choose diagrams and an explicit date scenario with documented assumptions. Suggest connections; inspect calendar, station, time, composition and source-period checks. Approve/reject manually with reasons. Confirmed links require a source citation. Missing transfers remain gaps. Build rotations only from approved links; branches, conflicts and unsupported recurrence remain review issues.
6. **Station Analysis / Unresolved:** inspect starts, finishes, intermediate calls and reviewed/candidate links. York, Scarborough and Huttons Ambo are focus shortcuts. Search also recognises registered aliases.
7. **Timetable:** enter source-specific services manually, or preview CSV/JSON imports before committing them. Match movement candidates and review route, times, operating days and source dates. Matching 1937/1939 train numbers never automatically merge records.
8. **Export Centre:** preview verified-only or explicitly unverified research snapshots, then download exactly that JSON/CSV snapshot. Source references, statuses, formations, intermediate calls and rotations are retained. [Future integration contract](docs/INTEGRATION.md).

Original PDFs remain unchanged and are SHA-256 recorded. Important changes are audited. Material diagram/movement edits invalidate a prior verified state; verification history remains. There are no source-deletion endpoints.

### Limits requiring historical review

OCR provides text blocks and confidence, not verified railway facts. Tiny print, ligatures, poor contrast and complex columns can defeat Tesseract. Crop and rotate before recognition; transcribe manually where needed. Layout/extraction assistance creates a draft working from text you select; it does not reconstruct historical stock identities automatically.

Calendar analysis supports weekday rules and dated exceptions within a bounded scenario. Conditional historical phrases must be resolved into those rules or retained as uncertainty notes. A recurring circuit requires compatible weekday shifts and checks across the scenario; it is not a claim beyond that period. Missing diagrams or transfers are not invented. Complex splits/joins require explicit formation assignments and composition changes; competing continuations remain unresolved rather than being flattened into one stock path.

Exports are research interchange files, not an implemented Railway Operations Manager importer. Your actual 1937/1939 PDFs have not been supplied for accuracy testing. The Newcastle/Blyth timetable photos in chat have not been imported as York–Scarborough evidence.

## Automated tests

Docker-only test setup:

```powershell
docker compose build app
docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests
docker compose -f compose.test.yaml down
```

GitHub Actions runs TypeScript/build, PostgreSQL integration, local OCR and Chromium browser tests on pushes/pull requests. See [test setup](docs/TEST-SETUP.md).

## Host development

Node 22+, PostgreSQL 16, Tesseract English and Poppler are required. Use this existing isolated checkout; do not create a worktree unless explicitly requested.

```sh
npm ci
export DATABASE_URL=postgresql://lner:lner_local_only@127.0.0.1:5432/lner
npm run db:generate
npm run db:migrate
npm run build
npm start
# In another terminal, with the same DATABASE_URL / STORAGE_DIR:
npm run worker
```

For live editing, run `npm run dev` and `npm run web`; Vite proxies to port 3000. PowerShell sets variables with `$env:DATABASE_URL = '...'`. `.env.example` documents variables; scripts do not automatically load `.env`.

Tests require a separate disposable database ending in `_test`; **tests clear its records**. Never use your research database:

```sh
export TEST_DATABASE_URL=postgresql://lner:lner_local_only@127.0.0.1:5432/lner_test
NODE_ENV=test npm test
npm run build
npx playwright install chromium
NODE_ENV=test npm run test:browser
```

An existing Chromium can be selected with `BROWSER_EXECUTABLE_PATH`. Run integration and browser tests sequentially; the browser suites start their own server on port 3100.

Prisma 6.19 uses its JavaScript engine and PostgreSQL adapter. CLI generation needs DATABASE_URL even though it does not connect. The CLI adapter path avoids native-engine downloads. Dependency overrides select patched transitive packages; the lockfile is committed. No TLS/checksum checks are disabled.

SQL migrations under `prisma/migrations` run transactionally with an advisory lock and immutable SHA-256 history through `npm run db:migrate`. Do not edit applied migrations or mix Prisma Migrate's history into this runner. Add an additive migration, update `schema.prisma`, regenerate and test it.

## Cloud build proxy

Only in the managed cloud environment, supply its proxy CA as a BuildKit secret:

```sh
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t lner-analyser:local .
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -f Dockerfile.test -t lner-analyser:tests .
docker compose -f compose.demo.yaml up -d --no-build --wait
```

Normal Windows builds need no proxy secret. Package signatures, checksums and TLS stay enabled.

## Backup

Back up both `lner-carriage-analyser_database` and `lner-carriage-analyser_documents`. Stop app and worker while taking a consistent pair; leave PostgreSQL running. Choose a new backup directory:

```powershell
New-Item -ItemType Directory -Path backups/research-001
docker compose stop app worker
docker compose exec -T db pg_dump -U lner -Fc -f /tmp/lner.dump lner
docker compose cp db:/tmp/lner.dump backups/research-001/lner.dump
docker compose cp app:/data backups/research-001/documents
docker compose start app worker
```

Copying the dump avoids binary corruption from older PowerShell redirection. Test restoring into separate volumes before relying on backups. Windows-specific backup/restore has not been tested in this cloud task.
