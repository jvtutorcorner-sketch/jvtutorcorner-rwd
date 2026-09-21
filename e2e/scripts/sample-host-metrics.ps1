# sample-host-metrics.ps1
# Samples load-rig CPU / memory / browser footprint to CSV while a stress test runs,
# so a failed run can be attributed to the rig (CPU pinned, RAM exhausted) or the platform.
#
# Uses CIM (locale-independent) instead of Get-Counter, whose counter names are
# translated on non-English Windows (e.g. zh-TW) and would fail there.
#
# Usage (start in a second window before the test, Ctrl+C to stop):
#   powershell -ExecutionPolicy Bypass -File e2e/scripts/sample-host-metrics.ps1
#   powershell -ExecutionPolicy Bypass -File e2e/scripts/sample-host-metrics.ps1 -IntervalSec 5 -OutFile host-A.csv
#   powershell -ExecutionPolicy Bypass -File e2e/scripts/sample-host-metrics.ps1 -DurationSec 900
#
# Columns: timestamp, cpu_pct, used_mem_pct, available_mb, chrome_procs, chrome_ws_mb, node_procs, node_ws_mb

param(
  [int]$IntervalSec = 5,
  [string]$OutFile  = "host-metrics-$($env:COMPUTERNAME)-$(Get-Date -Format 'yyyyMMdd-HHmmss').csv",
  [int]$DurationSec = 0   # 0 = until Ctrl+C
)

$ErrorActionPreference = "Stop"

"timestamp,cpu_pct,used_mem_pct,available_mb,chrome_procs,chrome_ws_mb,node_procs,node_ws_mb" |
  Out-File -FilePath $OutFile -Encoding utf8

Write-Host "Sampling host metrics every ${IntervalSec}s → $OutFile (Ctrl+C to stop)" -ForegroundColor Cyan

$started = Get-Date
$peakCpu = 0; $minAvail = [double]::MaxValue; $samples = 0

try {
  while ($true) {
    $cpu = (Get-CimInstance -ClassName Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
    $os = Get-CimInstance -ClassName Win32_OperatingSystem
    $totalMb = [Math]::Round($os.TotalVisibleMemorySize / 1024)
    $availMb = [Math]::Round($os.FreePhysicalMemory / 1024)
    $usedPct = if ($totalMb -gt 0) { [Math]::Round((1 - $availMb / $totalMb) * 100, 1) } else { 0 }

    $chrome = @(Get-Process -Name chrome, chromium, headless_shell -ErrorAction SilentlyContinue)
    $node   = @(Get-Process -Name node -ErrorAction SilentlyContinue)
    $chromeMb = [Math]::Round((($chrome | Measure-Object -Property WorkingSet64 -Sum).Sum) / 1MB)
    $nodeMb   = [Math]::Round((($node   | Measure-Object -Property WorkingSet64 -Sum).Sum) / 1MB)

    $ts = (Get-Date).ToString("o")
    "$ts,$cpu,$usedPct,$availMb,$($chrome.Count),$chromeMb,$($node.Count),$nodeMb" |
      Out-File -FilePath $OutFile -Encoding utf8 -Append

    $samples++
    if ($cpu -gt $peakCpu) { $peakCpu = $cpu }
    if ($availMb -lt $minAvail) { $minAvail = $availMb }
    Write-Host ("{0}  cpu={1,3}%  mem={2,5}%  avail={3,6}MB  chrome={4,3} ({5}MB)  node={6} ({7}MB)" -f `
      (Get-Date -Format 'HH:mm:ss'), $cpu, $usedPct, $availMb, $chrome.Count, $chromeMb, $node.Count, $nodeMb)

    if ($DurationSec -gt 0 -and ((Get-Date) - $started).TotalSeconds -ge $DurationSec) { break }
    Start-Sleep -Seconds $IntervalSec
  }
} finally {
  Write-Host ""
  Write-Host "Samples: $samples  peak CPU: $peakCpu%  min available: $minAvail MB  → $OutFile" -ForegroundColor Cyan
  if ($peakCpu -ge 90) {
    Write-Host "⚠️  CPU reached ${peakCpu}% — failures in this window may be the rig, not the platform." -ForegroundColor Yellow
  }
}
