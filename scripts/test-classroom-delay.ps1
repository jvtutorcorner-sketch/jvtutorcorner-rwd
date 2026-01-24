#!/usr/bin/env pwsh

# Playwright 多客戶端延遲測試 - 快速啟動腳本

Write-Host "
╔══════════════════════════════════════════════════════════════╗
║   🧪 Classroom 白板同步延遲測試 - Playwright              ║
║   場景: Teacher + Student 跨客戶端同步                      ║
╚══════════════════════════════════════════════════════════════╝
" -ForegroundColor Cyan

# 檢查依賴
Write-Host "`n📦 檢查環境..." -ForegroundColor Yellow

# 檢查 Node 版本
$nodeVersion = node --version 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ 未找到 Node.js，請先安裝" -ForegroundColor Red
  exit 1
}
Write-Host "✓ Node.js: $nodeVersion" -ForegroundColor Green

# 檢查 npm 套件
$packages = @('playwright', '@playwright/test')
foreach ($pkg in $packages) {
  $result = npm list $pkg 2>$null | Select-String "^"
  if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ $pkg 已安裝" -ForegroundColor Green
  } else {
    Write-Host "⚠️  $pkg 未安裝，正在安裝..." -ForegroundColor Yellow
    npm install --save-dev $pkg
  }
}

# 確認前端是否運行
Write-Host "`n🚀 檢查前端伺服器..." -ForegroundColor Yellow
$maxRetries = 5
$retryCount = 0
$isRunning = $false

do {
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 2 -ErrorAction Stop
    $isRunning = $true
    Write-Host "✓ 前端已運行於 http://localhost:3000" -ForegroundColor Green
  } catch {
    $retryCount++
    if ($retryCount -lt $maxRetries) {
      Write-Host "⏳ 等待前端啟動... ($retryCount/$maxRetries)" -ForegroundColor Yellow
      Start-Sleep -Seconds 2
    } else {
      Write-Host "❌ 前端未在 3 秒內啟動" -ForegroundColor Red
      Write-Host "💡 請先在另一個終端運行: npm run dev" -ForegroundColor Cyan
      exit 1
    }
  }
} while (-not $isRunning -and $retryCount -lt $maxRetries)

# 運行測試
Write-Host "`n🧪 開始執行 Playwright 測試..." -ForegroundColor Cyan
Write-Host "測試位置: e2e/classroom-delay-sync.spec.ts" -ForegroundColor Gray
Write-Host ""

# 運行方式選擇
Write-Host "選擇運行模式:" -ForegroundColor Yellow
Write-Host "  1. 無頭模式 (快速)"
Write-Host "  2. 有 UI 顯示 (便於觀察)"
Write-Host "  3. 調試模式 (最詳細)"
Write-Host ""

$choice = Read-Host "請選擇 (1-3) [預設: 2]"
if ([string]::IsNullOrEmpty($choice)) { $choice = "2" }

$testArgs = @('test', 'e2e/classroom-delay-sync.spec.ts')

switch ($choice) {
  "1" {
    Write-Host "🚀 以無頭模式運行..." -ForegroundColor Green
    & npx playwright test e2e/classroom-delay-sync.spec.ts
  }
  "2" {
    Write-Host "🚀 以有 UI 模式運行（推薦用於觀察）..." -ForegroundColor Green
    & npx playwright test e2e/classroom-delay-sync.spec.ts --headed --workers=1
  }
  "3" {
    Write-Host "🚀 以調試模式運行..." -ForegroundColor Green
    & npx playwright test e2e/classroom-delay-sync.spec.ts --headed --workers=1 --debug
  }
  default {
    Write-Host "❌ 無效的選擇" -ForegroundColor Red
    exit 1
  }
}

$testExit = $LASTEXITCODE

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
if ($testExit -eq 0) {
  Write-Host "║  ✅ 測試通過！                                              ║" -ForegroundColor Green
} else {
  Write-Host "║  ❌ 測試失敗或出現異常                                      ║" -ForegroundColor Red
}
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

Write-Host ""
Write-Host "📊 測試結果可在以下位置查看:" -ForegroundColor Yellow
Write-Host "   • 報告: test-results/index.html" -ForegroundColor Gray
Write-Host "   • 截圖: test-results/classroom-delay-sync.spec.ts*" -ForegroundColor Gray
Write-Host "   • 影片: test-results/*/*.webm" -ForegroundColor Gray
Write-Host ""

Write-Host "💡 後續操作:" -ForegroundColor Cyan
Write-Host "   • 查看詳細日誌: Open-Item test-results/index.html" -ForegroundColor Gray
Write-Host "   • 重新運行: npx playwright test e2e/classroom-delay-sync.spec.ts --headed" -ForegroundColor Gray
Write-Host "   • 查看一個測試: npx playwright test e2e/classroom-delay-sync.spec.ts -g '正常同步'" -ForegroundColor Gray
Write-Host ""

exit $testExit
