---
name: learning-content-analysis
description: 教學教材與課程內容影像分析模型的資料標記、訓練、ONNX 部署與驗證指南。Use when building or updating image analysis for textbooks, worksheets, diagrams, slides, handwritten notes, OCR, or learning-content feedback in JV Tutor Corner.
metadata:
  verified-status: '⚠️ PARTIAL'
  last-verified-date: '2026-08-08'
  architecture-aligned: true
  notes: '已對齊教材影像分析入口、AI service、OCR/標記文件與學習問卷；仍缺正式模型 provider contract、PDF pipeline、結果持久化與完整課程 fixture。'
---

# 教學教材影像分析模型 Skill

本 skill 聚焦教學教材與課程內容分析，不處理藥品辨識、商品掃描或掃描換點數。

## 模組責任

- 分析教材、題目、投影片、圖表、手寫筆記與課堂截圖。
- 擷取可確認的文字、標題、重點概念與內容摘要。
- 產生學習理解檢核問題與答案提示，不直接取代老師判斷。
- 支援圖片分析 provider 與未來的 OCR／PDF pipeline。
- 不可依圖片結果自動發放點數、修改 Profile 或產生醫療／法律診斷。

## 目前產品入口

- 教材分析頁：`app/learning-content/page.tsx`
- 教材分析 API：`app/api/learning-content-analysis/route.ts`
- 共用分析 service：`lib/learningContentAnalysis.ts`
- 學習需求問卷：`/questionnaire/learning`、`app/questionnaire/[mode]/page.tsx`
- 問卷 API：`app/api/questionnaire/route.ts`
- 舊入口 `/medicine-product`、`/product-scan` 僅保留 redirect 相容性。

## 核心流程

### 1. 資料標記 (Data Labeling)
*   **工具**：[Roboflow](https://roboflow.com/)
*   **標記規範**：
    *   每個類別 (Class) 建議準備 **100-500 張** 圖片。
    *   使用 **Bounding Box** 框住目標物，框選範圍需緊貼物體邊緣。
    *   包含多樣化的教室背景、拍攝角度、光源、紙張、字體與手寫情境。
*   **匯出格式**：選擇 **YOLOv8 PyTorch** 或適合 OCR 的標註格式。

### 2. 模型訓練 (Model Training)
*   **環境**：[Google Colab](https://colab.research.google.com/) (建議開啟 T4 GPU)。
*   **套件**：使用 `ultralytics` 框架。
*   **訓練配置**：
    *   模型選擇：`yolov8n.pt` (Nano 版本)，為了前端效能考量。
    *   訓練指令：參考 `scripts/train-yolov8-colab.py`，並以教材／圖表／題目類別設定資料集。
    *   解析度：建議設定為 `imgsz=640`。

### 3. 模型部署 (Export & Deployment)
*   **匯出 ONNX**：在訓練結束後，將 `.pt` 權重轉為 `.onnx`。
    ```python
    model.export(format='onnx', imgsz=640, simplify=True)
    ```
*   **專案整合**：
    *   將產出的 `best.onnx` 放入專案的 `public/models/` 目錄。
    *   在教材分析頁 (`app/learning-content/page.tsx`) 或受控的分析 service 中載入模型；不可由舊商品掃描頁發放點數。

## 目錄結構
- `SKILL.md`: 技能說明與流程。
- `scripts/`:
  - `train-yolov8-colab.py`: 適用於 Colab 的訓練程式碼範本。
  - `export-onnx.py`: 權重轉換指令參考。
- `docs/`:
  - `labeling-guide.md`: 教材、題目、圖表與手寫筆記標記規範。

## 使用案例
- **教材內容整理**：辨識教材章節、關鍵概念與可讀文字，產生課後複習摘要。
- **學習檢核**：根據題目、圖表或筆記產生理解問題與答案提示，交由學員或老師確認。

## 快速檢核清單 (Checklist)
- [ ] 每個教材類別是否都有足夠的不同角度、光線、解析度與手寫／印刷樣本？
- [ ] 匯出時是否有勾選 `simplify=True`？（若未勾選，手機瀏覽器執行速度會極慢）
- [ ] **是否已建立 `public/models/` 目錄並確認前端可透過 HTTP 存取？**
- [ ] 是否已將 .onnx 模型放入 `/public/models`？
- [ ] 低信心或無法辨識結果是否回傳 `unknown`，而不是猜測？
- [ ] 分析流程是否沒有修改學員點數、角色或其他 Profile 欄位？
