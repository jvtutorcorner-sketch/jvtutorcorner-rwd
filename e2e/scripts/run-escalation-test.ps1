# run-escalation-test.ps1
#
# Runs the PDF sync stress test through a sequence of group counts, starting
# from the levels defined by the individual stress scripts (3 → 5 → 6 → ...),
# stopping at the first failure and generating a markdown report.
#
# ALL runs use headed (browser-visible) mode. Headless is intentionally avoided
# because chromium processes launched headlessly tend to get stuck in the
# background without releasing resources between runs.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File e2e/scripts/run-escalation-test.ps1
#   powershell -ExecutionPolicy Bypass -File e2e/scripts/run-escalation-test.ps1 -MaxGroups 12 -ForceCloseMs 180000
#   powershell -ExecutionPolicy Bypass -File e2e/scripts/run-escalation-test.ps1 -StartGroups 5
#
# Or via npm:
#   npm run test:stress:escalation

param(
  # Ordered sequence of group counts to test. Default mirrors the individual
  # npm scripts (test:stress:3, :5, :6) then escalates by 1 until MaxGroups.
  [int]$StartGroups  = 3,
  [int]$MaxGroups    = 10,
  [string]$ForceCloseMs = "300000"
)

# Build the group sequence from StartGroups up to MaxGroups,
# using the same steps as the individual npm scripts (3 → 5 → 6 → 7 → ...)
$groupSequence = @()
if ($StartGroups -le 3 -and $MaxGroups -ge 3) { $groupSequence += 3 }
if ($StartGroups -le 5 -and $MaxGroups -ge 5) { $groupSequence += 5 }
if ($StartGroups -le 6 -and $MaxGroups -ge 6) { $groupSequence += 6 }
for ($i = [math]::Max(7, $StartGroups); $i -le $MaxGroups; $i++) {
    $groupSequence += $i
}
# Deduplicate while preserving order
$groupSequence = $groupSequence | Select-Object -Unique

# Use absolute paths so the script works regardless of working directory
$projectRoot  = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$reportDir    = Join-Path $projectRoot "stress-reports"
$timestamp    = Get-Date -Format "yyyyMMdd-HHmmss"
$reportFile   = Join-Path $reportDir "escalation-report-$timestamp.md"
$startTime    = Get-Date

# Ensure report directory exists
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  PDF Sync Stress — Escalation Test (HEADED)" -ForegroundColor Cyan
Write-Host "  Group sequence : $($groupSequence -join ' → ')" -ForegroundColor Cyan
Write-Host "  Force-close    : $([math]::Round([int]$ForceCloseMs/60000))min per group" -ForegroundColor Cyan
Write-Host "  Mode           : headed (browser visible — no headless)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ── Result parser ──────────────────────────────────────────────────
function Parse-Run($logFile, $groups, $exitCode, $durationSec) {
    $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue

    $enrolled  = if ($content -match 'Enrolled:\s+\d+/\d+ \((\d+)%\)')    { $Matches[1] } else { '?' }
    $uploaded  = if ($content -match 'PDF Uploaded:\s+\d+/\d+ \((\d+)%\)') { $Matches[1] } else { '?' }
    $entered   = if ($content -match 'Entered:\s+\d+/\d+ \((\d+)%\)')      { $Matches[1] } else { '?' }
    $synced    = if ($content -match 'PDF Synced:\s+\d+/\d+ \((\d+)%\)')   { $Matches[1] } else { '?' }
    $achieved  = if ($content -match 'Achieved success rate:\s+(\d+)%')     { $Matches[1] } else { '?' }

    $groupLines = @()
    $content -split "`n" | Where-Object { $_ -match '(✅|❌|⏰|⚠️) \[group-\d+\]' } | ForEach-Object {
        $groupLines += $_.Trim()
    }

    $mins   = [math]::Floor($durationSec / 60)
    $secs   = $durationSec % 60
    $durStr = if ($mins -gt 0) { "${mins}m ${secs}s" } else { "${secs}s" }

    return @{
        Groups     = $groups
        Enrolled   = $enrolled
        Uploaded   = $uploaded
        Entered    = $entered
        Synced     = $synced
        Achieved   = $achieved
        Duration   = $durStr
        Passed     = ($exitCode -eq 0)
        ExitCode   = $exitCode
        GroupLines = $groupLines
    }
}

# ── Run each level ─────────────────────────────────────────────────
$runs        = @()
$systemLimit = 0
$limitReason = "reached max groups ($MaxGroups)"
$roundNum    = 0

foreach ($g in $groupSequence) {
    $roundNum++
    Write-Host "────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host "  Round $roundNum / $($groupSequence.Count) — $g concurrent group(s)" -ForegroundColor Yellow
    Write-Host "────────────────────────────────────────────────────────────" -ForegroundColor DarkGray

    # Kill stale processes before each run to prevent resource contention
    Write-Host "  Cleaning up stale node/chrome processes..." -ForegroundColor DarkGray
    Stop-Process -Name "node"   -Force -ErrorAction SilentlyContinue
    Stop-Process -Name "chrome" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3

    $logFile  = Join-Path $reportDir "escalation-run-${g}groups.log"
    $runStart = Get-Date

    # Set environment variables for this run.
    # HEADLESS=0 overrides the auto-headless logic in resolveHeadless() inside
    # the spec file (which otherwise switches to headless for GROUP_COUNT >= 5).
    $env:CONCURRENT_GROUPS = "$g"
    $env:FORCE_CLOSE_MS    = $ForceCloseMs
    $env:HEADLESS          = "0"

    Push-Location $projectRoot
    npx playwright test e2e/classroom/07_room_pdf_sync_stress.spec.ts --project=chromium --headed 2>&1 | Tee-Object -FilePath $logFile
    $exitCode = $LASTEXITCODE
    Pop-Location

    $durationSec = [math]::Round(((Get-Date) - $runStart).TotalSeconds)

    # Safety-net cleanup after each run
    Stop-Process -Name "chrome" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    $run  = Parse-Run -logFile $logFile -groups $g -exitCode $exitCode -durationSec $durationSec
    $runs += $run

    if ($run.Passed) {
        Write-Host "  RESULT: PASS ($g groups, synced=$($run.Synced)%)" -ForegroundColor Green
        $systemLimit = $g
    } else {
        Write-Host "  RESULT: FAIL ($g groups, synced=$($run.Synced)%, exit=$exitCode)" -ForegroundColor Red
        $limitReason = "$g groups caused failure (synced=$($run.Synced)%)"
        break
    }
    Write-Host ""
}

# ── Generate markdown report ───────────────────────────────────────
$totalDuration = [math]::Round(((Get-Date) - $startTime).TotalMinutes, 1)
$reportDate    = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

$sb = [System.Text.StringBuilder]::new()

[void]$sb.AppendLine("# PDF Sync Stress Test — Escalation Report")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("**Date:** $reportDate  ")
[void]$sb.AppendLine("**Total duration:** ${totalDuration}min  ")
[void]$sb.AppendLine("**Force-close timeout:** $([math]::Round([int]$ForceCloseMs/60000))min per group  ")
[void]$sb.AppendLine("**Success threshold:** 75%  ")
[void]$sb.AppendLine("**Mode:** Headed (browser visible)  ")
[void]$sb.AppendLine("**Group sequence tested:** $($groupSequence -join ' → ')  ")
[void]$sb.AppendLine("")

if ($systemLimit -ge 1) {
    [void]$sb.AppendLine("## System Concurrency Limit: **$systemLimit concurrent group(s)**")
} else {
    [void]$sb.AppendLine("## System Concurrency Limit: **< $StartGroups groups (first level already failed)**")
}
[void]$sb.AppendLine("")
[void]$sb.AppendLine("> $limitReason")
[void]$sb.AppendLine("")

[void]$sb.AppendLine("## Results by Group Count")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("| Groups | Enrolled | Uploaded | Entered | Synced | Duration | Result |")
[void]$sb.AppendLine("|--------|----------|----------|---------|--------|----------|--------|")

foreach ($r in $runs) {
    $icon = if ($r.Passed) { "✅ PASS" } else { "❌ FAIL" }
    $row  = "| {0} | {1}% | {2}% | {3}% | {4}% | {5} | {6} |" -f `
            $r.Groups, $r.Enrolled, $r.Uploaded, $r.Entered, $r.Synced, $r.Duration, $icon
    [void]$sb.AppendLine($row)
}

[void]$sb.AppendLine("")
[void]$sb.AppendLine("## Per-Run Detail")
[void]$sb.AppendLine("")

foreach ($r in $runs) {
    $icon = if ($r.Passed) { "✅" } else { "❌" }
    [void]$sb.AppendLine("### $icon $($r.Groups) Group(s)")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("- Enrolled: $($r.Enrolled)%")
    [void]$sb.AppendLine("- PDF Uploaded: $($r.Uploaded)%")
    [void]$sb.AppendLine("- Entered classroom: $($r.Entered)%")
    [void]$sb.AppendLine("- PDF Synced: $($r.Synced)%")
    [void]$sb.AppendLine("- Achieved rate: $($r.Achieved)%")
    [void]$sb.AppendLine("- Duration: $($r.Duration)")
    [void]$sb.AppendLine("")
    if ($r.GroupLines.Count -gt 0) {
        $fence = '```'
        [void]$sb.AppendLine($fence)
        foreach ($line in $r.GroupLines) { [void]$sb.AppendLine($line) }
        [void]$sb.AppendLine($fence)
        [void]$sb.AppendLine("")
    }
}

$reportContent = $sb.ToString()
$reportContent | Out-File -FilePath $reportFile -Encoding utf8

# ── Database cleanup ───────────────────────────────────────────────
# Each escalation round creates courses, orders, and enrollments.
# Clean them all up after the full sequence to prevent DynamoDB bloat.
Write-Host ""
Write-Host "  Cleaning up stress test data from DynamoDB..." -ForegroundColor Cyan
$cleanupScript = Join-Path $projectRoot "e2e" "cleanup-database-direct.mjs"
if (Test-Path $cleanupScript) {
    Push-Location $projectRoot
    node $cleanupScript
    Pop-Location
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Warning: cleanup-database-direct.mjs exited with code $LASTEXITCODE" -ForegroundColor Yellow
    } else {
        Write-Host "  DynamoDB cleanup completed." -ForegroundColor Green
    }
} else {
    Write-Host "  cleanup-database-direct.mjs not found, running Playwright cleanup spec..." -ForegroundColor Yellow
    Push-Location $projectRoot
    npx playwright test e2e/cleanup-test-data.spec.ts --project=chromium --headed=false
    Pop-Location
}

# ── Final console summary ──────────────────────────────────────────
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  ESCALATION COMPLETE" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
$limitColor = if ($systemLimit -ge 6) { "Green" } elseif ($systemLimit -ge 4) { "Yellow" } else { "Red" }
Write-Host "  System limit : $systemLimit concurrent group(s)" -ForegroundColor $limitColor
Write-Host "  Reason       : $limitReason" -ForegroundColor White
Write-Host "  Total time   : ${totalDuration}min" -ForegroundColor White
Write-Host ""
Write-Host "  Summary table:" -ForegroundColor Cyan
foreach ($r in $runs) {
    $icon  = if ($r.Passed) { "PASS" } else { "FAIL" }
    $color = if ($r.Passed) { "Green" } else { "Red" }
    Write-Host ("  {0,2} group(s): {1}  synced={2}%  ({3})" -f $r.Groups, $icon, $r.Synced, $r.Duration) -ForegroundColor $color
}
Write-Host ""
Write-Host "  Report saved: $reportFile" -ForegroundColor Cyan
Write-Host ""
