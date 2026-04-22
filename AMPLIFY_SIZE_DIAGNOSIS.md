# Amplify 部署大小问題 - 診斷與解決方案

## 🔴 當前問題 

**Amplify 部署失敗**
```
部署包大小: 420MB
允許限制: 230MB
超出: 190MB (+82%)
```

**根本原因分析**
```
.next 目錄大小: 1,675MB
├─ .next/dev/        (~1,625MB) ⚠️ Turbopack 開發伺服器緩存 → 1.6GB SST 文件
├─ .next/server/     (~42MB)    ✅ 必要（實際應用邏輯）
├─ .next/static/     (~4MB)     ✅ 必要（靜態資源）
├─ .next/cache/      (~2.8MB)   ⚠️ 緩存文件
└─ .next/build/      (~0.7MB)   ⚠️ 構建文件
```

**為什麼仍然失敗？**
1. ❌ `.amplifyignore` 不是官方功能，無法排除文件
2. ❌ `amplify.yml` artifacts.files 中的 `!dev/**` 語法可能不被支持
3. ⚠️ postBuild 階段刪除失敗，可能因文件被鎖定
4. ⚠️ Next.js Turbopack 在構建後重新生成緩存

---

## ✅ 已採取的行動

### 1. 修復 YAML 語法錯誤 ✅
- 所有包含冒號的 echo 命令用單引號包裝
- 防止 Amplify buildspec 解析失敗

### 2. 配置 artifacts.files 排除 ✅
```yaml
artifacts:
  files:
    - '**/*'
    - '!dev/**'          # 排除 Turbopack 開發緩存
    - '!cache/**'        # 排除緩存
    - '!**/*.map'        # 排除 source maps
    - '!**/*.test.*'     # 排除測試文件
    - '!**/*.spec.*'     # 排除 spec 文件
```

### 3. 禁用 Turbopack 緩存 ✅
```javascript
// next.config.mjs
experimental: {
  turbopack: process.env.CI ? { 
    cacheDir: false,
    globalPassthrough: false,
  } : undefined,
}
```

### 4. postBuild 清理多次 ✅
- 執行多次 `rm -rf .next/dev` 防止重新生成
- 刪除 source maps 和測試文件

---

## 🚀 預期效果 (如果 artifacts 排除生效)

| 組件 | 大小 | 狀態 | 說明 |
|------|------|------|------|
| `.next/dev` | 1,625MB | ❌ 不上傳 | Turbopack 緩存 SST 文件 |
| `.next/cache` | 2.8MB | ❌ 不上傳 | 構建緩存 |
| `.next/server` | 42MB | ✅ 上傳 | 實際應用邏輯 |
| `.next/static` | 4MB | ✅ 上傳 | 靜態資源 |
| **總計** | **~50MB** | ✅ 通過 | 遠低於 230MB 限制 |

---

## 🔧 如果仍然失敗，備選方案

### 方案 A: 使用 Standalone 構建模式 (推薦)
在 `next.config.mjs` 中啟用：
```javascript
output: 'standalone',  // 只打包必要的文件
```

這會將 `.next` 減少到 ~50-80MB

### 方案 B: 禁用靜態生成
如果某些頁面不需要預生成，在 `next.config.mjs` 中：
```javascript
staticPageGenerationTimeout: 0,  // 跳過 ISR
```

### 方案 C: 在 buildspec 中完全重建
```yaml
postBuild:
  commands:
    - rm -rf .next
    - npm run build
    - rm -rf .next/dev .next/cache
```

### 方案 D: 考慮分離前後端
- 後端 API 部署到 Lambda
- 前端靜態資源部署到 CloudFront
- 減少 Amplify 打包大小

---

## 📋 檢查清單

- [x] 修復 YAML 語法 ✅
- [ ] 等待 Amplify 新一輪部署
- [ ] 檢查部署日誌是否有新的錯誤
- [ ] 確認 artifacts.files 排除規則是否生效
- [ ] 如果仍失敗，考慮上述備選方案

---

## 🎯 下一步行動

1. **觀察 Amplify 構建日誌**
   - 檢查 postBuild 是否正常執行
   - 確認最終部署包大小
   - 查看是否有新的錯誤訊息

2. **如果部署成功**
   ✅ 部署完成，可開始功能測試

3. **如果仍然失敗**
   - 嘗試方案 A (standalone 模式)
   - 或考慮聯繫 AWS Amplify 支援

---

## 📝 相關配置文件

- **amplify.yml**: 構建、清理和打包配置
- **next.config.mjs**: Next.js 優化配置
- **BUILD_SIZE_OPTIMIZATION.md**: 詳細優化指南
- **AMPLIFY_DEPLOYMENT_CHECKLIST.md**: 部署檢查清單

---

**最後更新**: 2026-03-25
**修復版本**: a908a9f (YAML 語法修正)
