# Amplify 部署 - Workflow 功能参考

**部署完成**: 2026-03-31  
**状态**: ✅ 已在生产环境运行  
**功能**: JavaScript 脚本执行

---

## 📊 环境配置参考

### 可选的环境变数 (使用预设值)

```
SCRIPT_EXECUTION_TIMEOUT_MS = 3000        # JS 超时（毫秒）
SCRIPT_COMPILE_TIMEOUT_MS = 1000          # JS 编译超时（毫秒）
SCRIPT_MEMORY_LIMIT_MB = 128              # JS 内存上限（MB）
DEBUG_AMPLIFY_CHECK = false               # 诊断日志
```

---

---

## ✨ 已完成的改进 (2026-03-31)

### JavaScript 节点类型重构

**变更**:
- 节点类型从通用 `'action'` 改为专属 `'javascript'`
- UI 显示蓝色主题，标记 Node.js 18+, 3000ms 超时
- 添加初始化脚本示例

**相关文件**:
- `components/workflows/WorkflowCanvas.tsx` - 节点定义
- `components/workflows/WorkflowConfigSidebar.tsx` - UI 配置
- `lib/workflowEngine.ts` - 执行类型列表

---

## 🧪 验证方式

### 本地测试

```bash
# 检查相容性
DEBUG_AMPLIFY_CHECK=true npm run dev
curl http://localhost:3000/api/workflows/check-compatibility
```

### 生产验证 (Amplify 部署后)

```bash
# 检查相容性端点
curl https://<amplify-url>/api/workflows/check-compatibility
```

---

## ⚠️ 常见问题

| 问题 | 检查项 | 解决方案 |
|------|--------|--------|
| 环境检测失败 | `isolated-vm` 依赖 | 确认 package.json 中已包含 |

---

## 📚 相关文件

- Components: `WorkflowCanvas.tsx`, `WorkflowConfigSidebar.tsx`
- Engine: `lib/workflowEngine.ts`

---

**最后更新**: 2026-04-30
