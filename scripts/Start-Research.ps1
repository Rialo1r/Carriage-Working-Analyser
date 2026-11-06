$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
docker compose up -d --build --wait --wait-timeout 180
if ($LASTEXITCODE -ne 0) { throw 'Startup failed. Run docker compose logs for details.' }
Write-Host 'Personal LNER research application is ready at http://localhost:3000'
