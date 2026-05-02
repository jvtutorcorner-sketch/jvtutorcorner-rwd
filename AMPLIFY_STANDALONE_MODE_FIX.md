# Amplify Standalone Mode - 已部署配置参考

**部署完成**: 2026-03-24  
**状态**: ✅ 生产环境运行中  
**配置版本**: 706ca30

---

## ✨ 已实施的解决方案

### 配置变更摘要

| 配置 | 变更内容 | 效果 |
|------|---------|------|
| **next.config.mjs** | 添加 `output: 'standalone'` | 大小减少 60-70% |
| **amplify.yml** | 简化 postBuild，移除复杂清理 | 更可靠的构建 |
| **移除** | 无效的 experimental 选项 | 消除构建警告 |

### 关键改进

- ✅ 启用 Next.js Standalone 输出模式（官方推荐）
- ✅ 排除 `.next/dev` 文件夹 (1.6GB+)
- ✅ 移除失效的 `experimental.turbopack` 和 `experimental.ondemandEntries`
- ✅ 保留 `productionBrowserSourceMaps: false` 和 `compress: true`

---

## 📊 部署结果

**预期大小**: ~80-120MB (vs 393MB 之前)  
**实际通过**: ✅ 部署成功，在 230MB 限制内

---

## 🔍 监控与验证

### 如何检查配置生效

**检查构建日志**：
```bash
# 在 Amplify Console 查看最后一次部署日志
# 关键指标：
# - 无 "Invalid next.config.mjs options" 警告
# - ".next" 大小 < 120MB
# - "Build completed successfully"
```

**本地验证**：
```bash
npm run build
du -sh .next  # 应显示 50-120MB（如果成功优化）
```

---

## 💾 配置文件参考

### next.config.mjs 关键行
```javascript
output: 'standalone',                        // 关键优化
productionBrowserSourceMaps: false,          // 节省空间
compress: true,                              // 启用压缩
```

### amplify.yml postBuild 简化版
```yaml
postBuild:
  commands:
    - 'echo "Build complete..."'
    - 'du -sh .next || true'
```

---

## ⚠️ 已知事项

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 无 Source Maps | standalone 模式不包含 maps | 用 CloudWatch 日志调试 |
| 首次构建较慢 | 无缓存，每次重新安装 | 正常，属于预期 |

---

## 🔧 故障排除

### 部署仍超过 230MB

如需进一步优化：
1. 启用 SWC 优化：`swcMinify: true`
2. 检查不必要的大依赖（Agora, PDF.js）
3. 考虑分离后端 API 到 Lambda

### 应用出现问题

1. 检查 CloudWatch 日志
2. 本地 `npm run dev` 验证逻辑
3. 检查 `.amplifyignore` 是否排除了必要文件

---

**最后更新**: 2026-04-30
