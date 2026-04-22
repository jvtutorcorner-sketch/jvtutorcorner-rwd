# 藥品影像分析 API - 部署與配置指南

## 📦 快速安裝

### 方法 1️⃣: 使用 Python venv

```bash
# 建立虛擬環境
python -m venv venv

# 啟動虛擬環境
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 安裝依賴
pip install -r requirements.txt

# 開發模式運行
python main.py
```

### 方法 2️⃣: 使用 Docker

#### Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# 複製依賴檔案
COPY requirements.txt .

# 安裝依賴
RUN pip install --no-cache-dir -r requirements.txt

# 複製應用代碼
COPY main.py .

# 建立 uploads 目錄
RUN mkdir -p uploads

# 公開端口
EXPOSE 8000

# 運行應用
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

#### docker-compose.yml

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - ./uploads:/app/uploads
    environment:
      - PYTHONUNBUFFERED=1
    restart: unless-stopped
```

**構建並運行:**

```bash
docker-compose up -d
```

---

## 🌐 生產環境部署

### 使用 Gunicorn + Nginx

#### 1. 安裝 Gunicorn

```bash
pip install gunicorn
```

#### 2. 運行 Gunicorn

```bash
gunicorn -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000 main:app
```

參數說明:
- `-w 4`: 使用 4 個 worker 進程
- `-k uvicorn.workers.UvicornWorker`: 使用 Uvicorn worker
- `-b 0.0.0.0:8000`: 綁定到所有網卡的 8000 端口

#### 3. Nginx 配置

```nginx
upstream medication_api {
    server localhost:8000;
}

server {
    listen 80;
    server_name your-domain.com;

    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    # SSL 證書配置
    ssl_certificate /etc/ssl/certs/your-cert.crt;
    ssl_certificate_key /etc/ssl/private/your-key.key;

    # 安全頭
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;

    # 反向代理設定
    location / {
        proxy_pass http://medication_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 增加上傳超時時間
        client_max_body_size 10M;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 靜態檔案服務
    location /uploads {
        alias /var/www/medication-api/uploads;
        expires 1d;
    }
}
```

### Systemd 服務配置

建立 `/etc/systemd/system/medication-api.service`:

```ini
[Unit]
Description=Medication Analysis API
After=network.target

[Service]
Type=notify
User=www-data
WorkingDirectory=/var/www/medication-api

Environment="PATH=/var/www/medication-api/venv/bin"
ExecStart=/var/www/medication-api/venv/bin/gunicorn \
    -w 4 \
    -k uvicorn.workers.UvicornWorker \
    -b 0.0.0.0:8000 \
    main:app

Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

啟動服務:

```bash
sudo systemctl daemon-reload
sudo systemctl enable medication-api
sudo systemctl start medication-api
```

---

## 🔧 環境變數配置

建立 `.env` 檔案 (如果需要):

```env
# API 配置
API_HOST=0.0.0.0
API_PORT=8000
API_DEBUG=False

# CORS 配置
ALLOWED_ORIGINS=https://your-liff-app.com,https://another-domain.com

# 檔案配置
MAX_FILE_SIZE_MB=5
UPLOAD_DIR=./uploads

# 日誌配置
LOG_LEVEL=INFO
LOG_FILE=./logs/api.log

# 安全配置
ENABLE_AUTH=True
API_KEY=your-secret-api-key
```

修改 `main.py` 以支援環境變數:

```python
import os
from dotenv import load_dotenv

load_dotenv()

API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", 8000))
API_DEBUG = os.getenv("API_DEBUG", "False").lower() == "true"
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE_MB", 5)) * 1024 * 1024
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
```

---

## 📊 性能優化

### 1. 檔案系統優化

```bash
# 調整檔案描述符限制
ulimit -n 65535
```

### 2. 啟用 GZIP 壓縮

在 Nginx 配置中:

```nginx
gzip on;
gzip_types text/plain application/json;
gzip_min_length 1000;
gzip_comp_level 6;
```

### 3. 使用 CDN 加速

配置 CloudFront、Cloudflare 等 CDN 服務

### 4. 添加快取標頭

```python
from fastapi.responses import FileResponse

@app.get("/uploads/{filename}")
async def get_file(filename: str):
    return FileResponse(
        f"uploads/{filename}",
        headers={"Cache-Control": "public, max-age=86400"}
    )
```

---

## 🔐 安全加固

### 1. 添加 API 密鑰認證

```python
from fastapi import Depends, HTTPException, Header

async def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key != "your-secret-api-key":
        raise HTTPException(
            status_code=403,
            detail="Invalid API key"
        )

@app.post("/api/v1/medication/analyze")
async def analyze_medication(
    image_file: UploadFile = File(...),
    user_message: str = Form(""),
    api_key: str = Depends(verify_api_key)
):
    # ... 原有代碼
```

### 2. 速率限制

安裝 `slowapi`:

```bash
pip install slowapi
```

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/api/v1/medication/analyze")
@limiter.limit("10/minute")
async def analyze_medication(request: Request, ...):
    # ... 代碼
```

### 3. 病毒掃描

整合 ClamAV:

```python
import pyclamd

clam = pyclamd.ClamD()

@app.post("/api/v1/medication/analyze")
async def analyze_medication(image_file: UploadFile = File(...)):
    contents = await image_file.read()
    
    # 掃描病毒
    if clam.scan_stream(contents):
        raise HTTPException(status_code=400, detail="Malware detected")
    
    # ... 繼續處理
```

---

## 🧪 監控與日誌

### 使用 Sentry 進行錯誤追蹤

```bash
pip install sentry-sdk
```

```python
import sentry_sdk

sentry_sdk.init(
    dsn="your-sentry-dsn",
    traces_sample_rate=1.0
)
```

### 使用 Prometheus 監控

```bash
pip install prometheus-client
```

```python
from prometheus_client import Counter, Histogram

upload_counter = Counter(
    'medication_uploads_total',
    'Total medication uploads'
)

upload_duration = Histogram(
    'medication_upload_duration_seconds',
    'Time spent uploading'
)

@app.post("/api/v1/medication/analyze")
async def analyze_medication(...):
    with upload_duration.time():
        # ... 代碼
        upload_counter.inc()
```

---

## 📝 檢查清單

### 生產環境部署前

- [ ] 已禁用 DEBUG 模式
- [ ] 已設定 HTTPS/SSL 證書
- [ ] 已配置 CORS 為特定來源
- [ ] 已添加 API 驗證 (API Key 或 JWT)
- [ ] 已配置速率限制
- [ ] 已設定日誌記錄和監控
- [ ] 已進行負載測試
- [ ] 已備份數據庫/檔案系統
- [ ] 已實施資料加密
- [ ] 已設定自動備份和恢復機制

---

## 🆘 故障排除

### 問題: CORS 錯誤

**解決方案:**
```python
# 確保 CORS 中間件排在最前面
app.add_middleware(CORSMiddleware, ...)
```

### 問題: 負載過高

**解決方案:**
- 增加 Gunicorn worker 進程數
- 使用負載均衡器（Nginx、HAProxy）
- 啟用快取

### 問題: 記憶體不足

**解決方案:**
- 調整 Gunicorn worker 類型為 `gevent`
- 實施對象池化
- 定期清理舊檔案

---

## 📞 支援資源

- FastAPI 文檔: https://fastapi.tiangolo.com
- Uvicorn 文檔: https://www.uvicorn.org
- Gunicorn 文檔: https://gunicorn.org
- Nginx 文檔: https://nginx.org

---

**最後更新**: 2024年1月15日
