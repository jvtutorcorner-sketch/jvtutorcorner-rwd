# 課程對齐驗證診斷報告
**生成時間**: 2026-03-15  
**測試環境**: localhost:3000  
**測試結果**: ❌ FAILED

---

## 執行摘要

課程對齐驗證測試失敗。學生端看到的課程與老師端看到的課程**完全對應失敗**。

### 關鍵數據

| 項目 | 學生端 (basic@test.com) | 老師端 (lin@test.com) |
|------|----------------------|----------------------|
| **課程 ID** | `test-course-1773554641930` | `3ea66887-8145-4c10-ab3b-bf2d887c0bd4` |
| **課程名稱** | test-course-1773554641930 (ID 作為標題) | 測試點數課程 |
| **開始時間** | 2026-03-15 15:04 | 無 |
| **結束時間** | 2026-03-15 16:04 | 無 |
| **教師** | (無課程記錄) | 林老師 |
| **對應關係** | ❌ | ❌ |

---

## 詳細診斷結果

### 1️⃣ 學生訂單查詢 (✅ 成功)

**API 調用**: `GET /api/orders?userId=basic%40test.com&limit=50`

**結果**:
- ✅ 找到 1 個訂單
- 訂單 ID: `914ff776-48c1-4643-8657-2c70eab4a0ec`
- 課程 ID: `test-course-1773554641930`
- 狀態: PAID
- 開始時間: 2026-03-15T15:04
- 結束時間: 2026-03-15T16:04

**評估**: 學生成功報名了課程。

---

### 2️⃣ 課程主記錄查詢 (❌ 失敗)

**API 調用**: `GET /api/courses?id=test-course-1773554641930`

**結果**:
- ❌ 課程未找到 (404)
- DynamoDB 中沒有該課程的主記錄

**評估**: 這是根本原因！測試課程沒有對應的課程主記錄。

**後果**:
- 學生端無法顯示課程標題 → 只好顯示課程 ID
- 老師端無法通過課程 ID 查詢此課程
- 導致學生和老師觀看的課程數據完全對應失敗

---

### 3️⃣ 老師課程查詢 (✅ 成功，但課程不同)

**API 調用**: `GET /api/courses?teacher=林老師&limit=50`

**結果**:
- ✅ 找到 1 個課程
- 課程 ID: `3ea66887-8145-4c10-ab3b-bf2d887c0bd4`
- 課程名稱: 測試點數課程
- 教師: 林老師
- 該課程沒有任何訂單

**評估**: 老師能查到自己的課程（成功），但是這不是學生報名的課程。

---

### 4️⃣ 老師課程訂單查詢 (✅ 查詢成功, 0 個訂單)

**API 調用**: `GET /api/orders?courseId=3ea66887-8145-4c10-ab3b-bf2d887c0bd4&limit=50`

**結果**:
- ✅ API 工作正常
- 找到 0 個訂單（老師的課程沒人報名）

**評估**: 數據一致性維護良好，但無法驗證（無交集）。

---

### 5️⃣ 交叉比對結果 (❌ 對齐失敗)

| 類別 | 訂單數 | 狀態 |
|------|-------|------|
| 同時出現在學生和老師 | 0 | ❌ FAILED |
| 僅在學生的訂單 | 1 | ⚠️ 老師看不到 |
| 僅在老師的訂單 | 0 | ℹ️ N/A |

**診斷結論**: 學生報名的課程與老師的課程沒有任何交集。

---

## 根本原因分析

### 🎯 主要問題

**課程主記錄在 DynamoDB 中不存在**

1. **訂單表 (ORDERS_TABLE)** - ✅ 有數據
   - 學生的訂單記錄了 `courseId: test-course-1773554641930`
   - 訂單狀態為 PAID

2. **課程表 (COURSES_TABLE)** - ❌ 缺少共同課程
   - `test-course-1773554641930` 不存在
   - 老師看到的是另一個課程

### 三層查詢鏈的問題位置

```
[老師端工作流]
1. 查詢老師的課程 → /api/courses?teacher=林老師
   ✅ 成功: 找到 3ea66887-8145-4c10-ab3b-bf2d887c0bd4 (測試點數課程)
2. 查詢該課程的訂單 → /api/orders?courseId=3ea66887-...
   ✅ 成功: 但 0 個訂單 (沒人報名)

[學生端工作流]
1. 查詢學生的訂單 → /api/orders?userId=basic@test.com
   ✅ 成功: 找到訂單 (課程 ID: test-course-1773554641930)
2. 查詢訂單的課程 → /api/courses?id=test-course-1773554641930
   ❌ 失敗: 課程不存在 (404)

[導致的結果]
❌ 學生和老師看不到彼此的課程
```

---

## 影響分析

### 用戶體驗受影響

- **學生**:
  - ❌ 在 `/student_courses` 頁面看不到課程標題，只看到 ID
  - ❌ 無法進入教室（無課程完整信息）
  - ❌ 點數被扣，但課程數據不完整

- **老師**:
  - ✅ 在 `/teacher_courses` 看到自己的課程（但不是學生報名的）
  - ❌ 看不到學生報名的課程
  - ❌ 無法進行教學管理

### 數據一致性破壞

| 檢查點 | 結果 |
|--------|------|
| 訂單表的參考完整性 | ❌ FAILED (orphaned order) |
| 課程名稱對齐 | ❌ FAILED |
| 開始時間對齐 | ❌ FAILED |
| 結束時間對齐 | ❌ FAILED |
| 教師信息對齐 | ❌ FAILED |

---

## 修復建議

### 立即行動 (Critical - P0)

1. **驗證課程創建流程**
   - 檢查 `student-enrollment-flow` 是否正確創建課程主記錄
   - 確認動態課程 ID (`test-course-${Date.now()}`) 是否被保存到 COURSES_TABLE

2. **添加外鍵約束驗證**
   - 在訂單創建時，驗證 `courseId` 是否存在於 COURSES_TABLE
   - 防止創建孤立訂單（orphaned orders）

3. **清理孤立數據**
   ```sql
   -- 查找沒有對應課程記錄的訂單
   SELECT * FROM ORDERS_TABLE 
   WHERE courseId NOT IN (SELECT id FROM COURSES_TABLE)
   
   -- 手動建立缺失的課程記錄或刪除孤立訂單
   ```

### 中期改進 (P1)

1. 在 `/student_courses` 頁面添加警告，當課程主記錄缺失時
2. 為 `/teacher_courses` 添加學生報名管理視圖，即使課程由其他老師創建
3. 建立課程主記錄與訂單的同步機制

### 測試增強 (P2)

1. 在 `course_alignment_verification.spec.ts` 中添加課程主記錄驗證
2. 檢查 `cleanTimeString` 的時間格式化是否正確
3. 驗證 `startTime` 和 `endTime` 的格式一致性

---

## 推薦的測試修復方案

### 方案 A: 修復測試資料本身

在 `student-enrollment-flow.spec.ts` 中，確保動態創建的課程被持久化到 DynamoDB:

```typescript
// 在課程創建時調用以下 API
await page.goto(`${BASE_URL}/api/courses`, {
  method: 'POST',
  data: {
    id: courseId,
    title: `Test Course ${Date.now()}`,
    teacherName: 'lin@test.com', // 或老師的真實名稱
    teacherId: 'lin',
    // ... 其他課程數據
  }
});
```

### 方案 B: 修復課程對齐測試

修改 `course_alignment_verification.spec.ts`，在測試開始前建立課程主記錄:

```typescript
test.beforeEach(async ({ page }) => {
  // 1. 查詢學生訂單獲取 courseId
  const courseId = '...'; // 從學生訂單獲取
  
  // 2. 確保課程主記錄存在
  await fetch(`${BASE_URL}/api/courses`, {
    method: 'POST',
    body: JSON.stringify({
      id: courseId,
      title: courseTitle,
      teacherName: '林老師',
      teacherId: 'lin',
      // ... 其他數據
    })
  });
});
```

---

## 結論

❌ **課程對齐驗證失敗**

**根本原因**: 課程主記錄缺失，導致學生和老師看到的課程完全不同。

**修復優先級**: 🔴 Critical - 必須立即修復，否則學生和老師無法看到一致的課程信息。

**下一步**: 查看 `student-enrollment-flow` 測試，確保動態創建的課程被正確保存到 DynamoDB。
