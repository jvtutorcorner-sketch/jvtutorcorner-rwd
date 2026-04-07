# Image Analysis Skill 使用指南

本技能允許你上傳 UI 截圖，並利用 AI 視覺模型（Gemini）根據自定義的 Markdown Prompt 生成測試案例或分析報告。

## 1. 目錄結構
- [SKILL.md](file:///d:/jvtutorcorner-rwd/.agents/skills/image-analysis/SKILL.md): 技能核心定義。
- [prompts/test-case-generator.md](file:///d:/jvtutorcorner-rwd/.agents/skills/image-analysis/prompts/test-case-generator.md): 預設的 UI 轉 Playwright 測試案例 Prompt。
- [scripts/analyze-image.js](file:///d:/jvtutorcorner-rwd/.agents/skills/image-analysis/scripts/analyze-image.js): 執行分析的工具腳本。

## 2. 快速測試方法
你可以透過以下指令測試現有的截圖：

```powershell
node .agents\skills\image-analysis\scripts\analyze-image.js teacher_courses_failed.png .agents\skills\image-analysis\prompts\test-case-generator.md
```

## 3. 測試結果範例
分析完成後，結果會儲存於 `analysis_output.json`。以下是本次測試的摘要：

- **識別頁面**: 教師課程訂單與排程頁面
- **生成腳本**: 包含登入驗證、搜尋功能驗證以及「進入教室」按鈕行為測試。
- **關鍵觀察**: 建議針對日期輸入框與課程卡片增加 `data-testid` 以提高測試穩定性。

## 4. 如何擴充
若要增加新的分析模式（例如 SEO 檢查），只需在 `prompts/` 目錄下建立新的 `.md` 檔案，並在執行腳本時指定該路徑即可。
