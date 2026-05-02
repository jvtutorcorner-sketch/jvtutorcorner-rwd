#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Production Stress Test Runner for Classroom Whiteboard Sync (Windows PowerShell)
.DESCRIPTION
    方便的 PowerShell 腳本，用於在 Windows 上執行正式環境壓力測試
.PARAMETER TestType
    測試類型: 'e2e' (Playwright), 'load' (k6 負載測試)
.PARAMETER GroupCount
    並發組數（僅用於 E2E 測試），預設: 3
.PARAMETER VirtualUsers
    虛擬用戶數（僅用於 k6 測試），預設: 10
.PARAMETER LoadType
    負載測試類型: 'load', 'stress', 'spike'，預設: 'load'
.PARAMETER Runs
    執行次數（僅用於 E2E 測試），預設: 1
.EXAMPLE
    # 執行基礎 E2E 壓力測試
    .\production_stress_test.ps1 -TestType e2e

    # 執行 5 組並發
    .\production_stress_test.ps1 -TestType e2e -GroupCount 5

    # 執行 k6 負載測試
    .\production_stress_test.ps1 -TestType load -VirtualUsers 50

    # 執行 spike 測試
    .\production_stress_test.ps1 -TestType load -LoadType spike -VirtualUsers 20
#>

param(
    [ValidateSet('e2e', 'load')]
    [string]$TestType = 'e2e',
    
    [int]$GroupCount = 3,
    [int]$VirtualUsers = 10,
    [int]$Runs = 1,
    
    [ValidateSet('load', 'stress', 'spike')]
    [string]$LoadType = 'load',
    
    [switch]$Verbose,
    [switch]$Report
)

# ─────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent | Split-Path -Parent | Split-Path -Parent
$BaseUrl = 'https://www.jvtutorcorner.com'
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'

# Color codes
$colors = @{
    Success = 'Green'
    Error = 'Red'
    Warning = 'Yellow'
    Info = 'Cyan'
    Banner = 'Magenta'
}

# ─────────────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────────────

function Write-Banner {
    param([string]$Message)
    Write-Host "`n$('─' * 70)" -ForegroundColor $colors.Banner
    Write-Host "  $Message" -ForegroundColor $colors.Banner
    Write-Host "$('─' * 70)`n" -ForegroundColor $colors.Banner
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor $colors.Success
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor $colors.Error
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor $colors.Warning
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor $colors.Info
}

function Write-Debug {
    param([string]$Message)
    if ($Verbose) {
        Write-Host "🐛 $Message" -ForegroundColor DarkGray
    }
}

# ─────────────────────────────────────────────────────────────────────
# Validation Functions
# ─────────────────────────────────────────────────────────────────────

function Test-CommandExists {
    param([string]$Command)
    $exists = $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
    return $exists
}

function Test-EnvFile {
    param([string]$Path)
    if (Test-Path $Path) {
        Write-Success "Found: $Path"
        return $true
    }
    else {
        Write-Warning "Not found: $Path"
        return $false
    }
}

# ─────────────────────────────────────────────────────────────────────
# E2E Test Runner
# ─────────────────────────────────────────────────────────────────────

function Invoke-E2ETest {
    Write-Banner "🎭 E2E Stress Test (Playwright)"
    
    # Verify prerequisites
    Write-Info "Checking prerequisites..."
    
    if (-not (Test-CommandExists 'npx')) {
        Write-Error "npx not found. Please install Node.js"
        exit 1
    }
    
    Write-Success "Node.js environment found"
    
    # Verify environment files
    Write-Info "Checking environment configuration..."
    Test-EnvFile "$ProjectRoot\.env.production" | Out-Null
    Test-EnvFile "$ProjectRoot\.env.local" | Out-Null
    
    # Build command
    $env:NEXT_PUBLIC_BASE_URL = $BaseUrl
    $env:STRESS_GROUP_COUNT = $GroupCount
    
    $command = @(
        'npx',
        'playwright',
        'test',
        'e2e/classroom_room_whiteboard_sync.spec.ts',
        '-g', 'Stress test',
        '--project=chromium'
    )
    
    if ($Report) {
        $command += '--reporter=html'
    }
    
    if ($Verbose) {
        $command += '--reporter=verbose'
    }
    
    Write-Info "Configuration:"
    Write-Info "  Base URL: $BaseUrl"
    Write-Info "  Groups: $GroupCount"
    Write-Info "  Runs: $Runs"
    Write-Info "  Project: $ProjectRoot`n"
    
    # Execute test
    for ($i = 1; $i -le $Runs; $i++) {
        Write-Banner "📊 Running Test $i/$Runs"
        
        try {
            Write-Info "Executing: $($command -join ' ')"
            & $command[0] @command[1..($command.Length - 1)]
            
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Test run $i completed successfully"
            }
            else {
                Write-Error "Test run $i failed with exit code $LASTEXITCODE"
                exit 1
            }
        }
        catch {
            Write-Error "Test execution failed: $_"
            exit 1
        }
        
        if ($i -lt $Runs) {
            Write-Info "Waiting 5 seconds before next run..."
            Start-Sleep -Seconds 5
        }
    }
    
    if ($Report) {
        Write-Success "HTML report generated. Opening..."
        & npx playwright show-report
    }
}

# ─────────────────────────────────────────────────────────────────────
# K6 Load Test Runner
# ─────────────────────────────────────────────────────────────────────

function Invoke-LoadTest {
    Write-Banner "📊 Load Test (k6)"
    
    # Verify k6 installation
    Write-Info "Checking prerequisites..."
    
    if (-not (Test-CommandExists 'k6')) {
        Write-Error "k6 not found. Please install k6 from https://k6.io/docs/getting-started/installation/"
        exit 1
    }
    
    Write-Success "k6 found"
    
    # Build command
    $scriptPath = "$ProjectRoot\.agents\skills\classroom-room-whiteboard-sync\scripts\production_load_test.js"
    
    if (-not (Test-Path $scriptPath)) {
        Write-Error "Load test script not found: $scriptPath"
        exit 1
    }
    
    $command = @(
        'k6',
        'run',
        '-e', "BASE_URL=$BaseUrl",
        '-e', "TEST_TYPE=$LoadType",
        '-e', "VUSER=$VirtualUsers"
    )
    
    Write-Info "Configuration:"
    Write-Info "  Base URL: $BaseUrl"
    Write-Info "  Test Type: $LoadType"
    Write-Info "  Virtual Users: $VirtualUsers"
    Write-Info "  Script: $scriptPath`n"
    
    # Warn about extended duration for stress/spike tests
    switch ($LoadType) {
        'stress' { Write-Warning "Stress test will take 3-5 minutes" }
        'spike' { Write-Warning "Spike test will take 1-2 minutes" }
        'load' { Write-Info "Load test will take 1-2 minutes" }
    }
    
    Write-Info "Executing: $($command -join ' ')`n"
    
    try {
        & $command[0] @command[1..($command.Length - 1)]
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Load test completed successfully"
        }
        else {
            Write-Error "Load test failed with exit code $LASTEXITCODE"
            exit 1
        }
    }
    catch {
        Write-Error "Test execution failed: $_"
        exit 1
    }
}

# ─────────────────────────────────────────────────────────────────────
# Main Execution
# ─────────────────────────────────────────────────────────────────────

function Main {
    Write-Banner "🚀 Production Stress Test Runner"
    
    Write-Info "Test Type: $TestType"
    Write-Info "Timestamp: $Timestamp`n"
    
    try {
        switch ($TestType) {
            'e2e' {
                Invoke-E2ETest
            }
            'load' {
                Invoke-LoadTest
            }
            default {
                Write-Error "Unknown test type: $TestType"
                exit 1
            }
        }
        
        Write-Banner "✅ All tests completed successfully!"
    }
    catch {
        Write-Error "Fatal error: $_"
        exit 1
    }
}

# Execute main function
Main
