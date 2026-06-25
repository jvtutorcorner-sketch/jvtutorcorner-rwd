# merge-distributed-results.ps1
# Reads results-machine-*.json files produced by run-distributed-stress.ps1
# and prints a combined MVP pass/fail summary across all machines.
#
# Usage (run after all machines finish):
#   powershell -ExecutionPolicy Bypass -File e2e/scripts/merge-distributed-results.ps1
#
# Or specify a custom glob pattern:
#   powershell -ExecutionPolicy Bypass -File e2e/scripts/merge-distributed-results.ps1 `
#     -ResultsGlob "results-machine-*.json" -SuccessThreshold 0.90
#
# Each result file is a JSON array of GroupResult objects:
#   [{ groupId, courseId, enrolled, uploaded, entered, synced, error?, phase?, timings? }]

param(
  [string]$ResultsGlob      = "results-machine-*.json",
  [double]$SuccessThreshold = 0.90
)

$ErrorActionPreference = "Stop"

# ── Locate result files ────────────────────────────────────────────────────────
$resultFiles = Get-ChildItem -Path "." -Filter $ResultsGlob -ErrorAction SilentlyContinue |
               Sort-Object Name

if ($resultFiles.Count -eq 0) {
  Write-Host ""
  Write-Host "❌ No result files found matching: $ResultsGlob" -ForegroundColor Red
  Write-Host "   Run run-distributed-stress.ps1 on each machine first." -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Distributed Stress Test — Merged Results" -ForegroundColor Cyan
Write-Host "  Files: $($resultFiles.Name -join ', ')" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Cyan

# ── Load and merge all groups ──────────────────────────────────────────────────
$allGroups = @()
foreach ($file in $resultFiles) {
  $machineLabel = $file.Name -replace 'results-machine-', '' -replace '\.json$', ''
  try {
    $groups = Get-Content $file.FullName -Raw | ConvertFrom-Json
    Write-Host ""
    Write-Host "  Machine $machineLabel ($($groups.Count) groups):" -ForegroundColor Cyan
    foreach ($g in $groups) {
      $icon = if ($g.synced) { "✅" } elseif ($g.phase -eq 'force_closed') { "⏰" } elseif ($g.entered) { "⚠️" } else { "❌" }
      $failNote = if ($g.phase -and -not $g.synced) { " [failed at: $($g.phase)]" } else { "" }
      $timingNote = ""
      if ($g.timings -and $g.timings.studentSyncedMs) {
        $timingNote = " (sync=$($g.timings.studentSyncedMs)ms)"
      }
      Write-Host "    $icon [$($g.groupId)] enrolled=$($g.enrolled) uploaded=$($g.uploaded) entered=$($g.entered) synced=$($g.synced)$failNote$timingNote"
    }
    $allGroups += $groups
  } catch {
    Write-Host "  ⚠️  Failed to parse $($file.Name): $_" -ForegroundColor Yellow
  }
}

# ── Compute combined metrics ───────────────────────────────────────────────────
$totalGroups   = $allGroups.Count
$totalEnrolled = ($allGroups | Where-Object { $_.enrolled }).Count
$totalUploaded = ($allGroups | Where-Object { $_.uploaded }).Count
$totalEntered  = ($allGroups | Where-Object { $_.entered }).Count
$totalSynced   = ($allGroups | Where-Object { $_.synced }).Count

if ($totalGroups -eq 0) {
  Write-Host ""
  Write-Host "❌ No groups found in result files." -ForegroundColor Red
  exit 1
}

$achievedRate = $totalSynced / $totalGroups
$passed       = $achievedRate -ge $SuccessThreshold

Write-Host ""
Write-Host "─────────────────────────────────────────────────────────────────" -ForegroundColor Cyan
Write-Host "  COMBINED RESULTS ($totalGroups total groups)" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────────────────" -ForegroundColor Cyan
Write-Host "  Enrolled:     $totalEnrolled/$totalGroups ($([Math]::Round($totalEnrolled / $totalGroups * 100))%)"
Write-Host "  PDF Uploaded: $totalUploaded/$totalGroups ($([Math]::Round($totalUploaded / $totalGroups * 100))%)"
Write-Host "  Entered:      $totalEntered/$totalGroups ($([Math]::Round($totalEntered / $totalGroups * 100))%)"
Write-Host "  PDF Synced:   $totalSynced/$totalGroups ($([Math]::Round($achievedRate * 100))%)"
Write-Host ""
Write-Host "  Required success rate: $([Math]::Round($SuccessThreshold * 100))%" -ForegroundColor Cyan
Write-Host "  Achieved success rate: $([Math]::Round($achievedRate * 100))%" -ForegroundColor $(if ($passed) { "Green" } else { "Red" })
Write-Host ""

if ($passed) {
  Write-Host "  ✅ MVP PASS — $totalSynced/$totalGroups groups synced (≥ $([Math]::Round($SuccessThreshold * 100))%)" -ForegroundColor Green
} else {
  $needed = [Math]::Ceiling($SuccessThreshold * $totalGroups)
  Write-Host "  ❌ MVP FAIL — $totalSynced/$totalGroups synced (need $needed/$totalGroups)" -ForegroundColor Red
}
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ── Per-group failure analysis ─────────────────────────────────────────────────
$failed = $allGroups | Where-Object { -not $_.synced }
if ($failed.Count -gt 0) {
  Write-Host "  Failed group breakdown:" -ForegroundColor Yellow
  $phaseCounts = $failed | Group-Object -Property { if ($_.phase) { $_.phase } else { "unknown" } }
  foreach ($phaseGroup in $phaseCounts | Sort-Object Count -Descending) {
    Write-Host "    $($phaseGroup.Count)x failed at: $($phaseGroup.Name)" -ForegroundColor Yellow
  }
  Write-Host ""
}

exit $(if ($passed) { 0 } else { 1 })
