#!/usr/bin/env pwsh
# 🔍 Amplify 部署大小验证脚本
# 模拟 Amplify 的 postBuild 清理流程，验证最终部署大小

Write-Host @"
╔════════════════════════════════════════════════════════════════╗
║         Amplify Build Size Verification                        ║
║         (本地模拟 Amplify postBuild 清理流程)                  ║
╚════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

# 检查 .next 是否存在
if (-not (Test-Path ".next")) {
    Write-Host "❌ .next 目录不存在，请先运行 npm run build" -ForegroundColor Red
    exit 1
}

Write-Host "📊 【清理前】" -ForegroundColor Yellow
$beforeSize = (Get-ChildItem -Path ".next" -Recurse -Force | Measure-Object -Property Length -Sum).Sum
$beforeMB = [math]::Round($beforeSize / 1MB, 2)
Write-Host "   .next 总大小: $beforeMB MB"

# 统计各文件夹大小
Write-Host "`n📁 【各部分占用】" -ForegroundColor Yellow
Get-ChildItem -Path ".next" -Directory -Force | ForEach-Object {
    $folderSize = (Get-ChildItem -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $folderMB = [math]::Round($folderSize / 1MB, 2)
    Write-Host "   $($_.Name): $folderMB MB"
}

# 执行清理
Write-Host "`n🧹 【执行清理】" -ForegroundColor Green
Write-Host "   删除 .next/dev ..."
if (Test-Path ".next/dev") {
    Remove-Item -Path ".next/dev" -Recurse -Force
    Write-Host "      ✅ 已删除"
} else {
    Write-Host "      ⏭️  不存在"
}

Write-Host "   删除 .next/cache ..."
if (Test-Path ".next/cache") {
    Remove-Item -Path ".next/cache" -Recurse -Force
    Write-Host "      ✅ 已删除"
} else {
    Write-Host "      ⏭️  不存在"
}

Write-Host "   删除 .next/trace ..."
if (Test-Path ".next/trace") {
    Remove-Item -Path ".next/trace" -Force
    Write-Host "      ✅ 已删除"
} else {
    Write-Host "      ⏭️  不存在"
}

Write-Host "   删除 source maps (*.map) ..."
$mapCount = @(Get-ChildItem -Path ".next" -Include "*.map" -Recurse -Force -ErrorAction SilentlyContinue).Count
if ($mapCount -gt 0) {
    Get-ChildItem -Path ".next" -Include "*.map" -Recurse -Force | Remove-Item -Force
    Write-Host "      ✅ 已删除 $mapCount 个文件"
} else {
    Write-Host "      ⏭️  未找到"
}

# 清理后大小统计
Write-Host "`n📊 【清理后】" -ForegroundColor Yellow
$afterSize = (Get-ChildItem -Path ".next" -Recurse -Force | Measure-Object -Property Length -Sum).Sum
$afterMB = [math]::Round($afterSize / 1MB, 2)
Write-Host "   .next 总大小: $afterMB MB"

# 计算缩减百分比
$reduction = [math]::Round(($beforeSize - $afterSize) / $beforeSize * 100, 1)
Write-Host "`n📉 【最终对比】" -ForegroundColor Cyan
Write-Host "   清理前: $beforeMB MB"
Write-Host "   清理后: $afterMB MB"
Write-Host "   节省: $([math]::Round($beforeSize - $afterSize, 0)) bytes (-$reduction%)"

# Amplify 限制检查
$amplifyLimit = 230
if ($afterMB -lt $amplifyLimit) {
    Write-Host "`n✅ 【通过Amplify检查】$afterMB MB < $amplifyLimit MB (限制)" -ForegroundColor Green
} else {
    Write-Host "`n❌ 【未通过Amplify检查】$afterMB MB > $amplifyLimit MB (限制)" -ForegroundColor Red
    Write-Host "   需要进一步优化..."
}

Write-Host "`n【说明】" -ForegroundColor Gray
Write-Host "   此脚本模拟 Amplify postBuild 阶段的清理流程"
Write-Host "   实际 Amplify 部署会执行 amplify.yml 中的 postBuild 命令"
Write-Host "   清理后的文件不可恢复 - 仅用于验证，请先备份 .next"
