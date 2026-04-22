# 🏥 藥品影像分析 FastAPI 後端應用

用於接收來自 **LINE LIFF (前端網頁)** 傳送的使用者訊息與藥品圖片的 FastAPI 後端應用程式。

## 📋 技術規格

| 項目 | 規格 |
|------|------|
| 框架 | FastAPI |
| 伺服器 | Uvicorn |
| Python 版本 | 3.9+ |
| 最大檔案大小 | 5MB |
| 支援格式 | JPEG, PNG |
| CORS | 啟用（支援 LINE LIFF） |

---

## 🚀 快速開始

### 1️⃣ 安裝依賴

```bash
pip install -r requirements.txt
```

### 2️⃣ 運行應用

```bash
python main.py
```

或使用 uvicorn 直接運行：

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

應用將在 `http://localhost:8000` 啟動

---

## 📚 API 文檔

### 自動 API 文檔

應用啟動後，可訪問以下 URL：

- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

---

## 📡 API 端點

### 1. 健康檢查

```http
GET /health
```

**響應 (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:45.123456"
}
```

---

### 2. API 狀態

```http
GET /api/v1/status
```

**響應 (200 OK):**
```json
{
  "status": "online",
  "service": "藥品影像分析 API",
  "version": "1.0.0",
  "max_file_size_mb": 5.0,
  "allowed_formats": ["image/jpeg", "image/png"],
  "timestamp": "2024-01-15T10:30:45.123456"
}
```

---

### 3. 分析藥品圖片 ⭐ 主端點

```http
POST /api/v1/medication/analyze
Content-Type: multipart/form-data
```

**請求參數:**

| 參數 | 類型 | 必需 | 說明 |
|------|------|------|------|
| `image_file` | File (Binary) | ✅ | 藥品圖片檔案 (JPG/PNG) |
| `user_message` | String | ❌ | 使用者訊息（例如：藥品名稱、症狀描述） |

**成功響應 (200 OK):**
```json
{
  "status": "success",
  "message": "圖片已接收並驗證成功",
  "data": {
    "filename": "medication_20240115_103045.jpg",
    "original_filename": "photo.jpg",
    "file_size": 245680,
    "file_size_mb": 0.23,
    "mime_type": "image/jpeg",
    "user_message": "這是阿斯匹靈",
    "upload_timestamp": "2024-01-15T10:30:45.123456",
    "file_path": "uploads/medication_20240115_103045.jpg"
  }
}
```

**錯誤響應 - 格式不支援 (400 Bad Request):**
```json
{
  "status": "error",
  "message": "不支援的檔案格式。僅支援: image/jpeg, image/png",
  "error_type": "invalid_mime_type"
}
```

**錯誤響應 - 檔案過大 (400 Bad Request):**
```json
{
  "status": "error",
  "message": "檔案過大。最大允許大小: 5.0MB，實際: 6.50MB",
  "error_type": "file_too_large"
}
```

**錯誤響應 - 伺服器錯誤 (500 Internal Server Error):**
```json
{
  "status": "error",
  "message": "伺服器內部錯誤",
  "error_type": "internal_server_error",
  "detail": "詳細的錯誤訊息"
}
```

---

## 🧪 測試方式

### 方法 1️⃣: 使用 cURL

```bash
# 使用本地圖片
curl -X POST "http://localhost:8000/api/v1/medication/analyze" \
  -F "image_file=@/path/to/medication.jpg" \
  -F "user_message=這是阿斯匹靈"
```

### 方法 2️⃣: 使用 Python requests

```python
import requests

# 準備檔案和資料
with open("medication.jpg", "rb") as f:
    files = {"image_file": f}
    data = {"user_message": "這是阿斯匹靈"}
    
    # 發送請求
    response = requests.post(
        "http://localhost:8000/api/v1/medication/analyze",
        files=files,
        data=data
    )
    
    # 查看結果
    print(response.status_code)
    print(response.json())
```

### 方法 3️⃣: 使用 JavaScript (LINE LIFF 網頁)

```javascript
// 準備 FormData
const formData = new FormData();
formData.append('image_file', fileInput.files[0]); // 從 <input type="file">
formData.append('user_message', '這是阿斯匹靈');

// 發送請求
try {
  const response = await fetch(
    'http://localhost:8000/api/v1/medication/analyze',
    {
      method: 'POST',
      body: formData
    }
  );
  
  const data = await response.json();
  
  if (response.ok) {
    console.log('成功:', data);
  } else {
    console.error('錯誤:', data.message);
  }
} catch (error) {
  console.error('網路錯誤:', error);
}
```

### 方法 4️⃣: 使用 Swagger UI

1. 打開 `http://localhost:8000/docs`
2. 找到 `POST /api/v1/medication/analyze` 端點
3. 點擊 "Try it out"
4. 選擇圖片檔案和輸入訊息
5. 點擊 "Execute"

---

## 📁 專案結構

```
.
├── main.py                 # FastAPI 應用程式主檔案
├── requirements.txt        # Python 依賴清單
├── README.md              # 此說明文檔
├── test_client.py         # 測試用戶端（可選）
└── uploads/               # 上傳檔案儲存目錄（自動建立）
```

---

## ⚙️ 組態設定

### 修改 CORS 設定

在 `main.py` 中找到 `CORS 設定` 區段：

```python
# 生產環境：只允許特定 LIFF URL
ALLOWED_ORIGINS = [
    "https://liff.line.me",
    "https://your-liff-app-url.com"
]
```

### 修改檔案大小限制

在 `main.py` 中修改：

```python
MAX_FILE_SIZE = 10 * 1024 * 1024  # 改為 10MB
```

### 修改支援的檔案格式

```python
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}  # 新增 WebP
```

---

## 🔒 安全性考量

### ✅ 已實現的安全特性

- ✓ MIME type 驗證
- ✓ 檔案大小限制
- ✓ 異常處理與日誌記錄
- ✓ CORS 防護

### 💡 生產環境建議

1. **認證**: 新增 JWT 或 API Key 驗證
2. **HTTPS**: 啟用 SSL/TLS
3. **病毒掃描**: 集成病毒掃描服務
4. **速率限制**: 使用 `slowapi` 防止濫用
5. **日誌**: 完整的審計日誌
6. **儲存**: 上傳至雲端儲存（AWS S3、Google Cloud Storage）

---

## 📝 日誌

應用會輸出詳細的日誌訊息。查看 console 輸出以追踪請求和錯誤。

日誌示例：
```
INFO:     Application startup complete
INFO:     接收到上傳請求 - 檔案: medication.jpg
INFO:     檔案成功儲存: uploads/medication_20240115_103045.jpg (大小: 245680 bytes)
```

---

## 🐛 常見問題 (FAQ)

### Q: 無法連接到 API？
**A:** 確保應用已運行，檢查 `http://localhost:8000/health`

### Q: 上傳失敗 - CORS 錯誤？
**A:** 檢查 CORS 設定，確保前端 URL 在允許清單中

### Q: 如何存取上傳的檔案？
**A:** 檔案儲存在 `uploads/` 目錄，可以配置靜態檔案服務

### Q: 如何清空上傳的檔案？
**A:** 刪除 `uploads/` 目錄中的檔案（應用會自動重建目錄）

---

## 📞 支援與貢獻

如有問題或建議，請創建 Issue 或提交 Pull Request。

---

## 📄 授權

MIT License - 詳見 LICENSE 檔案

---

**最後更新**: 2024年1月15日 | **版本**: 1.0.0
