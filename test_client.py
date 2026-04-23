"""
測試用客戶端 - 用於測試藥品影像分析 API
"""

import requests
import os
import json
from pathlib import Path
from typing import Optional

# API 基礎 URL
BASE_URL = "http://localhost:8000"

# 顏色輸出（用於終端美化）
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'


def print_header(text: str):
    """列印標題"""
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}")
    print(f"  {text}")
    print(f"{'='*60}{Colors.RESET}\n")


def print_success(text: str):
    """列印成功訊息"""
    print(f"{Colors.GREEN}✓ {text}{Colors.RESET}")


def print_error(text: str):
    """列印錯誤訊息"""
    print(f"{Colors.RED}✗ {text}{Colors.RESET}")


def print_info(text: str):
    """列印資訊"""
    print(f"{Colors.YELLOW}ℹ {text}{Colors.RESET}")


def print_json(data: dict, indent: int = 2):
    """列印格式化的 JSON"""
    print(json.dumps(data, ensure_ascii=False, indent=indent))


class MedicationAPIClient:
    """藥品影像分析 API 客戶端"""
    
    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url
        self.session = requests.Session()
    
    def health_check(self) -> dict:
        """健康檢查"""
        try:
            response = self.session.get(f"{self.base_url}/health")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print_error(f"健康檢查失敗: {str(e)}")
            return None
    
    def get_status(self) -> dict:
        """取得 API 狀態"""
        try:
            response = self.session.get(f"{self.base_url}/api/v1/status")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print_error(f"狀態檢查失敗: {str(e)}")
            return None
    
    def analyze_medication(
        self,
        image_path: str,
        user_message: Optional[str] = None
    ) -> dict:
        """
        分析藥品圖片
        
        Args:
            image_path: 圖片檔案路徑
            user_message: 使用者訊息（可選）
            
        Returns:
            dict: 回應資料
        """
        # 檢查檔案是否存在
        if not os.path.exists(image_path):
            print_error(f"檔案不存在: {image_path}")
            return None
        
        # 檢查檔案大小
        file_size = os.path.getsize(image_path)
        file_size_mb = file_size / (1024 * 1024)
        print_info(f"檔案大小: {file_size_mb:.2f}MB")
        
        try:
            # 準備檔案
            with open(image_path, "rb") as f:
                files = {"image_file": f}
                data = {}
                
                if user_message:
                    data["user_message"] = user_message
                
                # 發送請求
                print_info("發送請求中...")
                response = self.session.post(
                    f"{self.base_url}/api/v1/medication/analyze",
                    files=files,
                    data=data
                )
                
                # 處理回應
                result = response.json()
                result["status_code"] = response.status_code
                
                return result
        
        except Exception as e:
            print_error(f"上傳失敗: {str(e)}")
            return None


def test_health_check():
    """測試健康檢查"""
    print_header("測試 1: 健康檢查")
    
    client = MedicationAPIClient()
    result = client.health_check()
    
    if result:
        print_success("健康檢查成功")
        print_json(result)
    else:
        print_error("無法連接到 API")
        print_info("請確保應用已運行: python main.py")


def test_get_status():
    """測試取得狀態"""
    print_header("測試 2: 取得 API 狀態")
    
    client = MedicationAPIClient()
    result = client.get_status()
    
    if result:
        print_success("狀態查詢成功")
        print_json(result)
    else:
        print_error("無法取得狀態")


def test_analyze_with_sample_image():
    """使用範例圖片測試分析"""
    print_header("測試 3: 上傳藥品圖片")
    
    # 指定測試圖片路徑
    # 你可以修改這個路徑指向實際的圖片
    sample_image_dir = Path(__file__).parent / "sample_images"
    
    # 如果沒有 sample_images 目錄，試試看是否有其他常見位置
    if not sample_image_dir.exists():
        print_info(f"未找到範例圖片目錄: {sample_image_dir}")
        print_info("請將測試圖片放在專案目錄中")
        
        # 嘗試查找任何 JPG 或 PNG 檔案
        current_dir = Path(__file__).parent
        images = list(current_dir.glob("*.jpg")) + list(current_dir.glob("*.png"))
        
        if images:
            image_path = str(images[0])
            print_info(f"found image: {image_path}")
        else:
            print_error("沒有找到可用的測試圖片")
            print_info("測試跳過")
            return
    else:
        # 查找 sample_images 目錄中的圖片
        images = list(sample_image_dir.glob("*.jpg")) + list(sample_image_dir.glob("*.png"))
        
        if not images:
            print_error(f"在 {sample_image_dir} 中沒有找到圖片")
            return
        
        image_path = str(images[0])
    
    client = MedicationAPIClient()
    result = client.analyze_medication(
        image_path=image_path,
        user_message="這是阿斯匹靈"
    )
    
    if result:
        status_code = result.pop("status_code")
        
        if 200 <= status_code < 300:
            print_success(f"圖片上傳成功 (HTTP {status_code})")
        else:
            print_error(f"上傳失敗 (HTTP {status_code})")
        
        print_json(result)
    else:
        print_error("上傳失敗")


def test_invalid_file():
    """測試上傳無效檔案"""
    print_header("測試 4: 上傳無效檔案（測試錯誤處理）")
    
    # 建立臨時文字檔案
    temp_file = "temp_test.txt"
    with open(temp_file, "w") as f:
        f.write("This is not an image")
    
    try:
        client = MedicationAPIClient()
        result = client.analyze_medication(
            image_path=temp_file,
            user_message="測試無效檔案"
        )
        
        if result:
            status_code = result.pop("status_code")
            
            if status_code != 200:
                print_success(f"正確的錯誤處理 (HTTP {status_code})")
                print_json(result)
            else:
                print_error("應該返回錯誤但返回了成功")
        else:
            print_error("請求失敗")
    finally:
        # 清理臨時檔案
        if os.path.exists(temp_file):
            os.remove(temp_file)


def test_missing_file():
    """測試上傳不存在的檔案"""
    print_header("測試 5: 上傳不存在的檔案")
    
    client = MedicationAPIClient()
    result = client.analyze_medication(
        image_path="/nonexistent/path/image.jpg"
    )
    
    if result is None:
        print_success("正確處理缺失檔案")
    else:
        print_error("應該返回 None")


def run_all_tests():
    """運行所有測試"""
    print_header("開始測試藥品影像分析 API")
    
    print(f"{Colors.BOLD}基礎連接性測試:{Colors.RESET}")
    test_health_check()
    test_get_status()
    
    print(f"\n{Colors.BOLD}功能測試:{Colors.RESET}")
    test_analyze_with_sample_image()
    
    print(f"\n{Colors.BOLD}錯誤處理測試:{Colors.RESET}")
    test_invalid_file()
    test_missing_file()
    
    print_header("所有測試完成")


def interactive_test():
    """互動式測試"""
    print_header("藥品影像分析 API - 互動式測試")
    
    while True:
        print("\n選擇一個測試:")
        print("1. 健康檢查")
        print("2. 取得 API 狀態")
        print("3. 上傳藥品圖片")
        print("4. 執行所有測試")
        print("0. 退出")
        
        choice = input("\n請輸入選項 (0-4): ").strip()
        
        if choice == "1":
            test_health_check()
        elif choice == "2":
            test_get_status()
        elif choice == "3":
            image_path = input("請輸入圖片路徑: ").strip()
            user_message = input("請輸入使用者訊息 (可選，直接按 Enter 跳過): ").strip()
            
            client = MedicationAPIClient()
            result = client.analyze_medication(
                image_path=image_path,
                user_message=user_message if user_message else None
            )
            
            if result:
                print_json(result)
        elif choice == "4":
            run_all_tests()
        elif choice == "0":
            print_info("退出測試程式")
            break
        else:
            print_error("無效選項")


if __name__ == "__main__":
    import sys
    
    print(f"\n{Colors.BOLD}{Colors.BLUE}🏥 藥品影像分析 API 測試工具{Colors.RESET}\n")
    
    # 檢查命令行參數
    if len(sys.argv) > 1:
        if sys.argv[1] == "--auto":
            # 自動運行所有測試
            run_all_tests()
        elif sys.argv[1] == "--interactive":
            # 互動式測試
            interactive_test()
        else:
            print_error(f"未知參數: {sys.argv[1]}")
            print_info("使用方法:")
            print_info("  python test_client.py          # 執行所有測試")
            print_info("  python test_client.py --auto   # 自動執行所有測試")
            print_info("  python test_client.py --interactive  # 互動式測試")
    else:
        # 預設執行所有測試
        run_all_tests()
