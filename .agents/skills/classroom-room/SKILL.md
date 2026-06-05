---
name: classroom-room
description: '檢查 /classroom/room 頁面的影音連線、白板操作、課程工具與結束流程。包含 PDF 同步與倒數精準度驗證。'
argument-hint: '測試並驗證 /classroom/room 頁面的核心教學功能與穩定性'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-06-05'
  architecture-aligned: true
---

# 教室內部頁面檢查技能 (Classroom Room Page Verification)

此技能用於驗證 `/classroom/room` 頁面的核心功能，包含 Agora 影音連線、互動白板、PDF 同步、教學工具面板及課程管理功能。

## Mobile Optimization Standard (iOS & Android)

在設計或除錯移動端 UI 時，必須同時驗證 WebKit（iOS Safari）與 Blink（Android Chrome）的一致性：

1. **高度適應**：禁止單純使用 `100vh` 定位全螢幕元素。必須優先考慮動態視窗單位（`dvh`/`svh`）或使用 JS 動態計算 `--vh`，避免 iOS/Android 瀏覽器工具列遮擋內容。
2. **邊距緩衝**：所有 Fixed/Absolute 且貼齊邊緣的元素，必須使用 `env(safe-area-inset-top)`、`env(safe-area-inset-bottom)`、`env(safe-area-inset-left)`、`env(safe-area-inset-right)`。
3. **寬度防禦**：避免在移動端使用 `vw` 定義主要容器寬度，改用 `%`、`max-width` 或 `calc(100% - padding)`，避免 Android 捲軸導致水平溢出。
4. **渲染測試**：修復與驗證步驟必須同時覆蓋 Safari（iOS）與 Chrome（Android），不得僅在單一引擎驗收。

---

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
  - 選取工具（筆、橡皮擦）。
  - PDF 上傳與同步顯示（僅限老師）。
  - 多頁切換與同步。
- **驗證方式**：
  - 在一方繪圖，確認另一方即時看到。
  - 老師上傳 PDF，確認雙方都看到 PDF 內容且能同步翻頁。

### 3. 教學工具與 UI 控制
- **要求**：提供穩定且直覺的操控介面。
- **功能點**：
  - 課程時間計時器。
- **驗證方式**：
  - 點擊聊天按鈕，發送訊息。
  - 檢查計時器是否正確倒數且在 0 分鐘時觸發提醒。

### 4. 結束課程流程
- **要求**：老師點擊「結束課程」時，應彈出確認視窗，並正確更新倒數時間狀態（若有連動）。
- **驗證方式**：
  - 點擊「離開」或「結束課程」按鈕。
  - 確認頁面跳轉至 `/student_courses` 或 `/teacher_courses`。
  - 驗證後端 API `/api/enrollments/complete` (若存在) 被正確呼叫。

### 5. 課程時間同步與倒數修復
- **核心邏輯**：課堂時間由 `ClientClassroom` 初始化並透過 `/api/classroom/session` 同步給所有參與者。
- **排除能力**：
  - **時間不一致**：若老師與學生看到的剩餘時間不同，檢查 `localStorage` 中的 `class_end_ts_<uuid>`。
  - **計時器消失修復**：計時器已解耦對 `fullyInitialized` (白板載入) 的依賴。只要 `joined` 且 `orderFetchComplete` 為真，計時器就會啟動，避免因白板初始化延遲導致 UI 顯示 null。
  - **意外結束**：若 Session 在寬限期內結束，需檢查老師端是否觸發了 `action: 'clear'`。
  - **點數連動**：確保倒數結束時，`remainingSeconds` 有正確透過 `PATCH /api/orders` 回寫。

---

## PDF 同步驗證 (PDF Sync Verification)

### 靜態測試用 PDF 資產

專案已在 `public/test-pdfs/` 預放置測試用 PDF，可直接以 URL 引用，無需動態產生：

| 檔案 | 頁數 | 用途 |
|------|------|------|
| `public/test-pdfs/test-single-page.pdf` | 1 | 單頁 PDF 渲染基本測試 |
| `public/test-pdfs/test-multi-page.pdf`  | 5 | 多頁翻頁同步測試 |
| `public/test-pdfs/test-long-doc.pdf`    | 10 | 長文件跳頁驗證 |
| `public/test-pdfs/test-blank.pdf`       | 1 | 空白頁邊界測試 |

**在 E2E 測試中使用靜態 PDF（推薦）**：
```typescript
import fs from 'fs';
import path from 'path';

// 直接讀取 public 目錄的 PDF，避免每次動態產生
const pdfBuffer = fs.readFileSync(
  path.join(process.cwd(), 'public', 'test-pdfs', 'test-multi-page.pdf')
);
await fileInput.setInputFiles({
  name: 'test-multi-page.pdf',
  mimeType: 'application/pdf',
  buffer: pdfBuffer,
});
```

**透過 HTTP URL 使用（伺服器端上傳場景）**：
```
http://localhost:3000/test-pdfs/test-multi-page.pdf
```

---

### PDF 同步核心驗證邏輯

#### Scene State 讀取
Agora Whiteboard SDK 將 PDF 頁面映射為 Room Scenes。透過 `window.agoraRoom` 取得當前狀態：

```typescript
async function getRoomSceneState(page: Page): Promise<{
  scenePath: string;
  index: number;
  sceneCount: number;
} | null> {
  return page.evaluate(() => {
    const room = (window as any).agoraRoom;
    const sceneState = room?.state?.sceneState;
    if (!sceneState) return null;
    return {
      scenePath: String(sceneState.scenePath || ''),
      index: Number(sceneState.index || 0),
      sceneCount: Array.isArray(sceneState.scenes) ? sceneState.scenes.length : 0,
    };
  });
}
```

#### 等待 PDF Scene 載入
```typescript
async function waitForPdfSceneLoaded(page: Page, timeoutMs = 120000) {
  // 等待 scenePath 包含 '/pdf/' 表示 PDF 已被載入為 scene
  await page.waitForFunction(() => {
    const room = (window as any).agoraRoom;
    const scenePath = room?.state?.sceneState?.scenePath;
    return typeof scenePath === 'string' && scenePath.includes('/pdf/');
  }, { timeout: timeoutMs });
}
```

#### 翻頁同步驗證（Teacher → Student）
```typescript
// 老師切換到第 2 頁（index=1）
await page.evaluate((idx) => {
  (window as any).agoraRoom?.setSceneIndex(idx);
}, 1);

// 等待雙方 scene index 一致（poll 確認）
await expect.poll(async () => {
  const state = await getRoomSceneState(studentPage);
  return state?.index ?? -1;
}, { timeout: 30000, intervals: [500, 1000] }).toBe(1);
```

#### PDF 元數據確認（上傳後 server 端檢查）
```typescript
// 確認 PDF 已被 API 接收
const res = await page.request.get(
  `${baseUrl}/api/whiteboard/pdf?uuid=${encodeURIComponent(sessionKey)}&check=1`
);
const json = await res.json();
expect(json.found).toBe(true);
```

---

### PDF 同步驗證檢查清單

| # | 驗證項目 | 對應 API / 機制 | 預期結果 |
|---|---------|----------------|---------|
| 1 | PDF 上傳成功 | `POST /api/whiteboard/pdf` | 回應 dialog `PDF 上傳成功` |
| 2 | 上傳後 metadata 可查 | `GET /api/whiteboard/pdf?check=1` | `found: true` |
| 3 | 老師端 PDF 渲染 | `window.agoraRoom.state.sceneState.scenePath` | 包含 `/pdf/` |
| 4 | 學生端收到同步 | 同上（學生 page） | 與老師 `scenePath` 一致 |
| 5 | 初始頁 index 為 0 | `sceneState.index` | `=== 0` |
| 6 | 總頁數正確 | `sceneState.scenes.length` | `≥ PDF 實際頁數` |
| 7 | 翻至第 2 頁同步 | `setSceneIndex(1)` | 學生端 index 更新為 1 |
| 8 | 翻至最後頁同步 | `setSceneIndex(N-1)` | 雙方一致 |
| 9 | 翻回第 1 頁同步 | `setSceneIndex(0)` | 雙方 index 回到 0 |
| 10 | 單頁 PDF 無翻頁按鈕 | DOM 查詢 `button[title="下一頁"]` | `count === 0` |

---

## 倒數精準度驗證 (Countdown Precision)

### 驗證要點

| 項目 | 標準 |
|------|------|
| 初始倒數誤差 | `observedSeconds ≤ expectedSeconds + 1`（無 +5s offset） |
| 師生倒數差值 | `abs(teacherSeconds - studentSeconds) ≤ 6s` |
| 12 秒後遞減量 | `6s ≤ drop ≤ 25s`（確認有在倒數） |
| 單調遞減 | 每個採樣點均 `< 前一次採樣` |

### 倒數讀取策略

優先從可見元素中讀取最接近預期值的倒數數字（`MM:SS` 格式），排除不可見元素（`display:none`, `visibility:hidden`, size=0）：

```typescript
// 取最接近 targetSeconds 的可見倒數
async function readCountdownSecondsNearest(page: Page, targetSeconds: number) {
  const candidates = await page.evaluate(() => {
    const isVisible = (el: Element) => {
      const style = getComputedStyle(el);
      const rect = (el as HTMLElement).getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && rect.width > 0 && rect.height > 0;
    };
    return Array.from(document.querySelectorAll('div, span, strong'))
      .filter(isVisible)
      .map(el => el.textContent?.trim() || '')
      .filter(t => /^\d+:[0-5]\d$/.test(t))
      .map(t => { const [m, s] = t.split(':'); return +m * 60 + +s; });
  });
  // return element nearest to targetSeconds
}
```

---

## 子測試對應關係

| Spec 檔案 | 測試案例 | 狀態 |
|-----------|---------|------|
| `e2e/classroom/06_room_pdf_sync_countdown.spec.ts` | 單頁 PDF 渲染 + 倒數無偏移 | ✅ 已實作 |
| `e2e/classroom/06_room_pdf_sync_countdown.spec.ts` | 多頁 PDF 翻頁師生同步 | ✅ 已實作 |
| `e2e/classroom/06_room_pdf_sync_countdown.spec.ts` | 倒數連續遞減 + 師生一致 | ✅ 已實作 |
| `e2e/classroom/05_wait_pdf_upload.spec.ts` | Wait 頁 PDF 上傳流程 | ✅ 已實作 |
| `e2e/classroom/07_room_pdf_sync_stress.spec.ts` | 多組同時上傳 PDF 翻頁同步壓力測試 | ✅ 已實作 |

### 執行指令
```powershell
# 執行 PDF 同步 + 倒數測試（單組，僅 chromium）
npx playwright test e2e/classroom/06_room_pdf_sync_countdown.spec.ts --project=chromium

# 執行 Wait 頁上傳測試
npx playwright test e2e/classroom/05_wait_pdf_upload.spec.ts --project=chromium

# 執行多組並行 PDF 同步壓力測試（預設 3 組）
$env:CONCURRENT_GROUPS="3"; npx playwright test e2e/classroom/07_room_pdf_sync_stress.spec.ts --project=chromium

# 執行全部教室相關測試
npx playwright test e2e/classroom/ --project=chromium
```


---

## 相關檔案

- `/app/classroom/room/page.tsx` - 入口元件
- `/app/classroom/ClientClassroom.tsx` - 核心教室邏輯 (大組件)
- `/components/Whiteboard/` - 白板相關組件
- `/lib/agora/` - Agora SDK 封裝
- `/app/api/whiteboard/pdf/route.ts` - PDF 上傳與元數據 API
- `/app/api/whiteboard/room/route.ts` - 房間 UUID 建立 API
- `public/test-pdfs/` - E2E 測試用靜態 PDF 資產

## 已知問題與排除

### PDF Scene 載入超時
- **原因**：Agora Whiteboard 首次建立 Room 需要額外時間（CDN 冷啟動）。
- **解法**：`waitForPdfSceneLoaded` 設定 `timeoutMs = 120000`，允許最多 2 分鐘等待。

### 師生 Scene 不同步
- **診斷**：檢查兩個 page 的 `window.agoraRoom.state.sceneState.scenePath` 是否一致。
- **原因**：BroadcastChannel 在 Playwright 不同 context 間不共享；需依賴 Agora WebSocket 同步。
- **解法**：確保雙方都 join 同一個 `roomToken`，並等待 WebSocket 連線穩定後再翻頁。

### 倒數偏移 +5 秒
- **原因**：`ClientClassroom.tsx` 的 session 初始化有 5 秒寬限期 buffer。
- **修復確認**：`observedSeconds ≤ expectedSeconds + 1`，若 > 1 則需檢查 session 寬限期邏輯。
