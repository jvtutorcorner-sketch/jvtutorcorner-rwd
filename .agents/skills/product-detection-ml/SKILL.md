---
name: product-detection-ml
description: 負責商品/藥品辨識模型的訓練、標記流程與前端 ONNX 部署指南。
---

# Product Detection ML Skill

本技能用於指導如何開發自定義的物件辨識模型（如：藥品、教材、商品），並將其部署至本專案的前端環境。

## 核心流程

### 1. 資料標記 (Data Labeling)
*   **工具**：[Roboflow](https://roboflow.com/)
*   **標記規範**：
    *   每個類別 (Class) 建議準備 **100-500 張** 圖片。
    *   使用 **Bounding Box** 框住目標物，框選範圍需緊貼物體邊緣。
    *   包含多樣化的背景（桌面、手持、地面）與光源（室內、自然光）。
*   **匯出格式**：選擇 **YOLOv8 PyTorch** 格式。

### 2. 模型訓練 (Model Training)
*   **環境**：[Google Colab](https://colab.research.google.com/) (建議開啟 T4 GPU)。
*   **套件**：使用 `ultralytics` 框架。
*   **訓練配置**：
    *   模型選擇：`yolov8n.pt` (Nano 版本)，為了前端效能考量。
    *   訓練指令：參考 `scripts/train-yolov8-colab.py`。
    *   解析度：建議設定為 `imgsz=640`。

### 3. 模型部署 (Export & Deployment)
*   **匯出 ONNX**：在訓練結束後，將 `.pt` 權重轉為 `.onnx`。
    ```python
    model.export(format='onnx', imgsz=640, simplify=True)
    ```
*   **專案整合**：
    *   將產出的 `best.onnx` 放入專案的 `public/models/` 目錄。
    *   在前端頁面 (`app/product-scan/page.tsx`) 引用 `onnxruntime-web` 進行載入。

## 目錄結構
- `SKILL.md`: 技能說明與流程。
- `scripts/`:
  - `train-yolov8-colab.py`: 適用於 Colab 的訓練程式碼範本。
  - `export-onnx.py`: 權重轉換指令參考。
- `docs/`:
  - `labeling-guide.md`: 詳細的藥品標記建議與範例圖示。

## 使用案例
- **藥品掃描點數兌換**：訓練特定藥盒模型，讓學生掃描真實藥盒後獲得點數。
- **教材互動**：掃描課本特定章節或插圖，自動跳轉至對應的數位課程頁面。

## 快速檢核清單 (Checklist)
- [ ] 每個藥品類別是否至少有 100 張不同角度與光影的圖片？
- [ ] 匯出時是否有勾選 `simplify=True`？（若未勾選，手機瀏覽器執行速度會極慢）
- [ ] **是否已建立 `public/models/` 目錄並確認前端可透過 HTTP 存取？**
- [ ] 是否已將 .onnx 模型放入 `/public/models`？
