---
name: classroom-room
description: '檢查 /classroom/room 頁面的影音連線、白板操作、課程工具與結束流程。'
argument-hint: '測試並驗證 /classroom/room 頁面的核心教學功能與穩定性'
metadata:
  verified-status: '❌ UNVERIFIED'
  last-verified-date: '2026-03-16'
  architecture-aligned: true
---

# 教室內部頁面檢查技能 (Classroom Room Page Verification)

此技能用於驗證 `/classroom/room` 頁面的核心功能，包含 Agora 影音連線、互動白板、教學工具面板及課程管理功能。

## 功能檢查清單

### 1. Agora 影音連線
- **架構背景**：整合 Agora Web SDK，位於 `lib/agora/`。
- **要求**：進入頁面後應自動加入頻道並嘗試連線。
- **驗證方式**：
  - 檢查 `ClientClassroom.tsx` 中的連線日誌。
  - 確認音訊/視訊切換按鈕功能正常。
  - 驗證對方進入後，畫面/聲音能正確同步。

### 2. 互動白板 (Interactive Whiteboard)
- **要求**：老師與學生可以同步繪圖、書寫、使用圖形工具。
- **功能點**：
  - 選取工具（筆、橡皮擦、文字、形狀）。
  - PDF 上傳與同步顯示（僅限老师）。
  - 多頁切換與同步。
- **驗證方式**：
  - 在一方繪圖，確認另一方即時看到。
  - 老師上傳 PDF，確認雙方都看到 PDF 內容且能同步翻頁。

### 3. 教學工具與 UI 控制
- **要求**：提供穩定且直覺的操控介面。
- **功能點**：
  - 聊天室功能。
  - 舉手功能 (Hand raise)。
  - 課程時間計時器。
  - 螢幕共享。
- **驗證方式**：
  - 點擊聊天按鈕，發送訊息。
  - 檢查計時器是否正確倒數且在 0 分鐘時觸發提醒。

### 4. 結束課程流程
- **要求**：老師點擊「結束課程」時，應彈出確認視窗，並正確扣除/更新點數狀態（若有連動）。
- **驗證方式**：
  - 點擊「離開」或「結束課程」按鈕。
  - 確認頁面跳轉至 `/student_courses` 或 `/teacher_courses`。
  - 驗證後端 API `/api/enrollments/complete` (若存在) 被正確呼叫。

### 5. 課程時間同步與倒數修復
- **核心邏輯**：課堂時間由 `ClientClassroom` 初始化並透過 `/api/classroom/session` 同步給所有參與者。
- **排除能力**：
  - **時間不一致**：若老師與學生看到的剩餘時間不同，檢查 `localStorage` 中的 `class_end_ts_<uuid>`。
  - **意外結束**：若 Session 在寬限期內結束，需檢查老師端是否觸發了 `action: 'clear'`。
  - **點數連動**：確保倒數結束時，`remainingSeconds` 有正確透過 `PATCH /api/orders` 回寫。

## 相關檔案
- `/app/classroom/room/page.tsx` - 入口元件
- `/app/classroom/ClientClassroom.tsx` - 核心教室邏輯 (大組件)
- `/components/Whiteboard/` - 白板相關組件
- `/lib/agora/` - Agora SDK 封裝
