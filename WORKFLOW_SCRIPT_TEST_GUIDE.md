# Workflow 腳本執行測試指南

**最後更新：2026-03-31**

---

## 📋 概述

本指南說明如何在 Workflow 系統中測試 Python 和 JavaScript 腳本。每個腳本類型都有預設的初始化範例，可直接執行測試。

---

## 🟦 JavaScript 腳本測試

### ✅ 節點類型變更

| 項目 | 舊值 | 新值 | 說明 |
|------|------|------|------|
| **Type** | `action` | `javascript` | 獨立的 JavaScript 節點類型 |
| **Subtype** | `action_js_script` | `action_js_script` | 保持不變 |
| **圖標** | 📜 | 📜 | 保持不變 |
| **名稱** | JavaScript 腳本 | JavaScript 腳本 | 保持不變 |

### 版本信息

```
Runtime:       Node.js 18+
Sandbox:       isolated-vm 6.0.2+
Timeout:       3000ms (預設)
Memory:        128MB
```

### 初始化範例腳本

新建立的 JavaScript 節點預設包含以下測試腳本：

```javascript
// ═══════════════════════════════════════════════════════════
// JavaScript Workflow Script — 初始化範例
// ═══════════════════════════════════════════════════════════
// 版本: Node.js 18+ | isolated-vm 6.0.2+
// 超時: 3000ms (預設，可設定)
// 記憶體: 128MB (可設定)
//
// 注意：此執行環境是沙箱隔離的
// ❌ 不支援: fetch, setTimeout, 檔案系統
// ✅ 支援: 標準 JS, JSON, 資料轉換
// ═══════════════════════════════════════════════════════════

// 📥 1️⃣ 存取工作流程資料
const studentName = data?.student_name || 'Explorer';
const courseName = data?.course_name || 'JavaScript 101';
const processedCount = (data?.processed_count || 0) + 1;

// 📝 2️⃣ 執行你的邏輯
console.log('[JS] Starting workflow...');
console.log('[JS] Student:', studentName);
console.log('[JS] Course:', courseName);

const timestamp = new Date().toISOString();

// ✅ 3️⃣ 建立結果物件
const result = {
  status: 'success',
  message: `👋 Hello ${studentName}! Processing ${courseName}`,
  course: courseName,
  timestamp: timestamp,
  processed: true,
  processed_count: processedCount,
  from_javascript: true,
  runtime: 'Node.js 18+'
};

// 📋 4️⃣ 列印日誌
console.log('[JS] Result processed');
console.log(JSON.stringify(result, null, 2));

// 📤 5️⃣ 回傳結果 (自動合併入工作流程資料)
return result;
```

### 測試步驟

1. **新建 JavaScript 節點**
   - 在 Workflow Canvas 中，選擇「處理 / 腳本」 → 「JavaScript 腳本」
   - 節點會自動填入上述初始化範例

2. **設定測試資料**
   - 在前一個觸發器或輸入節點中設定 `testPayload`：
   ```json
   {
     "student_name": "Alice",
     "course_name": "Advanced JavaScript",
     "processed_count": 0
   }
   ```

3. **執行測試**
   - 點擊 Workflow Canvas 上的「測試」或「執行」按鈕
   - 查看「主控台」標籤查看腳本輸出

4. **驗証結果**
   - ✅ 確認 console.log 輸出出現在日誌中
   - ✅ 確認回傳結果包含所有預期欄位
   - ✅ 確認資料正確合併入下一個節點

### 常見測試場景

#### 場景 1：簡單資料轉換

```javascript
// 將資料轉換為大寫
const result = {
  student_name_upper: data.student_name.toUpperCase(),
  course_code: data.course_name.replace(/\s+/g, '_')
};
return result;
```

#### 場景 2：條件判斷

```javascript
const processed_count = data.processed_count || 0;
const should_notify = processed_count >= 3;

return {
  processed: true,
  should_notify: should_notify,
  count: processed_count + 1
};
```

#### 場景 3：JSON 操作

```javascript
const items = JSON.parse(data.json_string || '[]');
const processed = items.map(item => ({
  ...item,
  processed_at: new Date().toISOString()
}));

return {
  items_count: processed.length,
  items: processed
};
```

---

## 🔴 Python 腳本測試

### 版本信息

```
Runtime:       Python 3.9, 3.10, 3.11 (推薦), 3.12
Executor:      AWS Lambda
Timeout:       30000ms (30 秒，可調整至 300s)
Memory:        512MB - 3GB (Lambda 配置)
```

### 初始化範例腳本

新建立的 Python 節點預設包含以下測試腳本：

```python
# ═══════════════════════════════════════════════════════════
# Python Workflow Script — 初始化範例
# ═══════════════════════════════════════════════════════════
# 版本: Python 3.9-3.12
# 超時: 30000ms (30 秒) — 支援長時間任務
# 記憶體: 512MB - 3GB (可在 Lambda 配置)
#
# 輸入: data (dict) — 工作流程資料
# 輸出: print() 會顯示在日誌，return 會作為結果
# ═══════════════════════════════════════════════════════════

import json
from datetime import datetime

# 📥 1️⃣ 存取輸入資料
student_name = data.get("student_name", "Explorer")
course_name = data.get("course_name", "Python 101")
try_count = data.get("try_count", 0)

# 🔄 2️⃣ 執行你的邏輯
timestamp = datetime.now().isoformat()
processed_try_count = try_count + 1

# ✅ 3️⃣ 建立結果
result = {
    "status": "success",
    "message": f"👋 Hello {student_name}! Welcome to {course_name}",
    "course": course_name,
    "timestamp": timestamp,
    "processed": True,
    "try_count": processed_try_count,
    "python_version": "3.11"
}

# 📋 4️⃣ 列印日誌 (會顯示在執行跟蹤中)
print(f"[Python] Processing {student_name}")
print(f"[Python] Course: {course_name}")
print(json.dumps(result))

# 📤 5️⃣ 回傳結果 (自動轉換為 JSON，合併入工作流程資料)
return result
```

### 測試步驟

1. **新建 Python 節點**
   - 在 Workflow Canvas 中，選擇「處理 / 腳本」 → 「Python 腳本」
   - 節點會自動填入上述初始化範例

2. **設定測試資料**
   - 在前一個觸發器或輸入節點中設定 `testPayload`：
   ```json
   {
     "student_name": "Bob",
     "course_name": "Python 101",
     "try_count": 0
   }
   ```

3. **執行測試**
   - 點擊 Workflow Canvas 上的「測試」或「執行」按鈕
   - 檢查 AWS Lambda 是否可用
   - 查看「主控台」標籤查看腳本輸出

4. **驗証結果**
   - ✅ 確認 print() 輸出出現在日誌中
   - ✅ 確認回傳結果為有效 JSON
   - ✅ 確認資料正確合併入下一個節點

### 常見測試場景

#### 場景 1：資料處理

```python
import json

scores = json.loads(data.get("scores", "[]"))
average = sum(scores) / len(scores) if scores else 0

result = {
    "scores": scores,
    "average": round(average, 2),
    "passed": average >= 60
}

print(f"[Python] Average score: {result['average']}")
return result
```

#### 場景 2：複雜計算

```python
from datetime import datetime, timedelta

start_date = data.get("start_date")
duration_days = data.get("duration_days", 7)

if start_date:
    parsed_date = datetime.fromisoformat(start_date)
    end_date = parsed_date + timedelta(days=duration_days)
    result = {
        "start": start_date,
        "end": end_date.isoformat(),
        "duration_days": duration_days
    }
else:
    result = {"error": "Invalid start_date"}

print(json.dumps(result))
return result
```

#### 場景 3：列表操作

```python
items = data.get("items", [])

# 過濾和轉換
processed = [
    {
        "id": item.get("id"),
        "name": item.get("name").upper() if item.get("name") else "",
        "processed": True
    }
    for item in items
    if item.get("id")
]

result = {
    "original_count": len(items),
    "processed_count": len(processed),
    "items": processed
}

return result
```

---

## 🔄 Python vs JavaScript 對比

| 特性 | Python | JavaScript |
|------|--------|-----------|
| **超時** | 30000ms (最多 300s) | 3000ms (預設) |
| **記憶體** | 512MB - 3GB | 128MB |
| **特性** | NumPy, Pandas, 異步 | JSON, 標準庫 |
| **限制** | 無本地檔案系統 | 無 fetch, setTimeout |
| **使用** | 複雜計算、資料處理 | 快速轉換、驗證 |
| **沙箱** | Lambda (外部) | isolated-vm (本地) |

---

## 🧪 測試工作流程

### 完整測試流程

```
1️⃣ 觸發器/輸入
   ↓ (設定 testPayload)
   
2️⃣ JavaScript / Python 腳本
   ↓ (執行測試)
   
3️⃣ 查看日誌
   ├─ console.log() / print()
   ├─ 執行時間
   └─ 錯誤信息
   
4️⃣ 驗証結果
   ├─ 檢查回傳值
   ├─ 確認資料型態
   └─ 驗証合併結果
```

### 測試檢查清單

- [ ] 腳本能無錯誤執行
- [ ] console.log() / print() 輸出正確
- [ ] 回傳值包含所有預期欄位
- [ ] 資料型態正確 (JSON-compatible)
- [ ] 資料正確合併入工作流程
- [ ] 性能可接受 (不超時)
- [ ] 支援典型用例
- [ ] 錯誤處理完善

---

## ⚠️ 常見問題

### JavaScript

**Q：腳本超時**  
A：增加 `SCRIPT_EXECUTION_TIMEOUT_MS` 環境變數（最多 300000ms）或優化程式碼

**Q：無法訪問其他API**  
A：isolated-vm 沙箱限制了 fetch 和網絡訪問，使用 HTTP 節點代替

---

### Python

**Q：Lambda 找不到**  
A：確認 AWS_LAMBDA_FUNCTION_NAME 和認證設定正確

**Q：套件缺失**  
A：在 Lambda 層中添加所需套件（NumPy, Pandas 等）

---

## 📚 相關文件

- [Workflow 功能完善指南](WORKFLOW_PYTHON_JAVASCRIPT_ENHANCEMENT.md)
- [腳本執行版本指南](WORKFLOW_SCRIPT_EXECUTION_VERSIONS.md)
- [Amplify 部署檢查清單](AMPLIFY_WORKFLOW_DEPLOYMENT_CHECKLIST.md)

---

## ✨ 總結

✅ **JavaScript 腳本**
- 快速執行 (3000ms)
- 沙箱隔離
- 適合資料轉換

✅ **Python 腳本**
- 長時間任務 (最多 300s)
- 強大的資料科學庫
- 適合複雜處理

✅ **兩者都有初始化範例**
- 直接可執行測試
- 包含版本信息
- 最佳實踐範例
