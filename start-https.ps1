# Stop any process running on port 3000 or 3001
Write-Host "Stopping existing processes on ports 3000 and 3001..." -ForegroundColor Cyan
$ports = @(3000, 3001)
foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $procId = $conn.OwningProcess
            if ($procId -gt 0) {
                Write-Host "Killing process $procId on port $port..." -ForegroundColor Yellow
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

# Start the HTTPS proxy
Write-Host "Starting HTTPS Proxy..." -ForegroundColor Green
npm run dev:proxy
