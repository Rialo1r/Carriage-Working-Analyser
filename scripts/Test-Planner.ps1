$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
docker compose build app
if ($LASTEXITCODE -ne 0) { throw 'Application build failed.' }
docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests
$testExitCode = $LASTEXITCODE
docker compose -f compose.test.yaml down
if ($testExitCode -ne 0) { throw "Tests failed with exit code $testExitCode." }
Write-Host 'Phase 1 integration and browser tests passed.'
