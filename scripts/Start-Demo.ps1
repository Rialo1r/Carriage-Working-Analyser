$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
docker compose -f compose.demo.yaml up -d --build --wait --wait-timeout 180
if ($LASTEXITCODE -ne 0) { throw 'Demo startup failed. Run docker compose -f compose.demo.yaml logs for details.' }
Write-Host 'Synthetic LNER demo is ready at http://localhost:3001'
Write-Host 'All data is fictional. The demo uses separate database and document volumes.'
