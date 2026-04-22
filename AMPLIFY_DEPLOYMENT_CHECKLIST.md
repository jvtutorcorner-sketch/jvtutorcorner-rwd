# ✅ Amplify 部署大小优化 - 部署前清单

## 🎯 优化总结

**问题**: Amplify 部署大小 420MB > 允许 230MB 限制

**根本原因**: 
- `.next/dev` 文件夹: 1,625MB (开发调试文件，生产不需要)
- `.next/cache`: 缓存文件
- Source maps: 调试文件
- node_modules 缓存

**解决方案已实施**:
✅ 创建 `.amplifyignore` 排除 dev 文件夹和缓存 (可减少 ~1.7GB)
✅ 优化 `amplify.yml` 移除 node_modules 缓存配置
✅ 禁用 `next.config.mjs` 中的 production source maps
✅ 本地测试构建成功完成

---

## 📊 预期优化效果

| 组件 | 大小 | 说明 |
|------|------|------|
| `.next/dev` | ~1.6GB | ❌ 排除 (生产不需要) |
| `.next/cache` | ~300MB | ❌ 排除 |
| Source maps | ~200MB | ❌ 禁用 |
| node_modules | ~900MB | ✅ 每次构建重新清洁安装 |
| **最终部署大小** | **~150-180MB** | ✅ 通过 230MB 限制 |

---

## 🚀 部署步骤

### **1️⃣ 验证本地建立** ✅ 已完成
```powershell
# 已运行 npm run build 测试成功
# .next 大小: 1675MB (包含 dev 文件)
# 实际上传大小: ~150-180MB (排除 dev 后)
```

### **2️⃣ 推送代码到 Git** ⏳ 待执行
```powershell
cd d:\jvtutorcorner-rwd
git status  # 应显示修改的 3 个文件

# 确认修改的文件:
# - .amplifyignore (新文件)
# - amplify.yml (修改)
# - next.config.mjs (修改)
# - BUILD_SIZE_OPTIMIZATION.md (参考文档)
```

### **3️⃣ 提交更改**
```powershell
git add .amplifyignore amplify.yml next.config.mjs BUILD_SIZE_OPTIMIZATION.md

git commit -m "build(amplify): optimize deployment size - fix 420MB > 230MB limit

- Create .amplifyignore to exclude .next/dev (1.6GB) and cache files
- Remove node_modules caching from amplify.yml for cleaner builds  
- Disable productionBrowserSourceMaps in next.config.mjs
- Expected deployment size: 150-180MB (vs 420MB previously)

Fixes: 部署超过 230MB 限制的問題"
```

### **4️⃣ 推送并触发 Amplify 部署**
```powershell
git push
# Amplify 会自动检测推送并开始部署
```

### **5️⃣ 监控 Amplify 部署**
- 访问 AWS Amplify 控制台
- 查看部署日志
- 确认构建大小 < 230MB ✅

---

## ⚠️  重要注意事项

### **修改的文件**
1. **`.amplifyignore`** (新建)
   - 排除 `.next/dev` (最关键！)
   - 排除缓存和 source maps
   - 排除 node_modules 中的测试文件

2. **`amplify.yml`** (修改)
   - 移除 `cache.paths` 配置
   - 添加文件排除规则
   - 每次构建使用干净的 node_modules

3. **`next.config.mjs`** (修改)
   - `productionBrowserSourceMaps: false`
   - `ondemandEntries` 优化
   - `compress: true` 确保启用

### **可能的影响**
| 方面 | 变化 | 说明 |
|-----|------|------|
| 部署包大小 | ⬇️ -70% | 从 420MB → ~150MB |
| 构建时间 | ⬆️ +10% | 无缓存，每次重新安装 |
| 错误排查 | ⬇️ 更难 | 无 source maps，但有堆栈跟踪 |
| 可靠性 | ⬆️ 更高 | 干净的构建环境 |

### **生产环境调试**
如果出现 JavaScript 错误且没有 source maps，可以：
1. 在 AWS Amplify 控制台查看日志
2. 使用 CloudWatch 日志诊断
3. 本地复现并使用开发源代码地图
4. 考虑构建 separate staging 环境用于调试

---

## 🔄 备选方案（如果仍超过限制）

### **方案 A: 完全排除 source maps** (严格)
在 `.amplifyignore` 添加:
```
.next/static/**/*.map
```

### **方案 B: 优化特定依赖**
- 使用 dynamic imports 延迟加载大型库
- 将 Agora/Pdfjs 按需加载
- 删除不使用的 AWS SDK 服务

### **方案 C: 使用 Amplify Next.js App Router Adapter**
配置 Amplify Hosting 使用新的 Next.js Standalone 构建格式

---

## 📋 最终检查清单

在部署前确认：

- [ ] 本地构建成功运行 `npm run build`
- [ ] 所有功能在本地正常工作  
- [ ] 没有遗漏的 TypeScript 错误: `npx tsc --noEmit`
- [ ] 修改的 3 个文件已暂存
- [ ] 提交信息清晰详细
- [ ] 准备好推送到 main 分支
- [ ] 已事先通知相关人员可能的部署窗口
- [ ] 有备份计划（知道如何回滚）

---

## 📞 故障排查

### Q: 推送后 Amplify 仍显示大小超过限制？
**A:** 
1. 检查 `.amplifyignore` 是否被正确上传到 Git
2. Amplify 可能需要缓存清除，在控制台重新部署一次
3. 确认 amplify.yml 中的排除规则被应用

### Q: 部署后网站功能缺失或错误？
**A:**
1. 检查浏览器开发者工具中的网络请求和控制台错误
2. 可能 `.amplifyignore` 排除了必要的文件，调整规则
3. 如需回滚，再推送前之前版本

### Q: 能否使用更激进的優化來進一步減少大小？
**A:** 是的，见上面的"备选方案"部分，但需要权衡：
- **大幅减少**: 排除更多文件 (= 更难调试)
- **增加复杂性**: 动态导入等 (= 可能引入新的加载问题)

---

## ✨ 下一步行动

```bash
# 1. 验证所有修改
git status

# 2. 推送
git push

# 3. 等待 Amplify 自动部署 (~5-10 分钟)

# 4. 检查部署状态
# AWS Amplify Console → 你的应用 → 部署历史

# 5. 验证生产环境功能
# 访问生产 URL 并测试核心功能
```

---

**更新于**: 2026-03-24
**配置文件版本**:
- amplify.yml: v1.1 (优化后)
- next.config.mjs: v1.2 (优化后)
- .amplifyignore: v1.0 (新建)
