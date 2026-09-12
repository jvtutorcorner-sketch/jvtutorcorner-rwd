$processes = Get-CimInstance Win32_Process | Where-Object { $_.Name -match "chrome|node|msedge|firefox|playwright" }
foreach ($p in $processes) {
    [PSCustomObject]@{
        Id = $p.ProcessId
        Name = $p.Name
        Path = $p.ExecutablePath
        CommandLine = $p.CommandLine
    } | Out-String | Write-Host
}
