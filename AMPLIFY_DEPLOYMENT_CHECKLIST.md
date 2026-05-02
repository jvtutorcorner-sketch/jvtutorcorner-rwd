# ✅ Amplify 部署配置参考

**部署大小优化已完成** (2026-03-24 完成，配置已生效)
- 已启用 standalone 模式在 `next.config.mjs`
- `.amplifyignore` 已配置排除 dev 文件和缓存
- 部署大小维持在 230MB 限制以下

---

## 📋 关键配置

### 生效的优化

| 配置文件 | 优化内容 | 效果 |
|----------|---------|------|
| `next.config.mjs` | `output: 'standalone'` | 减少 70% 部署大小 |
| `.amplifyignore` | 排除 `.next/dev`, 缓存, 测试文件 | 除外不必要文件 |
| `amplify.yml` | 清洁构建，无缓存 | 每次独立构建 |

### 配置说明
- **`.amplifyignore`**: 排除开发文件和缓存（1.6GB+ 的 dev 文件夹）
- **`amplify.yml`**: postBuild 只做验证，实际大小优化由 standalone 模式处理
- **`next.config.mjs`**: `productionBrowserSourceMaps: false`, `output: 'standalone'`

---

## 🔧 故障排查

### 部署大小超过限制
1. 检查 `.amplifyignore` 是否在 Git 中
2. 确认 `next.config.mjs` 中 `output: 'standalone'` 已设置
3. 在 Amplify Console 手动重新部署

### 应用功能缺失
1. 检查浏览器控制台错误
2. 验证必要的静态文件未被排除 (如 public/ 下的资源)
3. 查看 CloudWatch 日志诊断

### Source Maps 缺失导致调试困难
- 生产环境无 source maps，使用堆栈跟踪和 CloudWatch 日志
- 本地开发时使用 npm run dev 获得完整调试信息

---

**最后更新**: 2026-04-30
