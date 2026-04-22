# 🚀 藥品影像分析 API - 快速開始指南

## ⚡ 3 分鐘快速啟動

### 1️⃣ 安裝依賴

```bash
pip install -r requirements.txt
```

### 2️⃣ 確保上傳目錄存在

```bash
mkdir -p uploads
```

### 3️⃣ 運行應用

```bash
python main.py
```

應用將在 `http://localhost:8000` 啟動

---

## 🔍 確認應用運行正常

### 檢查健康狀態

```bash
curl http://localhost:8000/health
```

預期回應:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:45.123456"
}
```

### 查看 API 文檔

打開瀏覽器訪問:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

---

## 🧪 測試上傳功能

### 方法 1: 使用提供的測試工具

```bash
# 自動執行所有測試
python test_client.py --auto

# 或互動式測試
python test_client.py --interactive
```

### 方法 2: 使用前端頁面

1. 在瀏覽器中打開 `frontend_example.html`
2. 選擇藥品圖片
3. 輸入訊息（可選）
4. 點擊「上傳分析」

### 方法 3: 使用 cURL

```bash
# 準備一個測試圖片，然後執行:
curl -X POST "http://localhost:8000/api/v1/medication/analyze" \
  -F "image_file=@your_image.jpg" \
  -F "user_message=測試訊息"
```

---

## 📁 專案文件說明

| 檔案 | 說明 |
|------|------|
| `main.py` | FastAPI 應用主程式 |
| `requirements.txt` | Python 依賴清單 |
| `test_client.py` | 測試用客戶端工具 |
| `frontend_example.html` | 前端網頁範例 |
| `README_API.md` | 詳細 API 文檔 |
| `DEPLOYMENT_GUIDE.md` | 部署與配置指南 |
| `QUICK_START.md` | 本檔案 |

---

## 💡 常見操作

### 清空上傳的檔案

```bash
# Windows
rmdir /s /q uploads
mkdir uploads

# macOS/Linux
rm -rf uploads
mkdir uploads
```

### 查看最近上傳的檔案

```bash
# Windows
dir /od uploads

# macOS/Linux
ls -lt uploads
```

### 修改服務端口

編輯 `main.py`，在檔案最底部修改:

```python
if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=9000,  # 改為 9000 或其他端口
        reload=True,
        log_level="info"
    )
```

---

## 🔧 開發提示

### 啟用自動重新加載

```bash
# 已預設啟用 reload=True
python main.py
```

修改檔案後應用會自動重新加載。

### 查看詳細日誌

```bash
# 已預設日誌級別為 INFO
# 要查看更詳細的 DEBUG 日誌，修改 main.py:

logging.basicConfig(level=logging.DEBUG)
```

### 模擬大檔案測試

```python
# 建立一個 6MB 的測試大檔案
dd if=/dev/zero of=large_test.jpg bs=1M count=6

# 然後嘗試上傳，會收到檔案過大的錯誤
```

---

## 🆘 快速故障排除

### 問題: `ModuleNotFoundError: No module named 'fastapi'`

**解決:**
```bash
pip install -r requirements.txt
```

### 問題: `Address already in use` (端口被占用)

**解決:**
```bash
# 修改 main.py 中的端口，或終止佔用該端口的程序

# Windows - 查找佔用 8000 端口的程序
netstat -ano | findstr :8000

# 終止該程序 (例如 PID 為 1234)
taskkill /PID 1234 /F
```

### 問題: CORS 錯誤 - `Access-Control-Allow-Origin`

**解決:**
確保前端 URL 在 `main.py` 中的 `ALLOWED_ORIGINS` 清單中。

### 問題: 上傳後檔案不存在

**檢查:**
1. `uploads/` 目錄是否存在
2. 應用是否有該目錄的寫入權限
3. 磁碟空間是否充足

---

## 📚 下一步

- 📖 閱讀 [詳細 API 文檔](README_API.md)
- 🚀 查看 [部署指南](DEPLOYMENT_GUIDE.md)
- 🔧 修改 `main.py` 新增自訂功能
- 🧪 執行測試工具驗證功能

---

## 🤝 需要幫助？

如有問題，檢查:
1. 應用是否正常運行 (`http://localhost:8000/health`)
2. 檔案格式是否正確 (JPEG/PNG)
3. 檔案大小是否 < 5MB
4. 檢查瀏覽器控制台和應用日誌

---

**享受開發！** 🎉
