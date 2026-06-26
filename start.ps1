# Chain Analytics Next.js Startup Script (Windows PowerShell)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($ScriptDir) { Set-Location $ScriptDir }

Write-Host '=================================================='
Write-Host '      Chain Analytics — Rebuilt Full-Stack App     '
Write-Host '=================================================='
Write-Host ''

if (-not (Test-Path 'data/chain_analytics.db')) {
  Write-Host '[db] Database file data/chain_analytics.db not found. Initializing...'
  npx tsx scripts/update_labels.ts
  npx tsx scripts/update_sanctions.ts
  Write-Host ''
}

Write-Host 'Starting Next.js (Dashboard + API Router)...'
Write-Host '  URL: http://localhost:3000'
Write-Host '  API: http://localhost:3050/api/health'
Write-Host 'Press Ctrl+C to stop.'
Write-Host ''

npm run dev
