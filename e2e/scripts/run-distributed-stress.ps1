# run-distributed-stress.ps1
# Runs 07_room_pdf_sync_stress.spec.ts as one shard of a distributed stress test.
# Sets GROUP_OFFSET, SYNC_START_TIME, and RESULT_OUTPUT_FILE automatically so
# results from multiple machines can be merged with merge-distributed-results.ps1.
#
# Usage (Machine A — runs groups 0-4):
#   powershell -ExecutionPolicy Bypass -File e2e/scripts/run-distributed-stress.ps1 `
#     -MachineId A -GroupOffset 0 -GroupCount 5 -SyncDelaySec 300
#
# Usage (Machine B — runs groups 5-9, MUST use the SAME -SyncTime printed by Machine A):
#   powershell -ExecutionPolicy Bypass -File e2e/scripts/run-distributed-stress.ps1 `
#     -MachineId B -GroupOffset 5 -GroupCount 5 -SyncTime 1750000000
#
# Environment variables forwarded from caller (override defaults):
#   BASE_URL, STRESS_RUN_TS, SKIP_CLEANUP, REUSE_STRESS_SETUP, HEADLESS
#   TEST_TEACHER_PASSWORD, TEST_STUDENT_PASSWORD, ADMIN_PASSWORD, LOGIN_BYPASS_SECRET

param(
  [string]$MachineId    = "A",
  [int]$GroupOffset     = 0,
  [int]$GroupCount      = 5,
  [int]$SyncDelaySec    = 300,    # Seconds from now when Phase 4 starts on all machines
  [long]$SyncTime       = 0,      # Unix timestamp (seconds) — override auto-computed value
  [string]$ForceCloseMs = "300000",
  [switch]$Headless,
  [switch]$SkipCleanup
)

$ErrorActionPreference = "Stop"

# ── Compute SYNC_START_TIME ────────────────────────────────────────────────────
# Machine A computes and prints the timestamp; Machine B passes it via -SyncTime.
if ($SyncTime -eq 0) {
  $SyncTime = [DateTimeOffset]::UtcNow.AddSeconds($SyncDelaySec).ToUnixTimeSeconds()
  Write-Host ""
  Write-Host "╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
  Write-Host "  DISTRIBUTED SYNC TIME: $SyncTime" -ForegroundColor Yellow
  Write-Host "  Pass this to Machine B with: -SyncTime $SyncTime" -ForegroundColor Yellow
  Write-Host "  Phase 4 will start at: $([DateTimeOffset]::FromUnixTimeSeconds($SyncTime).ToString('yyyy-MM-dd HH:mm:ss zzz'))" -ForegroundColor Yellow
  Write-Host "╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Machine B command:" -ForegroundColor Cyan
  Write-Host "  powershell -ExecutionPolicy Bypass -File e2e/scripts/run-distributed-stress.ps1 \" -ForegroundColor Cyan
  Write-Host "    -MachineId B -GroupOffset $($GroupOffset + $GroupCount) -GroupCount $GroupCount -SyncTime $SyncTime" -ForegroundColor Cyan
  Write-Host ""
}

$syncDateTime = [DateTimeOffset]::FromUnixTimeSeconds($SyncTime).ToString('yyyy-MM-dd HH:mm:ss zzz')
$resultFile   = "results-machine-$($MachineId.ToUpper()).json"
$groupEnd     = $GroupOffset + $GroupCount - 1

Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Distributed Stress Test — Machine $($MachineId.ToUpper())" -ForegroundColor Cyan
Write-Host "  Groups: $GroupOffset – $groupEnd ($GroupCount groups)" -ForegroundColor Cyan
Write-Host "  Sync start: $syncDateTime" -ForegroundColor Cyan
Write-Host "  Results file: $resultFile" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Cyan

# ── Pre-test cleanup ───────────────────────────────────────────────────────────
Write-Host "Killing stale node/chrome processes..." -ForegroundColor Cyan
Stop-Process -Name "node"   -Force -ErrorAction SilentlyContinue
Stop-Process -Name "chrome" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# ── Set environment variables ──────────────────────────────────────────────────
$env:CONCURRENT_GROUPS  = "$GroupCount"
$env:GROUP_OFFSET       = "$GroupOffset"
$env:SYNC_START_TIME    = "$SyncTime"
$env:FORCE_CLOSE_MS     = "$ForceCloseMs"
$env:RESULT_OUTPUT_FILE = $resultFile

if ($SkipCleanup) { $env:SKIP_CLEANUP = "1" }

if ($Headless) {
  $env:HEADLESS = "1"
  $headlessFlag = "--headed=false"
} else {
  $env:HEADLESS = "0"
  $headlessFlag = "--headed"
}

# Forward caller's env vars if set (passwords, base URL, etc.)
# These are already in the environment from the caller; no action needed.

# ── Run the test ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Starting Machine $($MachineId.ToUpper()) stress test ($GroupCount groups, offset=$GroupOffset, sync=$SyncTime)..." -ForegroundColor Cyan
npx playwright test e2e/classroom/07_room_pdf_sync_stress.spec.ts --project=chromium $headlessFlag
$exitCode = $LASTEXITCODE

# ── Post-test cleanup ──────────────────────────────────────────────────────────
Stop-Process -Name "chrome" -Force -ErrorAction SilentlyContinue

if (Test-Path $resultFile) {
  Write-Host ""
  Write-Host "Results saved to: $resultFile" -ForegroundColor Green
  Write-Host "Run merge-distributed-results.ps1 after all machines finish." -ForegroundColor Yellow
} else {
  Write-Host "WARNING: $resultFile not found — test may have crashed before writing results." -ForegroundColor Red
}

Write-Host "Machine $($MachineId.ToUpper()) finished (exit code: $exitCode)" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
exit $exitCode
