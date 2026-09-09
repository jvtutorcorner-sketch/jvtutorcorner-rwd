# run-stress-test.ps1
# Wrapper for 07_room_pdf_sync_stress.spec.ts that ensures clean process state
# before and after each run, preventing performance degradation from leftover
# Node.js and Chromium processes.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File e2e/scripts/run-stress-test.ps1 [-Groups 5] [-ForceCloseMs 300000] [-Headless]
#
# Or via npm:
#   npm run test:stress:5

param(
  [int]$Groups       = 3,
  [string]$ForceCloseMs = "300000",
  [switch]$Headless
)

# ── Pre-test cleanup ───────────────────────────────────────────────────────────
# Kill stale node/chrome processes left over from previously interrupted test runs.
# This prevents port-3000 conflicts and CPU/memory degradation on the next run.
Write-Host "Killing stale node/chrome processes from previous runs..." -ForegroundColor Cyan
Stop-Process -Name "node"   -Force -ErrorAction SilentlyContinue
Stop-Process -Name "chrome" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# ── Run the test ───────────────────────────────────────────────────────────────
# Do NOT start npm run dev manually here — Playwright's webServer config will
# start and manage the dev server. Since we killed node above, port 3000 is free,
# so Playwright will start a fresh server and kill it when tests finish.

$env:CONCURRENT_GROUPS = "$Groups"
$env:FORCE_CLOSE_MS    = "$ForceCloseMs"

if ($Headless) {
  $env:HEADLESS = "1"
  $headlessFlag = "--headed=false"
} else {
  # The stress spec has its own auto-headless rule for 5+ groups.
  # Override it explicitly so --headed cannot be silently ignored.
  $env:HEADLESS = "0"
  $headlessFlag = "--headed"
}

Write-Host "Starting stress test: $Groups groups, force-close after $([math]::Round([int]$ForceCloseMs / 60000))min, headed=$(-not $Headless)" -ForegroundColor Cyan
npx playwright test e2e/classroom/07_room_pdf_sync_stress.spec.ts --project=chromium $headlessFlag
$exitCode = $LASTEXITCODE

# ── Post-test cleanup ──────────────────────────────────────────────────────────
# browser.close() in the test's finally block should have closed Chromium already.
# This is a safety net for cases where the test was interrupted mid-run.
Write-Host "Post-test: killing any leftover chrome processes..." -ForegroundColor Cyan
Stop-Process -Name "chrome" -Force -ErrorAction SilentlyContinue

# ── Database cleanup ───────────────────────────────────────────────────────────
# Remove stress test courses, orders, and enrollments created during the run.
# Without this, each run accumulates orphaned records in DynamoDB.
Write-Host "Post-test: cleaning up stress test data from DynamoDB..." -ForegroundColor Cyan
$cleanupScript = Join-Path $PSScriptRoot ".." "cleanup-database-direct.mjs"
if (Test-Path $cleanupScript) {
  node $cleanupScript
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: cleanup-database-direct.mjs exited with code $LASTEXITCODE" -ForegroundColor Yellow
  }
} else {
  # Fallback: run the Playwright cleanup spec (slower but reliable)
  Write-Host "cleanup-database-direct.mjs not found, running Playwright cleanup spec..." -ForegroundColor Yellow
  npx playwright test e2e/cleanup-test-data.spec.ts --project=chromium --headed=false
}

Write-Host "Stress test finished (exit code: $exitCode)" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
exit $exitCode
