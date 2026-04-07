---
name: image-analysis
description: 使用 AI 視覺模型分析 UI 截圖，並根據指定的 Prompt Markdown 檔案生成測試案例或分析報告。
---

# Image Analysis Skill

負責處理圖片上傳與 AI 視覺分析流程。此技能可將 UI 截圖轉換為可執行的測試腳本（如 Playwright）或頁面分析報告。

## 核心功能
1. **圖片上傳分析**: 支援 Base64 圖片資料傳遞至 Gemini/OpenAI/Anthropic 視覺模型。
2. **教室身份調度 (UUID Mapping)**: 整合 `/api/whiteboard/uuid`，支援透過 `courseId` 自動檢索對應的白板數據，實現一鍵自動化分析報告。
3. **白板與 PDF 解析**: 支援分析 `.pdf` 文件與電子白板截圖，語義化辨識講義內容與手寫標註（Strokes）。
4. **課後自動總結 (Lesson Summarization)**: 識別老師在講義上的畫記（Strokes），調用 `/api/whiteboard/room` 獲取師生背景資訊，產出更具親和力的 JSON 診斷報告。
5. **批量分析 (Batch Processing)**: 支援同時傳送多張截圖或 PDF 頁面，大省 Token。
6. **離線分析支援 (Offline Robustness)**: 搭配 `localforage`，即使課程中斷線也能將截圖與畫記存入本機 IndexedDB，待連線恢復後自動補齊分析。

## 目錄結構
- `SKILL.md`: 技能說明
- `prompts/`: 存放各種分析用的 Prompt Markdown 檔案
  - `test-case-generator.md`: UI 轉測試案例專用 Prompt
  - `figma-test-case-generator.md`: Figma 數據 + UI 截圖生成測試案例專用 Prompt
  - `whiteboard-analyzer.md`: 白板內容與 PDF 解析專用 Prompt
  - `lesson-summarizer.md`: 課後學習成果自動化總結專用 Prompt
- `scripts/`: 輔助工具腳本
  - `analyze-image.js`: 呼叫 API 進行圖片/PDF 分析的測試腳本
  - `offline-sync-logic.js`: 展示如何整合 localforage 與分析流程的示範腳本

## 使用情境
- **自動化測試構思**: 上傳新設計的 UI 截圖，快速生成 Playwright 測試骨架。
- **白板內容驗證**: 上傳白板截圖，驗證 PDF 講義內容與畫記同步。如果是「純白板」模式，則自動切換為手寫 OCR 與圖形識別模式（辨識公式、手繪草圖）。
- **離線穩定課程總結**: 在網路不穩時透過 IndexedDB 暫存截圖，並在課程結束後背景補傳分析。
- **課後總結生成**: 挑選有老師畫記的頁面截圖，合成一份給家長的專業報告。

## 快速開始
1. **純圖片分析**: `node .agents/skills/image-analysis/scripts/analyze-image.js screenshot.png`
2. **批量課後總結**: 
   ```bash
   node .agents/skills/image-analysis/scripts/analyze-image.js page1.jpg,page2.jpg .agents/skills/image-analysis/prompts/lesson-summarizer.md
   ```
3. **離線同步範例**: 參考 `scripts/offline-sync-logic.js` 實作前端緩存。
