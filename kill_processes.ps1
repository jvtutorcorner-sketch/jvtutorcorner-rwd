Write-Host "Starting to terminate background Node and Headless browser processes..." -ForegroundColor Cyan

# 1. Terminate all node processes
$nodeCount = 0
Get-Process -Name "node" -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        Stop-Process -Id $_.Id -Force -ErrorAction Stop
        $nodeCount++
    } catch {
        Write-Host "Failed to stop Node process ID $($_.Id): $_" -ForegroundColor Yellow
    }
}
Write-Host "Stopped $nodeCount node.exe processes." -ForegroundColor Green

# 2. Terminate all chrome-headless-shell processes
$headlessCount = 0
Get-Process -Name "chrome-headless-shell" -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        Stop-Process -Id $_.Id -Force -ErrorAction Stop
        $headlessCount++
    } catch {
        Write-Host "Failed to stop chrome-headless-shell process ID $($_.Id): $_" -ForegroundColor Yellow
    }
}
Write-Host "Stopped $headlessCount chrome-headless-shell.exe processes." -ForegroundColor Green

# 3. Terminate any other processes running from ms-playwright folder or with --headless
$otherCount = 0
$playwrightProcesses = Get-CimInstance Win32_Process | Where-Object {
    ($_.ExecutablePath -like "*ms-playwright*") -or 
    ($_.CommandLine -like "*--headless*") -or
    ($_.Name -match "playwright")
}

foreach ($p in $playwrightProcesses) {
    if ($p.ProcessId -eq $PID) { continue }
    try {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
        Write-Host "Stopped process: $($p.Name) (ID: $($p.ProcessId))" -ForegroundColor Gray
        $otherCount++
    } catch {
        # process might have already terminated
    }
}
Write-Host "Stopped $otherCount other Playwright/headless processes." -ForegroundColor Green

Write-Host "Cleanup completed successfully!" -ForegroundColor Green
