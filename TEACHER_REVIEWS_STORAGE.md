# 教师审核系统 - DynamoDB 存储文档

## 概述

本系统为教师资料变更审核建立了完整的审核历史记录存储机制，使用独立的 DynamoDB 表来保存所有审核详细记录。

## 架构设计

### 数据表结构

**表名**: `jvtutorcorner-teacher-reviews`

#### 主要字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String (PK) | 审核记录唯一 ID (UUID) |
| `teacherId` | String | 教师 ID |
| `teacherName` | String | 教师名称 |
| `requestedAt` | String (ISO 8601) | 申请时间 |
| `reviewedAt` | String (ISO 8601) | 审核时间 |
| `reviewedBy` | String | 审核人 (admin user ID/email) |
| `action` | String | 审核结果: `approve` 或 `reject` |
| `originalData` | Object | 原始数据快照 |
| `requestedChanges` | Object | 请求的变更内容 |
| `notes` | String | 审核备注（可选） |
| `createdAt` | String (ISO 8601) | 记录创建时间 |

#### 索引 (GSI)

1. **teacherId-reviewedAt-index**
   - 分区键: `teacherId`
   - 排序键: `reviewedAt`
   - 用途: 查询特定教师的所有审核记录，按时间排序

2. **reviewedAt-index**
   - 分区键: `reviewedAt`
   - 用途: 按审核时间查询记录

## 核心文件

### 1. 服务层
**文件**: `lib/teacherReviewService.ts`

提供以下功能：
- `createReviewRecord()` - 创建审核记录
- `getReviewRecordsByTeacherId()` - 查询特定教师的审核记录
- `getAllReviewRecords()` - 获取所有审核记录（支持分页）
- `getReviewRecordById()` - 获取单条审核记录
- `getRecentReviewRecords()` - 获取最近的审核记录
- `getReviewStats()` - 获取审核统计信息

### 2. API 路由

#### POST /api/admin/teacher-reviews/[id]
**文件**: `app/api/admin/teacher-reviews/[id]/route.ts`

处理审核操作，支持：
- `action: 'approve'` - 核准变更
- `action: 'reject'` - 驳回变更

**请求体**:
```json
{
  "action": "approve" | "reject",
  "reviewedBy": "admin@example.com",
  "notes": "审核备注"
}
```

**功能增强**:
- ✅ 审核时自动保存详细记录到 `teacher-reviews` 表
- ✅ 记录原始数据和变更内容的完整快照
- ✅ 追踪审核人和审核时间
- ✅ 支持审核备注

#### GET /api/admin/teacher-reviews/history
**文件**: `app/api/admin/teacher-reviews/history/route.ts`

查询审核历史记录。

**查询参数**:
- `teacherId` - 筛选特定教师的记录
- `limit` - 返回记录数量（默认: 20）
- `recent=true` - 返回最近的审核记录，按时间降序
- `stats=true` - 仅返回统计信息

**示例**:
```bash
# 获取最近20条审核记录
GET /api/admin/teacher-reviews/history?recent=true&limit=20

# 获取特定教师的所有审核记录
GET /api/admin/teacher-reviews/history?teacherId=teacher-123

# 获取审核统计
GET /api/admin/teacher-reviews/history?stats=true
```

**返回示例**:
```json
{
  "ok": true,
  "records": [
    {
      "id": "review-uuid-123",
      "teacherId": "teacher-456",
      "teacherName": "張老師",
      "requestedAt": "2026-03-01T10:00:00Z",
      "reviewedAt": "2026-03-01T11:30:00Z",
      "reviewedBy": "admin@jvtutorcorner.com",
      "action": "approve",
      "originalData": {
        "name": "張老師",
        "subjects": ["數學"]
      },
      "requestedChanges": {
        "name": "張大明老師",
        "subjects": ["數學", "物理"]
      },
      "notes": "資料完整，核准變更",
      "createdAt": "2026-03-01T11:30:00Z"
    }
  ],
  "count": 1
}
```

## 部署步驟

### 1. 更新環境變數

在 `.env.local` 添加：
```
DYNAMODB_TABLE_TEACHER_REVIEWS=jvtutorcorner-teacher-reviews
```

### 2. 創建 DynamoDB 表

#### 方法 A: 使用初始化腳本（推薦）
```bash
node scripts/setup-teacher-reviews-table.mjs
```

#### 方法 B: 使用 CloudFormation
```bash
aws cloudformation create-stack \
  --stack-name jvtutorcorner-teacher-reviews \
  --template-body file://cloudformation/dynamodb-teacher-reviews-table.yml \
  --region ap-northeast-1
```

### 3. 驗證部署

```bash
# 檢查表是否創建成功
aws dynamodb describe-table \
  --table-name jvtutorcorner-teacher-reviews \
  --region ap-northeast-1
```

### 4. 初始化测试数据（可选）

如果需要测试审核功能，可以运行以下脚本创建一些待审核的教师变更申请：

```bash
node scripts/init-teacher-review-sample-data.mjs
```

该脚本会创建 4 个测试教师，每个都有不同的待审核变更：
- 張老師：修改姓名、科目、语言和介绍
- 王老師：修改姓名和介绍
- 李老師：新增科目和语言
- 陳老師：修改姓名、科目和介绍

## 使用範例

### 前端提交審核（包含審核人信息）

```typescript
const handleAction = async (id: string, action: 'approve' | 'reject') => {
  const user = getStoredUser(); // 獲取當前管理員信息
  
  const res = await fetch(`/api/admin/teacher-reviews/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      action,
      reviewedBy: user.email,
      notes: action === 'reject' ? '資料不完整，請重新提交' : '核准通過'
    })
  });
  
  const data = await res.json();
  if (data.ok) {
    console.log('審核已保存到歷史記錄');
  }
};
```

### 查詢審核歷史

```typescript
// 獲取特定教師的審核歷史
async function getTeacherReviewHistory(teacherId: string) {
  const res = await fetch(`/api/admin/teacher-reviews/history?teacherId=${teacherId}`);
  const data = await res.json();
  return data.records;
}

// 獲取最近的審核記錄
async function getRecentReviews() {
  const res = await fetch('/api/admin/teacher-reviews/history?recent=true&limit=20');
  const data = await res.json();
  return data.records;
}

// 獲取統計信息
async function getReviewStats() {
  const res = await fetch('/api/admin/teacher-reviews/history?stats=true');
  const data = await res.json();
  return data.stats; // { total, approved, rejected }
}
```

## 數據流程

```
1. 教師提交資料變更
   ↓
2. 變更保存到 teachers 表的 pendingProfileChanges
   ↓
3. 管理員審核
   ↓
4. API 處理審核請求
   ├─ 更新 teachers 表（apply/reject 變更）
   └─ 保存審核記錄到 teacher-reviews 表 ✅
   ↓
5. 審核記錄永久保存，可隨時查詢
```

## 優勢

1. **完整的審核追蹤** - 所有審核操作都有詳細記錄
2. **歷史數據不丟失** - 即使變更被應用或駁回，記錄依然保留
3. **支持審計需求** - 可追溯誰在何時做了什麼決定
4. **靈活的查詢** - 支持按教師、時間、狀態等多維度查詢
5. **統計分析** - 可以生成審核通過率等統計報表

## 未來擴展

可考慮添加：
- 審核備註／評論功能
- 審核時間超時提醒
- 批量審核功能
- 審核記錄匯出（CSV/Excel）
- 審核流程可視化
- 權限管理（不同管理員權限）

## 環境變數清單

確保以下環境變數已配置：

```bash
# AWS 基礎配置
AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# DynamoDB 表名
DYNAMODB_TABLE_TEACHERS=jvtutorcorner-teachers
DYNAMODB_TABLE_TEACHER_REVIEWS=jvtutorcorner-teacher-reviews
```

## 故障排除

### 問題: 審核記錄未保存

**檢查項目**:
1. 確認環境變數 `DYNAMODB_TABLE_TEACHER_REVIEWS` 已設置
2. 檢查 AWS 憑證是否有權限訪問表
3. 查看服務器日誌中的錯誤信息

### 問題: 無法創建表

**解決方案**:
```bash
# 檢查 AWS 憑證
aws sts get-caller-identity

# 檢查 DynamoDB 權限
aws dynamodb list-tables --region ap-northeast-1
```

## 相關文件

- `lib/teacherReviewService.ts` - 服務層實現
- `app/api/admin/teacher-reviews/[id]/route.ts` - 審核處理 API
- `app/api/admin/teacher-reviews/history/route.ts` - 歷史查詢 API
- `cloudformation/dynamodb-teacher-reviews-table.yml` - CloudFormation 模板
- `scripts/setup-teacher-reviews-table.mjs` - 表初始化腳本
