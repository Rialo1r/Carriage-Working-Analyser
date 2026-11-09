param([string]$Destination = ('backups\planner-' + (Get-Date -Format 'yyyyMMdd-HHmmss')))
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (Test-Path $Destination) { throw 'Backup destination already exists. Choose a new directory.' }
New-Item -ItemType Directory -Path $Destination | Out-Null
docker compose stop app
if ($LASTEXITCODE -ne 0) { throw 'Could not stop the application for backup.' }
try {
    docker compose exec -T db pg_dump -U planner -d planner -Fc -f /tmp/planner-backup.dump
    if ($LASTEXITCODE -ne 0) { throw 'Database backup failed.' }
    docker compose cp db:/tmp/planner-backup.dump "$Destination\planner.dump"
    if ($LASTEXITCODE -ne 0) { throw 'Copying the backup failed.' }
    Write-Host "Backup saved to $Destination\planner.dump"
} finally {
    docker compose start app
}
