from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
from datetime import datetime
import logging

# 設定日誌
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="藥品影像分析 API",
    description="接收 LINE LIFF 的使用者訊息與藥品圖片",
    version="1.0.0"
)

# ================== CORS 設定 ==================
# 允許 LINE LIFF 應用存取
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:8000",
    "https://liff.line.me",
    "https://*.liff.line.me",
    "*"  # 允許所有來源（生產環境建議改為特定 LIFF URL）
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允許所有來源
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================== 設定常數 ==================
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png"}
UPLOAD_DIR = "uploads"

# 建立上傳目錄（如果不存在）
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ================== 工具函式 ==================
def validate_image_file(file: UploadFile) -> dict:
    """
    驗證上傳的圖片檔案
    
    Args:
        file: 上傳的檔案
        
    Returns:
        dict: 驗證結果 {"valid": bool, "error": str or None}
    """
    # 檢查 MIME type
    if file.content_type not in ALLOWED_MIME_TYPES:
        return {
            "valid": False,
            "error": f"不支援的檔案格式。僅支援: {', '.join(ALLOWED_MIME_TYPES)}"
        }
    
    # 檢查檔案名稱副檔名
    if file.filename:
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in {".jpg", ".jpeg", ".png"}:
            return {
                "valid": False,
                "error": "檔案副檔名不符。僅支援 .jpg, .jpeg, .png"
            }
    
    return {"valid": True, "error": None}


async def validate_file_size(file: UploadFile) -> dict:
    """
    驗證檔案大小
    
    Args:
        file: 上傳的檔案
        
    Returns:
        dict: 驗證結果 {"valid": bool, "error": str or None, "size": int}
    """
    # 讀取檔案內容以檢查大小
    contents = await file.read()
    file_size = len(contents)
    
    # 重置檔案指標到開始位置
    await file.seek(0)
    
    if file_size > MAX_FILE_SIZE:
        return {
            "valid": False,
            "error": f"檔案過大。最大允許大小: {MAX_FILE_SIZE / (1024*1024)}MB，實際: {file_size / (1024*1024):.2f}MB",
            "size": file_size
        }
    
    return {"valid": True, "error": None, "size": file_size}


def generate_filename(original_filename: str) -> str:
    """
    產生唯一的檔案名稱
    
    Args:
        original_filename: 原始檔案名稱
        
    Returns:
        str: 產生的檔案名稱
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_ext = os.path.splitext(original_filename)[1]
    return f"medication_{timestamp}{file_ext}"


# ================== API 端點 ==================

@app.get("/health")
async def health_check():
    """健康檢查端點"""
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat()
    }


@app.post("/api/v1/medication/analyze")
async def analyze_medication(
    image_file: UploadFile = File(...),
    user_message: str = Form("")
):
    """
    分析藥品圖片
    
    Args:
        image_file: 上傳的藥品圖片 (必需)
        user_message: 使用者訊息 (選擇性)
        
    Returns:
        dict: 處理結果
        
    範例請求 (Python requests):
        ```python
        import requests
        
        with open("medication.jpg", "rb") as f:
            files = {"image_file": f}
            data = {"user_message": "這是阿斯匹靈"}
            response = requests.post(
                "http://localhost:8000/api/v1/medication/analyze",
                files=files,
                data=data
            )
            print(response.json())
        ```
    """
    try:
        logger.info(f"接收到上傳請求 - 檔案: {image_file.filename}")
        
        # ========== 檔案類型驗證 ==========
        mime_validation = validate_image_file(image_file)
        if not mime_validation["valid"]:
            logger.warning(f"檔案類型驗證失敗: {mime_validation['error']}")
            raise HTTPException(
                status_code=400,
                detail={
                    "status": "error",
                    "message": mime_validation["error"],
                    "error_type": "invalid_mime_type"
                }
            )
        
        # ========== 檔案大小驗證 ==========
        size_validation = await validate_file_size(image_file)
        if not size_validation["valid"]:
            logger.warning(f"檔案大小驗證失敗: {size_validation['error']}")
            raise HTTPException(
                status_code=400,
                detail={
                    "status": "error",
                    "message": size_validation["error"],
                    "error_type": "file_too_large"
                }
            )
        
        # ========== 產生新檔案名稱並儲存 ==========
        new_filename = generate_filename(image_file.filename)
        file_path = os.path.join(UPLOAD_DIR, new_filename)
        
        # 讀取並儲存檔案
        contents = await image_file.read()
        with open(file_path, "wb") as f:
            f.write(contents)
        
        logger.info(f"檔案成功儲存: {file_path} (大小: {size_validation['size']} bytes)")
        
        # ========== 回傳成功響應 ==========
        return JSONResponse(
            status_code=200,
            content={
                "status": "success",
                "message": "圖片已接收並驗證成功",
                "data": {
                    "filename": new_filename,
                    "original_filename": image_file.filename,
                    "file_size": size_validation["size"],
                    "file_size_mb": round(size_validation["size"] / (1024*1024), 2),
                    "mime_type": image_file.content_type,
                    "user_message": user_message if user_message else None,
                    "upload_timestamp": datetime.now().isoformat(),
                    "file_path": file_path
                }
            }
        )
    
    except HTTPException:
        # 直接拋出 HTTPException
        raise
    
    except Exception as e:
        # 捕捉其他未預期的錯誤
        logger.error(f"處理請求時發生錯誤: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": "伺服器內部錯誤",
                "error_type": "internal_server_error",
                "detail": str(e)
            }
        )


@app.get("/api/v1/status")
async def get_status():
    """取得 API 狀態"""
    return {
        "status": "online",
        "service": "藥品影像分析 API",
        "version": "1.0.0",
        "max_file_size_mb": MAX_FILE_SIZE / (1024*1024),
        "allowed_formats": list(ALLOWED_MIME_TYPES),
        "timestamp": datetime.now().isoformat()
    }


# ================== 錯誤處理 ==================
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """自訂 HTTP 例外處理"""
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.detail if isinstance(exc.detail, dict) else {
            "status": "error",
            "message": exc.detail,
            "status_code": exc.status_code
        }
    )


# ================== 主程式 ==================
if __name__ == "__main__":
    import uvicorn
    
    # 開發環境運行設定
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
