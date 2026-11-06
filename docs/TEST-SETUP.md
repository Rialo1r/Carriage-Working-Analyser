# Personal test setup

## Try the demonstration

With Docker Desktop running Linux containers, open PowerShell in the downloaded repository folder:

```powershell
docker compose -f compose.demo.yaml up -d --build --wait --wait-timeout 180
```

Open `http://localhost:3001` on your computer. Alternatively run `./scripts/Start-Demo.ps1` if local PowerShell script execution is enabled.

The demo has separate database/document volumes and deliberately fictional material:

- A synthetic 1939 roster PDF and synthetic 1937 timetable PDF.
- Diagrams 15, 22 and 31 around York, Scarborough and Huttons Ambo.
- Anonymous carriage formations, an intermediate call and dated operation assignments.
- An approved **hypothesis** of a three-day daily rotation, not a historically confirmed one.
- Train 123 appearing in both years with different times for manual cross-reference review.
- A queued OCR job and correction suggestions for Buttons Ambo / Scarborouch.

Nothing in this sample establishes actual LNER workings. The supplied chat photos have not been imported or used as invented evidence.

## Suggested walkthrough

1. Check the synthetic-data banner and dashboard counts.
2. In Documents, open the synthetic roster and zoom the page.
3. In OCR, review the completed job. Apply a correction suggestion, record a reason and save a new revision. Rerun OCR and confirm the old correction remains.
4. Open Diagram 15. Inspect the timeline, intermediate call, composition requirements and source citation. Edit a field and check its audit history.
5. In Rotations, open the synthetic scenario and inspect the three reviewed links. Build another rotation. Try rejecting a link and rebuilding: the rotation must become incomplete.
6. In Station Analysis, select Scarborough or Huttons Ambo and open a connected diagram.
7. In Timetable, select Diagram 15's train 123 movement. Observe the 1937/1939 warning and timing discrepancies. Record a match decision with a rationale.
8. In Export Centre, uncheck “Verified / ready-for-export diagrams only” to include the unverified fictional records. Preview and download JSON or CSV. Verification warnings are expected.

The demo seed runs once transactionally and preserves changes on later starts. Stop with `docker compose -f compose.demo.yaml stop` and resume with `docker compose -f compose.demo.yaml up -d --no-build --wait`.

To deliberately reset **only the disposable demo**: `docker compose -f compose.demo.yaml down -v`, then start it again. Do not use `down -v` on your real research setup.

## Run automated checks without installing Node/PostgreSQL on Windows

```powershell
docker compose build app
docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests
docker compose -f compose.test.yaml down
```

Or use `./scripts/Test-App.ps1`. The test database is isolated and ephemeral; the tests clear its synthetic records. The runner includes Chromium, Tesseract and Poppler. No research database is used. Preserve the test process exit status when automating these commands.

The browser suite covers document upload/viewing, OCR correction, connection review, cycle construction, cross-period timetable review, export preview and tablet layout. Integration checks exercise the actual PostgreSQL schema and local OCR engines. GitHub Actions runs the same host-based checks on pushes and pull requests; remote CI execution is separate from local validation.

First builds download Docker images, packages and OCR/browser dependencies. Routine demo/research use after installation is offline. Windows Docker Desktop behavior must still be verified on the user's own machine.

A ready-to-import fictional CSV is available at `docs/examples/synthetic-timetable.csv`. In the demo, select the synthetic timetable source before previewing it. The registered York, Huttons Ambo and Scarborough stations resolve its names.
