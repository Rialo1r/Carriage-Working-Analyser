# LNER Carriage Working & Rotation Planner

**Fresh application — Phase 1: manual data entry.** React/TypeScript, Node.js, PostgreSQL, Prisma and Docker Compose. No OCR, AI extraction, document upload or PDF processing. No Railway Operations Manager connection.

This replaces the previous carriage analyser's application files. The previous version remains in Git history. Use a freshly extracted download; do not overlay old files or reuse the analyser's database volume.

## Windows 11 — start here

1. Install/start Docker Desktop with **Linux containers** enabled.
2. Download the repository's `main` branch ZIP from GitHub and choose **Extract All**.
3. Open PowerShell **inside the extracted `Carriage-Working-Analyser-main` folder**. Verify the file is present:

```powershell
Get-Location
Get-ChildItem .\compose.yaml
docker compose up -d --build --wait --wait-timeout 180
```

4. Open **http://localhost:4310** on your computer.

Do not run these commands from your Railway Operations Manager folder. This version uses **`compose.yaml`**, not the old `compose.demo.yaml`. If PowerShell cannot find the file, run `Get-ChildItem C:\Railway -Filter compose.yaml -Recurse` and navigate to the planner's extracted folder.

Optional helper: `./scripts/Start-Planner.ps1` when local PowerShell script execution is enabled. The Docker command above works without enabling script execution.

First build needs Internet access for images/packages. Routine use after installation is local and offline. Later starts can use:

```powershell
docker compose up -d --no-build --wait
```

Stop: `docker compose stop`. The PostgreSQL volume retains your entries. **Never run `docker compose down -v` on your research setup.**

## First research entries

1. In **Stations & Types**, add station names and carriage types as needed. Names are not silently corrected or merged.
2. In **Published Diagrams**, add a historical period and published number (`262`, `822A`, etc.). A number can exist in different periods or as separately identified source records.
3. In **Formations**, optionally record composition. Unknown quantities/positions are allowed. Known formations show an exact total; incomplete formations show only the known minimum. An individual vehicle number requires quantity one.
4. In **Workings**, choose **Add Working**. Enter the starting/finishing stations, optional times, route, days, special instructions, manually typed source citation and notes. Use **Monday–Friday** or **Repeat Daily** to enter a rule once.
5. Use **Copy as Saturday variant** or **Copy as Sunday variant** for exceptions. Copying creates a new definition; it does not copy continuation rules or dated exceptions.
6. In the working detail, enter **Next working / diagram**. A typed number shows alternatives; choose the exact working definition. You may deliberately leave the reference unresolved. Set an elapsed day offset, a particular next weekday or an explicit date. Stabling can have an unknown duration.
7. Create a permanent **Physical Set** only when you are ready. UUIDs and `CS-0001`-style serials are independent of published numbers and cannot be edited.
8. In **Weekly Timetable**, choose an actual historical date and build the timetable. Assign physical sets to dated occurrences **manually**. Each following Monday is a different occurrence. Connections are labelled unverified.

You may save a working without known stations, times, formations or weekday rules. A working without operating weekdays/date inclusions will not appear in the timetable until its calendar is entered.

### Overnight times

Times are local historical clock values, not converted through modern time zones. Enter `00:30` with **finish day offset 1** for a Sunday working finishing early Monday. Day offset 0 means the same operating date. Unknown times remain blank. Phase 1 stores these values; it does not determine whether a connection is possible.

### Calendars and sources

Historical-period bounds and working-calendar bounds are inclusive. Date exceptions override weekday rules inside those bounds. Saturday/Sunday variants are separate definitions, so the same published number can have different endpoints or formations on different days.

Source references are manually typed document title, date and printed page. They are never uploaded or extracted. Citations are retained when a working is edited; add another citation rather than replacing historical evidence silently.

### Phase 1 boundaries

Implemented: catalogue, working edits/copies, weekday/date calendars, formations/variations, attach/detach records, exact continuation selection, distinct dated occurrences, permanent physical IDs, manual allocations, basic weekly/multi-week display and audit history.

The exclusive-occurrence database constraint prevents a second set from silently taking an existing exclusive assignment. Unassignments are retained as inactive records with audit history. Calendar edits do not delete existing manual assignments; the timetable identifies retained assignments outside the current calendar.

**Not implemented:** automatic destination/timing/formation checking, issues dashboard, candidate connection ranking, automatic rotation generation, approval/locking workflow, PDF/Excel/CSV exports. Phase 2 requires your approval. The weekly board does not verify or infer a repeating rotation.

No sample historical data is preloaded. The automated tests use clearly labelled synthetic fixtures in a separate database.

## Containers, ports and persistence

Compose project: `lner-rotation-planner`. Containers use this prefix, a separate network, database `planner`, and volume `lner-rotation-planner_planner-postgres`. PostgreSQL has no host port. The app binds to loopback port **4310**. No previous analyser or Railway Operations Manager volumes are used.

For a different host port in PowerShell:

```powershell
$env:PLANNER_PORT = '4315'
docker compose up -d --no-build --wait
```

This is single-researcher software on a trusted local computer, with no login system. Included database passwords are local-only defaults.

## Backup and restore

All research data is in PostgreSQL; there are no uploaded documents to back up. Backups include audit history, source references, physical-set UUIDs and the serial sequence.

Choose a **new** directory and stop the app for a consistent backup:

```powershell
New-Item -ItemType Directory -Path .\backups\research-001
docker compose stop app
docker compose exec -T db pg_dump -U planner -d planner -Fc -f /tmp/planner.dump
docker compose cp db:/tmp/planner.dump .\backups\research-001\planner.dump
docker compose start app
```

Or run `./scripts/Backup-Planner.ps1`. The copy step avoids corrupting binary dumps with older PowerShell output redirection. Keep backups outside the Docker volume and preferably on another device.

**Restore replaces the target planner database.** First make a separate backup of any current target data. Prefer testing restoration into a separate planner installation/Compose project. Never target Railway Operations Manager or the old analyser database.

With the planner's database running and app stopped:

```powershell
docker compose stop app
docker compose cp .\backups\research-001\planner.dump db:/tmp/planner-restore.dump
docker compose exec -T db pg_restore -U planner -d planner --clean --if-exists --no-owner /tmp/planner-restore.dump
docker compose start app
docker compose up -d --no-build --wait
```

Check the dump/restore command exit codes. Test backups periodically. Windows-specific shell behavior must still be checked on your machine; database backup/restore is tested in Linux Docker during development.

## Automated tests

The test runner uses a separate ephemeral database named `planner_test`. Tests delete **only that disposable database's records** and reject database names without `_test`.

```powershell
docker compose build app
docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests
docker compose -f compose.test.yaml down
```

Or `./scripts/Test-Planner.ps1`. The test image includes Chromium. The suite covers manual entry/editing, ambiguous references, separate dated Mondays, Sunday-to-Monday reference resolution, explicit overnight offsets, allocation safety, source/audit retention and the browser workflow. These are Phase 1 tests; they do not assert that an automatically reconstructed rotation is historically valid.

GitHub Actions is configured for build, PostgreSQL integration and browser tests. A local pass does not establish a remote Actions result.

## Development

Use the existing isolated checkout; do not create a worktree unless explicitly requested. Node 22+ and PostgreSQL 16 are required for host development:

```sh
npm ci
export DATABASE_URL=postgresql://planner:planner_local_only@localhost:5432/planner
npm run db:generate
npm run db:migrate
npm run build
npm start
```

PowerShell uses `$env:DATABASE_URL = '...'`. `.env.example` documents names but host scripts do not automatically load it. For live editing, run `npm run dev` and `npm run web` in separate terminals. Vite proxies the API to port 4310.

Prisma uses the JavaScript query engine and PostgreSQL adapter. SQL migrations are applied transactionally by `server/migrate.ts` with advisory locking and immutable checksums. Do not edit an applied migration or mix Prisma Migrate's history into this runner. The fresh planner migration explicitly rejects the legacy analyser's migration table. Add future phases through additive migrations.

Host test commands, with a disposable PostgreSQL database:

```sh
export TEST_DATABASE_URL=postgresql://planner:planner_test_only@localhost:5433/planner_test
NODE_ENV=test npm test
npm run build
npx playwright install chromium
NODE_ENV=test npm run test:browser
```

An installed Chromium can be selected with `BROWSER_EXECUTABLE_PATH`. Browser tests start a local server on port 4311.

Managed cloud builds must preserve proxy CA trust:

```sh
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t lner-rotation-planner:phase1 .
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -f Dockerfile.test -t lner-rotation-planner:tests .
```

Normal Windows Docker builds need no CA secret. TLS, signatures and checksums remain enabled.
