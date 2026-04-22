# Amplify 部署大小优化指南

## 🔴 问题诊断

**当前状态：** 构建输出 420MB > Amplify 限制 230MB

**根本原因：**
1. `.next` 目录包含缓存文件和 source maps (~2.1GB)
2. `amplify.yml` 正在缓存整个 `node_modules` 目录
3. 不必要的文件被上传到 Amplify

---

## ✅ 已实施的修复

### 1. **创建 `.amplifyignore` 文件**
- 排除 `.next` 中的缓存、trace 和 source maps
- 排除 node_modules 中的测试、文档和开发文件
- 排除不必要的资源（日志、图片、测试脚本等）

### 2. **优化 `amplify.yml`**
- ❌ 移除了 `cache.paths.node_modules/**/*` 配置
- ✅ 添加了文件排除规则（source maps、cache、trace）
- 每次构建会重新安装 node_modules（更清洁、更可靠）

---

## 🚀 后续优化步骤

### **步骤 1：本地清理**
```powershell
# 清除旧的构建和缓存
rm -r .next -Force
rm -r node_modules -Force
rm package-lock.json

# 重新安装依赖（使用 --legacy-peer-deps 如果有冲突）
npm ci
```

### **步骤 2：优化 Next.js 配置** 
在 `next.config.mjs` 中添加：
```javascript
const nextConfig = {
  // ... 现有配置 ...
  
  // ★ 禁用 source maps 以减少大小 ★
  productionBrowserSourceMaps: false,
  
  // ★ 启用构建缓存清理 ★
  ondemandEntries: {
    maxInactiveAge: 15 * 1000,
    pagesBufferLength: 2,
  },
};
```

### **步骤 3：本地测试构建**
```powershell
npm run build

# 查看构建大小
$size = (Get-ChildItem .next -Recurse | Measure-Object -Property Length -Sum).Sum
Write-Host ".next size: $([math]::Round($size / 1MB, 2)) MB"
```

### **步骤 4：推送并部署**
```powershell
git add .amplifyignore amplify.yml next.config.mjs
git commit -m "build: optimize Amplify deployment size

- Add .amplifyignore to exclude build cache and node_modules artifacts
- Remove node_modules caching from amplify.yml for cleaner builds
- Disable production source maps to reduce build output
- Exclude test files and documentation from deployment"

git push
# Amplify 会自动重新部署
```

---

## 📊 预期改进

| 项目 | 前 | 后 | 备注 |
|------|-----|------|------|
| 部署包大小 | 420MB | ~150-180MB | 排除缓存和 source maps |
| 构建时间 | 部分缓存 | 稍长 | 更稳定，无缓存问题 |
| 部署可靠性 | 中 | 高 | 每次构建都是干净的 |

---

## 🔧 如果仍然超过限制，进一步优化：

### **选项 A：排除源代码**
在 `.amplifyignore` 中添加：
```
# 如果不需要在运行时访问原始源代码
**/*.ts
!**/*.d.ts
```

### **选项 B：优化大型依赖**
- **pdfjs-dist**: 只有需要 PDF 查看时才安装
- **@aws-sdk**: 考虑使用 AWS Lambda@Edge 减少客户端代码
- **agora-sdk**: 检查是否可以延迟加载

### **选项 C：启用 Next.js 静态优化**
```javascript
// next.config.mjs
const nextConfig = {
  swcMinify: true,  // 启用 SWC 最小化（已默认）
  compress: true,   // 启用 gzip 压缩
  poweredByHeader: false,
};
```

### **选项 D：检查动态导入**
确保大型库使用动态导入：
```typescript
// 不好
import pdfjs from 'pdfjs-dist';

// 好
const pdfjs = await import('pdfjs-dist');
// 或使用 Next.js dynamic import
import dynamic from 'next/dynamic';
```

---

## 📋 验证清单

- [ ] 已创建 `.amplifyignore` 文件
- [ ] 已更新 `amplify.yml` 移除 node_modules 缓存
- [ ] 本地运行 `npm run build` 测试成功
- [ ] `.next` 大小 < 200MB
- [ ] 推送代码到 Git
- [ ] Amplify 部署成功（< 230MB）

---

## 🐛 故障排查

**Q: 部署后某些功能不工作？**
A: 检查 `.amplifyignore` 是否错误排除了必要的文件。调整规则并重新部署。

**Q: 构建时间变长？**
A: 这是正常的。移除缓存意味着每次都要重新安装。这更稳定，但速度慢一些。

**Q: 仍然超过 230MB？**
A: 检查是否有大型资源文件（图片、视频）在 `public/` 或使用下列选项。

---

## 参考资源

- [Amplify CLI 文档](https://docs.amplify.aws/cli/)
- [.amplifyignore 用法](https://docs.amplify.aws/cli/reference/files/)
- [Next.js 构建优化](https://nextjs.org/docs/advanced-features/output-file-tracing)
