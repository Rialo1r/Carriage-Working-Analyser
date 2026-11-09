$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path '.\compose.yaml')) { throw 'compose.yaml is missing. Extract the complete GitHub ZIP before starting.' }
docker compose up -d --build --wait --wait-timeout 180
if ($LASTEXITCODE -ne 0) { throw 'Planner startup failed. Run docker compose logs app db to inspect the error.' }
Write-Host 'LNER Carriage Working & Rotation Planner'
Write-Host 'Open http://localhost:4310 on this computer.'
