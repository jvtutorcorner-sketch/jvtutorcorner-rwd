#!/usr/bin/env pwsh
# k6/run.ps1
# JVTutorCorner k6 效能測試執行器
# 執行：.\k6\run.ps1 [smoke|auth|hmac|points|courses|enroll|stress|spike|soak|all]

param(
    [string]$Test = "smoke",
    [string]$BaseUrl = "http://localhost:3000",
    [string]$HmacSecret = "jv_hmac_secret_change_in_production_2024",
    [string]$StudentEmail = "pro@test.com",
    [string]$StudentPassword = "123456",
    [string]$TeacherEmail = "lin@test.com",
    [string]$TeacherPassword = "123456",
    [string]$AdminEmail = "admin@jvtutorcorner.com",
    [string]$AdminPassword = "123456",
    [string]$CaptchaBypass = "jv_secret_bypass_2024",
    [string]$OutputDir = "k6\reports"
)

$ErrorActionPreference = "Stop"

# ─── 確認 k6 已安裝 ────────────────────────────────────
if (-not (Get-Command k6 -ErrorAction SilentlyContinue)) {
    Write-Error @"
k6 未安裝！請先安裝：
  Windows (winget): winget install k6 --source winget
  Windows (choco):  choco install k6
  Windows (手動):   https://dl.k6.io/msi/k6-latest-amd64.msi
"@
    exit 1
}

# ─── 建立輸出目錄 ──────────────────────────────────────
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$reportDir = Join-Path $OutputDir $timestamp
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

# ─── 共用環境變數 ─────────────────────────────────────
$envVars = @(
    "-e", "BASE_URL=$BaseUrl",
    "-e", "API_HMAC_SECRET=$HmacSecret",
    "-e", "STUDENT_EMAIL=$StudentEmail",
    "-e", "STUDENT_PASSWORD=$StudentPassword",
    "-e", "TEACHER_EMAIL=$TeacherEmail",
    "-e", "TEACHER_PASSWORD=$TeacherPassword",
    "-e", "ADMIN_EMAIL=$AdminEmail",
    "-e", "ADMIN_PASSWORD=$AdminPassword",
    "-e", "CAPTCHA_BYPASS=$CaptchaBypass"
)

# ─── 測試對應表 ────────────────────────────────────────
$tests = @{
    smoke   = "k6/tests/07_smoke_test.test.js"
    auth    = "k6/tests/01_auth_flow.test.js"
    hmac    = "k6/tests/02_hmac_auth.test.js"
    points  = "k6/tests/03_points_api.test.js"
    courses = "k6/tests/04_courses_api.test.js"
    enroll  = "k6/tests/06_enroll_flow.test.js"
    stress  = "k6/tests/05_stress_test.test.js"
    spike   = "k6/tests/05_stress_test.test.js"
    soak    = "k6/tests/05_stress_test.test.js"
}

function Run-K6Test {
    param([string]$Name, [string]$Script, [string[]]$ExtraArgs = @())

    $reportFile = Join-Path $reportDir "$Name.json"
    $summaryFile = Join-Path $reportDir "$Name-summary.txt"

    Write-Host ""
    Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  執行：$Name" -ForegroundColor Cyan
    Write-Host "  Script: $Script" -ForegroundColor Gray
    Write-Host "  Report: $reportFile" -ForegroundColor Gray
    Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan

    $k6Args = @("run") + $envVars + $ExtraArgs + @(
        "--out", "json=$reportFile",
        "--summary-export", $summaryFile,
        $Script
    )

    & k6 @k6Args
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 0) {
        Write-Host "✅ $Name: PASSED" -ForegroundColor Green
    } else {
        Write-Host "❌ $Name: FAILED (exit=$exitCode)" -ForegroundColor Red
    }
    return $exitCode
}

# ─── 執行測試 ─────────────────────────────────────────
$results = @{}

if ($Test -eq "all") {
    Write-Host "🚀 執行全部測試套件..." -ForegroundColor Yellow
    @("smoke", "auth", "hmac", "points", "courses", "enroll") | ForEach-Object {
        $results[$_] = Run-K6Test -Name $_ -Script $tests[$_]
    }
} elseif ($Test -eq "spike" -or $Test -eq "soak" -or $Test -eq "stress") {
    $results[$Test] = Run-K6Test -Name $Test -Script $tests[$Test] `
        -ExtraArgs @("-e", "SCENARIO=$Test")
} elseif ($tests.ContainsKey($Test)) {
    $results[$Test] = Run-K6Test -Name $Test -Script $tests[$Test]
} else {
    Write-Error "未知測試：$Test。可用選項：smoke, auth, hmac, points, courses, enroll, stress, spike, soak, all"
    exit 1
}

# ─── 匯總結果 ─────────────────────────────────────────
Write-Host ""
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  測試結果匯總" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan

$allPassed = $true
foreach ($name in $results.Keys) {
    if ($results[$name] -eq 0) {
        Write-Host "  ✅ $name" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $name" -ForegroundColor Red
        $allPassed = $false
    }
}

Write-Host ""
Write-Host "  報告目錄：$reportDir" -ForegroundColor Gray

if ($allPassed) {
    Write-Host "  🎉 全部通過！" -ForegroundColor Green
    exit 0
} else {
    Write-Host "  ⚠️  有測試失敗，請查看 $reportDir" -ForegroundColor Red
    exit 1
}
