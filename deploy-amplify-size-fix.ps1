#!/usr/bin/env pwsh
# 🚀 Amplify 部署优化 - 推送脚本
# 此脚本提交 Amplify 部署大小优化

Write-Host "=== Amplify Deployment Size Fix ===" -ForegroundColor Cyan
Write-Host ""

# 检查 git 状态
Write-Host "1. 检查修改文件..." -ForegroundColor Yellow
git status --short | Select-String -Pattern "amplify.yml|next.config|\.amplifyignore|AMPLIFY_DEPLOYMENT|BUILD_SIZE"

Write-Host ""
Write-Host "2. 暂存 Amplify 优化文件..." -ForegroundColor Yellow

# 添加 Amplify 优化相关文件
git add .amplifyignore
git add amplify.yml  
git add next.config.mjs
git add BUILD_SIZE_OPTIMIZATION.md
git add AMPLIFY_DEPLOYMENT_CHECKLIST.md

Write-Host "   ✓ .amplifyignore (排除 dev 文件夹)"
Write-Host "   ✓ amplify.yml (移除 node_modules 缓存)"
Write-Host "   ✓ next.config.mjs (禁用 source maps)"
Write-Host "   ✓ 文档和检查清单"

Write-Host ""
Write-Host "3. 显示将提交的文件..." -ForegroundColor Yellow
git diff --cached --name-only

Write-Host ""
Write-Host "4. 创建提交..." -ForegroundColor Yellow

$message = @"
build(amplify): fix deployment size limit (420MB → 150MB)

【问题】
- Amplify 构建输出超过 230MB 限制
- .next/dev 文件夹包含 1.6GB 开发调试文件
- node_modules 缓存导致部署包膨胀

【解决方案】
- 创建 .amplifyignore 排除 .next/dev 和缓存 (~1.6GB 节省)
- 移除 amplify.yml 中的 node_modules 缓存配置
- 禁用 next.config.mjs 生产环境 source maps
- 每次构建使用干净的依赖环境

【预期效果】
- 部署大小: 420MB → 150-180MB (-63% 减少)
- 构建稳定性提高
- 部署时间略增 (无缓存)

【参考】
- 详见: BUILD_SIZE_OPTIMIZATION.md
- 检查清单: AMPLIFY_DEPLOYMENT_CHECKLIST.md
"@

git commit -m $message

Write-Host ""
Write-Host "5. 提交完成！✅" -ForegroundColor Green
Write-Host ""
Write-Host "接下来执行:" -ForegroundColor Cyan
Write-Host "  git push"
Write-Host ""
Write-Host "然后监控 AWS Amplify 控制台查看部署状态"
