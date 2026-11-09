# LNER Carriage Working & Rotation Planner

**Manual roster entry, continuity checks and approved physical-stock rotations.** React/TypeScript, Node.js, PostgreSQL, Prisma and Docker Compose. No OCR, AI extraction, document upload or PDF processing. No Railway Operations Manager connection.

This replaces the previous carriage analyser's application files. The previous version remains in Git history. For a fresh installation, use a newly extracted download. Existing planner installations should back up their database and rebuild: the additive migrations preserve entered planner research. Do not reuse the deleted analyser's old database.

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

## Research workflow

1. In **Stations & Types**, add, edit or delete unused station/type entries. Referenced entries can be archived or explicitly replaced after reviewing the affected references. Nothing is silently merged. Archived entries can be restored. Internal UUIDs are hidden.
2. In **Carriage Roster**, choose **Add roster set**, enter its published number and historical period, then enter its working. A published set is a source diagram, not a physical carriage identity.
3. Enter days, starting/finishing stations, optional clock times, route/intermediate calls, formation, instructions, citations and notes. Copy weekday workings into Saturday/Sunday variants when their routes or endpoints differ. Use the same published diagram for these variants.
4. For alternate-week patterns, enter the cycle length, Monday anchor date and active week offsets. Date exceptions override weekday/cycle rules within inclusive period/calendar bounds. For a long chain of changing diagrams, enter each diagram's own operating pattern and its specific next-working instruction; do not relabel the physical carriages.
5. Under **Next working / diagram**, select the exact daily definition and an elapsed day, next weekday or explicit date. A typed ambiguous number is never selected automatically. Stabling may have an explicitly entered location and resuming working, or remain unknown.
6. In **Stock Chains**, choose a historical period, actual first date and 2–26 weeks, then **Check All Connections**. Review location, calendar, timing, formation and allocation checks. Unknown times remain unverified. Candidate station matches are possibilities, not proof.
7. **Generate Rotations** follows explicit instructions and your approved connections. Review each dated chain and its open ends. Approve it with a reason to create a permanent `CS-0001` style physical set, or associate an existing physical set. Approval can explicitly accept uncertainty; definite contradictions must be corrected first. Nothing is allocated until you approve.
8. Use the **Issues** dashboard to filter findings and retain investigation notes. Dismissed does not mean resolved. Record a researched connecting movement from a connection card if a transfer is missing. Re-run checking after input changes.
9. The **Weekly Timetable** is the master multi-week board. Approved rotation cards also show a seven-column weekly view, recorded/proposed stabling and a clickable chain. Distinct Mondays have distinct daily occurrence identifiers.

### Protecting research

Approved snapshots are retained even when the live roster changes. New calculations create proposals; they do not overwrite saved research. Locked rotations block disconnection, unassignment and changes to connecting movements they use. Unlock with a reason before reviewing those relationships. Compare the saved snapshot with a fresh proposal; approve revised research as another retained snapshot. Selecting an existing physical set reuses its permanent identity. Existing exclusive assignments and overlapping timed allocations block conflicting saves.

A repeated pattern is reported only when the observed dated chain supports at least two cycles. Generation does not extend assignments beyond the selected horizon or assume every pattern is seven days. An open three-day chain is not labelled repeating. Candidate alternatives are reviewed on connection cards; the generator never picks a station match arbitrarily.

### Formations and overnight times

The base/day-specific formation describes the **departure formation**. Start attachments are already included in it; the checker subtracts them when comparing arriving stock. En-route/Finish changes adjust the outgoing stock. Record real attachments and detachments explicitly. Differences produce research warnings; incomplete formations remain unverified.

Enter `00:30` with **finish day offset 1** for a Sunday working finishing early Monday. Day offset 0 means the same operating date. Missing times remain blank. Dates and offsets are checked without modern time-zone conversion.

All source citations are manually typed. No historical fixtures are preloaded. PDF/Excel/CSV reporting remains a future phase; this build delivers roster management, checks and rotation research.

## Updating an existing planner

Back up first using the instructions below. Extract the new repository ZIP, open PowerShell in that folder, then run `docker compose up -d --build --wait --wait-timeout 180`. Keep the same Compose project name and database volume. Migrations run automatically; do not delete volumes.

## Desktop and iPad on the same network

The desktop runs Docker and retains the database. The iPad uses Safari and needs no installation. By default the app accepts desktop-only connections. To enable your trusted home network:

```powershell
$env:PLANNER_BIND = '0.0.0.0'
docker compose up -d --no-build --wait
ipconfig
```

On the iPad open `http://DESKTOP-IPv4-ADDRESS:4310`, for example `http://192.168.1.20:4310`. `localhost` on the iPad refers to the iPad. Keep the desktop awake, use the same Wi-Fi, and allow TCP port 4310 through Windows Firewall for **Private** networks if needed. This personal app has no login; do not forward the port through your router or expose it publicly. Both devices edit the same database. Reset `PLANNER_BIND` to `127.0.0.1` and recreate the app container to return to desktop-only access.

## Containers, ports and persistence

Compose project: `lner-rotation-planner`. Containers use this prefix, a separate network, database `planner`, and volume `lner-rotation-planner_planner-postgres`. PostgreSQL has no host port. The app binds to loopback port **4310** unless `PLANNER_BIND` is explicitly changed. No previous analyser or Railway Operations Manager volumes are used.

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

Or `./scripts/Test-Planner.ps1`. The test image includes Chromium. The suite covers manual entry/editing, ambiguous references, separate dated Mondays, Sunday-to-Monday reference resolution, explicit overnight offsets, allocation safety, source/audit retention and the browser workflow. These are planner tests; they do not assert that an automatically reconstructed rotation is historically valid.

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
