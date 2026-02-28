# 教师审核功能测试指南

## 🔧 最新改进

### 1. 修复核准后数据更新问题

**改进内容**：
- ✅ 移除重复的 `pendingChanges` 变量声明
- ✅ 添加 `updatedAt` 时间戳更新
- ✅ 添加详细的日志输出便于调试
- ✅ 返回更新后的完整教师数据

### 2. 改进点详解

#### 问题 1: 重复声明导致作用域混淆
```typescript
// ❌ 旧代码（有问题）
const pendingChanges = teacher.pendingProfileChanges || {};  // 第一次声明
// ... 中间代码
const pendingChanges = teacher.pendingProfileChanges || {};  // 重复声明！
```

```typescript
// ✅ 新代码（已修复）
const pendingChanges = teacher.pendingProfileChanges || {};  // 只声明一次
// 所有后续代码使用同一个变量
```

#### 问题 2: 缺少更新时间戳
```typescript
// ❌ 旧代码
updateExpression.push(`#status = :status`);

// ✅ 新代码
updateExpression.push(`#status = :status`);
updateExpression.push(`#updatedAt = :updatedAt`);  // 新增时间戳
expressionAttributeValues[':updatedAt'] = reviewedAt;
```

#### 问题 3: 缺少调试日志
```typescript
// ✅ 新增详细日志
console.log('[teacher-reviews] Approving changes for teacher:', id);
console.log('[teacher-reviews] Pending changes:', pendingChanges);
console.log('[teacher-reviews] Update expression:', updateExpString);
console.log('[teacher-reviews] Update successful, new teacher data:', updateResult.Attributes);
```

## 📝 手动测试步骤

### 准备测试数据

1. **确保有待审核数据**：
```bash
node scripts/init-teacher-review-sample-data.mjs
```

2. **启动开发服务器**：
```bash
npm run dev
```

### 测试流程

#### 步骤 1: 查看待审核列表
1. 访问：`http://localhost:3000/admin/teacher-reviews`
2. 应该看到 4-6 个待审核申请

#### 步骤 2: 记录原始数据
选择一个教师（例如：张老师），记录：
- ✏️ 原始名称
- ✏️ 原始科目
- ✏️ 原始语言
- ✏️ 原始介绍

#### 步骤 3: 记录变更请求
在右侧"申请修改为"栏位记录：
- ✏️ 新名称
- ✏️ 新科目
- ✏️ 新语言
- ✏️ 新介绍

#### 步骤 4: 核准变更
1. 点击"核准 (Approve)"按钮
2. 确认操作
3. 等待处理完成

#### 步骤 5: 验证数据更新
打开浏览器开发者工具（F12）查看控制台日志：

```
✅ 应该看到：
[teacher-reviews] Approving changes for teacher: teacher-review-001
[teacher-reviews] Pending changes: { name: "張大明老師", ... }
[teacher-reviews] Will update name to: 張大明老師
[teacher-reviews] Will update subjects to: ["數學", "物理"]
[teacher-reviews] Update expression: SET #name = :name, #subjects = :subjects, ...
[teacher-reviews] Update successful, new teacher data: { ... }
[teacher-reviews] Review record saved to audit trail
```

#### 步骤 6: 验证 DynamoDB 数据

**方法 A: 使用 AWS CLI**
```bash
aws dynamodb get-item \
  --table-name jvtutorcorner-teachers \
  --key '{"id":{"S":"teacher-review-001"}}' \
  --region ap-northeast-1
```

**方法 B: 创建验证脚本**
```bash
node scripts/verify-teacher-data.mjs teacher-review-001
```

#### 步骤 7: 验证审核记录
```bash
# 查询审核历史
curl "http://localhost:3000/api/admin/teacher-reviews/history?teacherId=teacher-review-001"
```

### 验证清单

- [ ] **状态更新**：`profileReviewStatus` = `"APPROVED"`
- [ ] **清除待审核**：`pendingProfileChanges` 不存在
- [ ] **名称更新**：`name` 字段已更新为新值
- [ ] **科目更新**：`subjects` 数组已更新为新值
- [ ] **语言更新**：`languages` 数组已更新为新值
- [ ] **介绍更新**：`intro` 字段已更新为新值
- [ ] **时间戳**：`updatedAt` 已更新为审核时间
- [ ] **审核记录**：在 `jvtutorcorner-teacher-reviews` 表中创建了记录

## 🐛 故障排除

### 问题 1: 字段未更新

**症状**：核准后某些字段没有更新

**检查**：
1. 查看控制台日志是否有错误
2. 确认 `pendingProfileChanges` 包含该字段
3. 检查 DynamoDB 更新表达式

**解决方案**：
```typescript
// 确保字段名不是保留字
expressionAttributeNames[`#${key}`] = key;
```

### 问题 2: 数组字段未正确更新

**症状**：`subjects` 或 `languages` 未更新

**原因**：DynamoDB 需要完整的数组值

**验证**：
```javascript
console.log('Array value type:', Array.isArray(pendingChanges.subjects));
console.log('Array value:', pendingChanges.subjects);
```

### 问题 3: 审核记录未创建

**检查**：
1. 环境变量 `DYNAMODB_TABLE_TEACHER_REVIEWS` 是否设置
2. 表是否存在
3. AWS 权限是否正确

**创建表**：
```bash
node scripts/setup-teacher-reviews-table.mjs
```

## 📊 预期结果示例

### 核准前（teachers 表）
```json
{
  "id": "teacher-review-001",
  "name": "張老師",
  "subjects": ["數學"],
  "languages": ["中文"],
  "intro": "我是一位專業的數學老師。",
  "profileReviewStatus": "PENDING",
  "pendingProfileChanges": {
    "name": "張大明老師",
    "subjects": ["數學", "物理"],
    "languages": ["中文", "英文"],
    "intro": "我是一位專業的數學和物理老師。",
    "requestedAt": "2026-03-01T10:00:00Z"
  }
}
```

### 核准后（teachers 表）
```json
{
  "id": "teacher-review-001",
  "name": "張大明老師",          // ✅ 已更新
  "subjects": ["數學", "物理"],   // ✅ 已更新
  "languages": ["中文", "英文"],  // ✅ 已更新
  "intro": "我是一位專業的數學和物理老師。",  // ✅ 已更新
  "profileReviewStatus": "APPROVED",           // ✅ 已更新
  "updatedAt": "2026-03-01T11:30:00Z"          // ✅ 已更新
  // ✅ pendingProfileChanges 已移除
}
```

### 审核记录（teacher-reviews 表）
```json
{
  "id": "review-uuid-123",
  "teacherId": "teacher-review-001",
  "teacherName": "張老師",
  "action": "approve",
  "reviewedBy": "admin@jvtutorcorner.com",
  "reviewedAt": "2026-03-01T11:30:00Z",
  "requestedAt": "2026-03-01T10:00:00Z",
  "originalData": {
    "name": "張老師",
    "subjects": ["數學"],
    "languages": ["中文"],
    "intro": "我是一位專業的數學老師。"
  },
  "requestedChanges": {
    "name": "張大明老師",
    "subjects": ["數學", "物理"],
    "languages": ["中文", "英文"],
    "intro": "我是一位專業的數學和物理老師。"
  },
  "notes": "Profile changes approved and applied"
}
```

## ✅ 成功标志

1. ✅ 教师 profile 中所有变更字段都已正确更新
2. ✅ `profileReviewStatus` 变为 `"APPROVED"`
3. ✅ `pendingProfileChanges` 已被移除
4. ✅ `updatedAt` 时间戳已更新
5. ✅ 审核记录已保存到 `teacher-reviews` 表
6. ✅ 控制台日志显示完整的更新过程
7. ✅ 页面上该教师不再显示在待审核列表

## 🎯 下一步

- 测试驳回（reject）功能是否也正确更新时间戳
- 验证审核历史查询 API
- 测试批量审核场景
- 添加更多字段的审核支持
