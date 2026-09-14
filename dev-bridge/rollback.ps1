$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $scriptRoot 'config.json'
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$targetPath = [string]$config.targetPath
$statePath = Join-Path $targetPath '.bridge-state'
$lastHeadPath = Join-Path $statePath 'last-head.txt'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'Git is not installed or not available in PATH.'
}

if (-not (Test-Path -LiteralPath (Join-Path $targetPath '.git'))) {
    throw "Not a Git repository: $targetPath"
}

if (-not (Test-Path -LiteralPath $lastHeadPath)) {
    throw 'No previous bridge revision is stored yet. A rollback is only available after the bridge has performed at least one update.'
}

$status = & git -C $targetPath status --porcelain 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Could not read Git status: $($status | Out-String)"
}

$dirtyLines = @($status | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
if ($dirtyLines.Count -gt 0) {
    throw 'Rollback refused because local changes exist. Commit or discard them first.'
}

$previousHead = (Get-Content -LiteralPath $lastHeadPath -Raw).Trim()
if ([string]::IsNullOrWhiteSpace($previousHead)) {
    throw 'Stored rollback revision is empty.'
}

$currentHead = (& git -C $targetPath rev-parse HEAD 2>&1 | Select-Object -First 1).ToString().Trim()
if ($LASTEXITCODE -ne 0) {
    throw 'Could not determine current revision.'
}

Write-Host "Current revision : $currentHead"
Write-Host "Rollback target  : $previousHead"
Write-Host ''
Write-Host 'IMPORTANT: Stop the running Dev Bridge first, otherwise it will pull main again.' -ForegroundColor Yellow
Write-Host ''
$answer = Read-Host 'Type ROLLBACK to continue'

if ($answer -cne 'ROLLBACK') {
    Write-Host 'Rollback cancelled.'
    exit 0
}

& git -C $targetPath reset --hard $previousHead
if ($LASTEXITCODE -ne 0) {
    throw 'Git reset failed.'
}

Write-Host ''
Write-Host "Rollback completed. Local repository is now at $previousHead" -ForegroundColor Green
Write-Host 'Keep the Dev Bridge stopped until you intentionally want to update to origin/main again.' -ForegroundColor Yellow
