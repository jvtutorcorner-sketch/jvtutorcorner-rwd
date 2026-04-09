---
name: classroom-room-whiteboard-sync
description: '驗證 /classroom/room 頁面中教師白板繪圖與學生實時同步功能。支援在已報名情況下跳過報名流程，並確保教師與學生分別從等待頁進入教室。'
argument-hint: '執行白板同步驗證測試，確保教師繪圖能同步到學生端。若已報名，會自動跳過報名步驟。'
metadata:
  verified-status: '✅ READY_FOR_TESTING'
  last-verified-date: '2026-04-08'
  architecture-aligned: true
  long-term-fixes-applied:
    - '✅ student_enrollment_flow.spec.ts 已加入 teacherId 綁定邏輯'
    - '✅ 強制課程建立：當設定 TEST_COURSE_ID 時必須建立新課程（而非搜索推薦課程）'
    - '✅ 修復 classroom-wait 雙人同步驗證：'
    - '   - clickReadyButton 序列執行（避免時序問題）'
    - '   - enterClassroom 並行執行（但包含自動跳轉檢測）'
    - '   - 超時時間增加到 60 秒以容納網絡延遲'
  related-skills:
    - auto-login
    - classroom-wait
    - classroom-room
    - student-enrollment-flow
---

# 教室白板同步驗證技能

## 快速啟動 (30 秒)

```bash
cd d:\jvtutorcorner-rwd
npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts --project=chromium
```

**環境前置**：`.env.local` 須包含以下變數（缺一不可）:
```
NEXT_PUBLIC_BASE_URL=http://localhost:3000
LOGIN_BYPASS_SECRET=jv_secure_bypass_2024
TEST_TEACHER_EMAIL=teacher@test.com
TEST_TEACHER_PASSWORD=123456
TEST_STUDENT_EMAIL=student@test.com
TEST_STUDENT_PASSWORD=123456
```

---

## 📊 故障排除快速入門

**若測試失敗，請優先參考** [ERD_DIAGNOSTIC_GUIDE.md](./ERD_DIAGNOSTIC_GUIDE.md)：

- 🔗 **完整 ER 圖**：User → Course → Order → Enrollment → Classroom Session → Whiteboard
- 🚨 **6 個常見故障點**：課程綁定、點數扣除、SSE 同步、Canvas 跨域、自動跳轉、WebSocket 連線
- 🎯 **決策樹**：根據症狀逐步診斷根因，精確定位問題
- 📋 **檢查清單**：執行前驗證環境設定、帳號、清理舊數據
- 🔄 **完整數據流走查**：從學生報名 → 進教室 → 教師繪圖 → 學生看到的全過程

---

## 完整測試流程（6 步驟管線）

測試檔案：[e2e/classroom_room_whiteboard_sync.spec.ts](../../../e2e/classroom_room_whiteboard_sync.spec.ts)

```
步驟 0  [選用] 檢查報名狀態 ─ 若已報名且 TEST_COURSE_ID 已設定，則跳過步驟 0a
   │
   ▼
步驟 0a student-enrollment-flow ─ 建立課程 + 學生報名 + 扣點驗證
   │    (僅在未報名時執行)
   ▼
步驟 1  教師 context ─ autoLogin → goToWaitRoom
   │    (分開登入，確保角色隔離)
   ▼
步驟 2  學生 context ─ autoLogin → goToWaitRoom
   │    (分開登入，確保角色隔離)
   ▼
步驟 3a 教師 + 學生 【序列】在等待頁點擊「準備好」
   │    (驗證 SSE 同步狀態更新)
   ▼
步驟 3b 教師 + 學生 【並行】等待「立即進入教室」→ 進入 /classroom/room
   │    (驗證同步進入教室邏輯)
   ▼
步驟 4  drawOnWhiteboard(教師端) ─ 教師繪圖
   │
   ▼
步驟 5  verifyWhiteboardHasDrawing(學生端) ─ 驗證同步結果
```

**為什麼步驟 3 使用並行執行？**（2026-04-08 修復）
- ✅ 驗證 classroom-wait SKILL 中的「SSE 同步機制」
  - 一方（教師）點擊「準備好」→ 另一方（學生）的頁面應該即時收到 SSE 通知更新狀態
- ✅ 確保「立即進入教室」按鈕在**雙方都準備好**後才出現（而不是單人就觸發）
- ✅ 避免單人提前進入教室，導致白板同步測試失敗

---

## 核心函式速查

下方為 spec 檔案中的核心 helper 函式，修 bug 時直接對照：

| 函式 | 所在步驟 | 職責 | 失敗時檢查 |
|------|---------|------|-----------|
| `autoLogin(page, email, pwd, secret)` | 1, 2 | 填入憑據 → 等 captcha 圖 → bypass → 離開 /login | `.env.local` 變數？captcha 圖片 `img[alt="captcha"]` 是否載入？ |
| `injectDeviceCheckBypass(page)` | 1, 2 (goto 前) | `addInitScript` 注入 `__E2E_BYPASS_DEVICE_CHECK__` | 是否在 `page.goto()` **之前**呼叫？ |
| `goToWaitRoom(page, courseId, role)` | 1, 2 | 課程列表 → 點「進入教室」→ 抵達 `/classroom/wait` | 課程是否存在？「進入教室」按鈕選擇器是否匹配？ |
| `clickReadyButton(page, role)` | 3a | 在 /classroom/wait 點「準備好」，**不進入教室** | 「準備好」按鈕是否可見？點擊後是否留在 /classroom/wait（不自動進入）？ |
| `enterClassroom(page, role)` | 3b | 等待「立即進入教室」按鈕（雙方都 ready 後）→ 進入 /classroom/room | 「立即進入教室」按鈕何時出現？是否需要等待 SSE 同步？ |
| `drawOnWhiteboard(page)` | 4 | 找 canvas → mouse.down/move/up 模擬繪圖 | Canvas 是否可見？boundingBox 為 null？ |
| `verifyWhiteboardHasDrawing(page)` | 5 | getImageData 檢查 alpha > 200 的像素 | Canvas 跨域限制？Agora SDK 未載入？ |

---

## 🎙️ 設備權限檢驗完整指南

### 快速啟動 (30 秒)

```bash
cd d:\jvtutorcorner-rwd
npx playwright test e2e/classroom-wait-device-permissions.spec.ts --project=chromium
```

**新增測試檔**：[e2e/classroom-wait-device-permissions.spec.ts](../../../e2e/classroom-wait-device-permissions.spec.ts)

**測試概覽**: 8 個全面的設備權限與媒體檢查測試用例

| # | 測試名稱 | 驗證項目 | 運行時間 |
|----|---------|--------|--------|
| 1 | Device Permission UI | 權限授予按鈕、設備控制按鈕、檢查部分標題 | ~10s |
| 2 | Microphone Permission | 麥克風權限流程、麦克風按鈕啟用、音量指示 | ~15s |
| 3 | Camera Permission | 攝影機權限流程、視頻元素渲染、預覽功能 | ~15s |
| 4 | Speaker/Audio Output | 聲音測試按鈕、按鈕啟用狀態 | ~10s |
| 5 | Device Check Flow | 權限繞過、就緒按鈕狀態、設備檢查章節 | ~15s |
| 6 | Device Selection | 設備選擇器、設備列表加載、標籤結構 | ~12s |
| 7 | Initial State | 權限授予按鈕存在、按鈕禁用驗證 | ~12s |
| 8 | Concurrent Testing | 教師+學生並發測試、同步狀態、權限 UI | ~20s |

**全部通過時間**: ~110 秒

### 核心實現細節

#### 設備權限繞過機制
```typescript
// 在 page.goto() 之前注入 bypass flag
async function injectDeviceCheckBypass(page: Page): Promise<void> {
  await page.addInitScript(() => { 
    (window as any).__E2E_BYPASS_DEVICE_CHECK__ = true; 
  });
}

// 頁面會讀此 flag（app/classroom/wait/page.tsx L1120+）
useEffect(() => {
  if ((window as any).__E2E_BYPASS_DEVICE_CHECK__) {
    // ✅ 自動授予所有權限，跳過設備檢測
    setPermissionGranted(true);
    setAudioOk(true);
    setVideoOk(true);
    return;
  }
  // ▖ 否則進行正常的 getUserMedia() 檢測
}, []);
```

#### 權限授予流程 (VideoSetup 元件)
位置：[app/classroom/wait/page.tsx](../../app/classroom/wait/page.tsx#L1073) (L1073+)

```typescript
// 1️⃣ 權限請求（結合音頻+視頻）
async function requestPermissions(): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    
    // ✅ 成功：保存設備、枚舉列表、啟用測試按鈕
    setPermissionGranted(true);
    enumerateDevices();  // 填充設備選擇器
    
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      alert('❌ 權限被拒絕。請允許麥克風和攝影機權限。');
    } else if (err.name === 'NotFoundError') {
      alert('❌ 未找到媒體設備。');
    }
  }
}

// 2️⃣ 麥克風測試（頻率分析）
async function startMicTest(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaStreamAudioSource(stream);
  source.connect(analyser);
  
  // 實時更新音量（micLevel state）
  const updateLevel = () => {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    const level = Math.max(...dataArray);
    setMicLevel(level);  // UI 顯示條形圖
  };
  
  const interval = setInterval(updateLevel, 100);
  setTimeout(() => { clearInterval(interval); setAudioTested(true); }, 5000);
}

// 3️⃣ 攝影機預覽
async function startCameraPreview(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: selectedVideoDevice }
  });
  videoRef.current.srcObject = stream;
  setVideoTested(true);  // ✅ 已測試
}

// 4️⃣ 聲音輸出測試（播放）
async function testSpeaker(): Promise<void> {
  const audioContext = new AudioContext();
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);
  
  osc.frequency.value = 440;  // A4 音符
  osc.start();
  setTimeout(() => osc.stop(), 500);
  setAudioOutputTested(true);
}
```

#### 設備存儲 & 自動選擇
```typescript
// localStorage 持久化使用者選擇
const selectedMicFromStorage = localStorage.getItem('selectedMicrophoneId');
if (selectedMicFromStorage) {
  setSelectedAudioInput(selectedMicFromStorage);
}

// 設備列表在頁面加載和設備變更時更新
navigator.mediaDevices.addEventListener('devicechange', () => {
  enumerateDevices();  // 重新掃描 (可能新插入 USB 設備)
});
```

### 設備權限故障排除

#### 問題 1：權限授予按鈕不可見

| 症狀 | 根因 | 修復 |
|------|------|------|
| 按鈕在頁面上找不到 | VideoSetup 元件未渲染 | 檢查 `<VideoSetup>` 是否在 `/classroom/wait` 中引入 |
| 按鈕存在但文本不匹配 | 多語言/UI 變更 | 更新測試中的 `hasText()` 選擇器（目前為 `/授予\|Permission/i`）|
| 點擊後無反應 | `getUserMedia()` 不存在或被阻擋 | 檢查瀏覽器是否允許媒體設備存取權限 |

**快速驗證**（瀏覽器 Console）：
```javascript
// 確認媒體設備 API 可用
console.log(navigator.mediaDevices);  // 應列出 getUserMedia 函式

// 測試權限請求
navigator.mediaDevices.getUserMedia({ audio: true, video: true })
  .then(stream => {
    console.log('✅ Permission granted');
    stream.getTracks().forEach(t => t.stop());
  })
  .catch(err => console.error('❌ Permission denied:', err.name));
```

#### 問題 2：設備測試按鈕被禁用

| 症狀 | 根因 | 修復 |
|------|------|------|
| 所有按鈕（麥克風、攝影機、聲音）都禁用 | `permissionGranted` = false | 點擊「授予權限」按鈕先獲得許可 |
| 只有麥克風禁用 | `audioOk` = false | 檢查麥克風是否連接、是否被其他應用占用 |
| 只有攝影機禁用 | videoOk` = false **or** 未偵測到攝影機 | 檢查攝影機驅動、USB 連接 |
| 聲音輸出禁用 | 未列舉輸出設備 | 檢查系統音訊設定（Windows: 音量混合器） |

**分步驟測試**：
```bash
# 1️⃣ 檢查 /classroom/wait 頁面是否存在 VideoSetup
curl http://localhost:3000/classroom/wait?courseId=test&role=student | grep -i videSetup

# 2️⃣ 查看 page.tsx 中是否正確初始化
grep -n "VideoSetup\|deviceCheckPassed\|requestPermissions" app/classroom/wait/page.tsx

# 3️⃣ 檢查 localStorage 中錯誤的設備ID
# DevTools → Application → localStorage → jvtutorcorner → selectedMicrophone*
```

#### 問題 3：並發教師+學生測試失敗

| 症狀 | 根因 | 修復 |
|------|------|------|
| 一個頁面加載成功，另一個卡住 | BrowserContext 隔離問題 | 確保兩個 context 獨立建立，不共享 cookie/storage |
| 兩個頁面都加載，但設備權限不同步 | 設計限制（正常行為） | 每個 context 有獨立的媒體設備權限狀態 |
| 等待參與者狀態未同步 | SSE 連線問題 | 檢查 `/api/classroom/stream` 是否正常工作 |

**Test 8 關鍵邏輯**：
```typescript
// 教師和學生各自獨立的 context（完全隔離）
const teacherContext = await browser.newContext();
const studentContext = await browser.newContext();

// 各自獨立登入、導航
await injectDeviceCheckBypass(teacherPage);
await autoLogin(teacherPage, teacherEmail, ...);
await navigateToWaitPage(teacherPage, courseId, 'teacher');

// 權限狀態在各自 context 中獨立發展
// 最後驗證兩邊的參與者等待狀態
```

### 測試覆蓋矩陣

| 功能 | 測試 1 | 測試 2 | 測試 3 | 測試 4 | 測試 5 | 測試 6 | 測試 7 | 測試 8 |
|-----|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|
| 授予嬺限按鈕 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 麥克風權限 | ✅ | ✅ | - | - | ✅ | ✅ | ✅ | ✅ |
| 視頻權限 | ✅ | - | ✅ | - | ✅ | ✅ | ✅ | ✅ |
| 聲音權限 | ✅ | - | - | ✅ | ✅ | ✅ | ✅ | ✅ |
| 麥克風測試 | ✅ | ✅ | - | - | ✅ | - | - | ✅ |
| 攝影機預覽 | ✅ | - | ✅ | - | ✅ | - | - | ✅ |
| 設備選擇器 | - | - | - | - | - | ✅ | - | - |
| 初始禁用狀態 | - | - | - | - | - | - | ✅ | - |
| 並發功能 | - | - | - | - | - | - | - | ✅ |

---

## 多帳號隔離（無痕模式原理）

```
教師：browser.newContext()  ← 獨立 cookie/localStorage (一般視窗)
學生：browser.newContext()  ← 獨立 cookie/localStorage (無痕視窗)
```

- Playwright 的 `browser.newContext()` = 全新的瀏覽器上下文，等同開一個無痕視窗
- 兩個 context 之間零 cookie/localStorage 共享，不會互相覆蓋登入狀態
- **如果手動測試**：一般視窗登教師、無痕視窗登學生（或不同瀏覽器）

---

## 故障排除決策樹

測試失敗時，從 console 日誌的**最後一行 emoji 標記**找到失敗的步驟，查下面對應區塊：

### 🔴 步驟 0 失敗：student-enrollment-flow

| 日誌關鍵字 | 根因 | 修復 |
|-----------|------|------|
| `❌ student-enrollment-flow 失敗` | enrollment spec 本身壞了 | 先單獨跑 `npx playwright test e2e/student_enrollment_flow.spec.ts` 排除 |
| `Login failed` | 測試帳號不存在或密碼錯 | 檢查 `.env.local` 的 `TEST_STUDENT_*` |
| `點數不足` + 購買也失敗 | pricing/checkout 頁 UI 變更 | 檢查 `app/pricing/checkout/page.tsx` |
| `時間重疊` (反覆 retry) | 已有同 course 的 active order | 手動 DELETE `/api/orders` 或改用新 courseId |

**快速排除**：
```bash
# 單獨測 enrollment
npx playwright test e2e/student_enrollment_flow.spec.ts --project=chromium
```

### 🔴 步驟 1/2 失敗：autoLogin

| 日誌關鍵字 | 根因 | 修復 |
|-----------|------|------|
| `等待驗證碼圖片` 後超時 | captcha API 壞了 | 檢查 `GET /api/captcha` 是否回傳圖片 |
| `等待登入按鈕` 後超時 | captchaToken 未生成 | dev server 是否正常？`npm run dev` |
| `登入後 localStorage 無使用者資料` | login API 回 200 但無 profile | 檢查 `POST /api/login` response body |
| `waitForURL` 超時 (仍在 /login) | SPA 路由跳轉失敗 | 改用 `page.waitForURL(url => !url.pathname.startsWith('/login'))` (已修正) |

**快速排除**：
```bash
# 在瀏覽器 console 手動測
fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email:'student@test.com', password:'123456', captchaToken:'', captchaValue:'jv_secure_bypass_2024'}) }).then(r=>r.json()).then(console.log)
```

### 🔴 步驟 1/2 失敗：goToWaitRoom

| 日誌關鍵字 | 根因 | 修復 |
|-----------|------|------|
| `找不到課程 X 的進入教室按鈕` + `頁面課程: []` | enrollment 完全失敗，課程未建立 | 檢查 student-enrollment-flow 日誌，回頭排除步驟 0 |
| `找不到課程 X 的進入教室按鈕` + `頁面課程: [Y, Z, ...]` | 課程存在於系統但未關聯到該教師 | 檢查 enrollment 是否用正確的 `TEST_TEACHER_EMAIL` 建立課程（見下方「課程關聯問題」） |
| 教師列表顯示其他課程，但缺少建立的課程 | 教師帳號與 enrollment 創建者不匹配 | 確認 `QA_TEACHER_EMAIL`/`TEST_TEACHER_EMAIL` 與 enrollment 的 `TEST_TEACHER_EMAIL` 相同 |
| 列表為空或顯示「目前沒有」| 教師帳號沒有任何課程 | 確認教師帳號正確，或檢查課程是否已被手動刪除 |
| `waitForURL /classroom/wait` 超時 | 按鈕點擊後沒跳轉 | 可能是時間未到（課程尚未開始），檢查 enrollment 設定的 startTime |

**當遇到「課程存在於系統但未關聯到教師」→ 課程關聯問題**：

✅ **長期方案已實施（2026-04-08）**

[student_enrollment_flow.spec.ts](../../../e2e/student_enrollment_flow.spec.ts#L103) 已升級，課程建立時自動綁定 `teacherId`：

**修改內容**：
1. 教師登入時，從 `/api/login` response 中提取 `userId`
2. 建立課程時，將 `teacherId` 傳遞給 `POST /api/courses`
3. 增加詳細的 console 日誌記錄綁定過程

**驗證修復成功**：
```bash
# 執行 enrollment flow，查看日誌
npx playwright test e2e/student_enrollment_flow.spec.ts --project=chromium 2>&1 | grep -E "teacherId|課程將綁定|測試課程建立成功"

# 預期看到：
# ✅ 教師登入成功，teacherId: lin@test.com
# 📌 課程將綁定教師: lin@test.com
# ✅ 測試課程建立成功: AI 自動測試課程-... (ID: ..., teacherId: lin@test.com)
```

**若仍未修復**（舊版本）：
```bash
# 檢查 /api/courses payload 是否包含 teacherId
aws dynamodb get-item --table-name jvtutorcorner-courses \
  --key "{\"id\":{\"S\":\"<課程ID>\"}}" \
  --region ap-northeast-1 | jq '.Item.teacherId'

# 應當看到教師的 email（例如 "lin@test.com"），而非空值
```

**檢查路徑**：
- 教師：`/teacher_courses` → 是否有該 courseId 的行？
- 學生：`/student_courses` → 是否已報名成功？

### 🔴 步驟 3 失敗：readyAndEnterRoom

| 日誌關鍵字 | 根因 | 修復 |
|-----------|------|------|
| `準備好 按鈕 waitFor` 超時 | 設備檢測攔住了 | `injectDeviceCheckBypass` 是否在 `page.goto()` **之前** 呼叫？ |
| `立即進入教室 按鈕` 超時 | 只有一方 ready | 確認教師先 ready → 學生再 ready 的順序 |
| `waitForURL /classroom/room` 超時 | SSE/Polling 同步問題 | 開發環境用 SSE `/api/classroom/stream`，檢查是否正常回傳 |
| 10 分鐘倒數被踢回首頁 | Session endTs 為空 | 教師端課程未啟動 Session，參考 classroom-wait SKILL 的倒數排除 |

**設備檢測繞過原理**：
```typescript
// 在 page.goto 前呼叫
await page.addInitScript(() => {
  (window as any).__E2E_BYPASS_DEVICE_CHECK__ = true;
});
// 等待頁會讀此 flag → 跳過麥克風/攝影機/聲音測試
```

### 🔴 步驟 4 失敗：drawOnWhiteboard

| 日誌關鍵字 | 根因 | 修復 |
|-----------|------|------|
| `無法取得 Canvas 邊界` | Canvas 未渲染或被隱藏 | 增加 `canvas.waitFor` timeout；檢查 Agora 憑證 |
| Canvas 存在但 boundingBox = null | Canvas 尺寸為 0 | 檢查 CSS 是否設定寬高 |
| 筆工具按鈕不可見 | 工具列 UI 變更 | 更新選擇器 `button:has-text("筆")` |

### 🔴 步驟 5 失敗：verifyWhiteboardHasDrawing

| 日誌關鍵字 | 根因 | 修復方向 |
|-----------|------|---------|
| `expect(studentCanSeeDrawing).toBe(true)` 失敗 | 繪圖未同步到學生端 | 見下方「同步失敗根因分析」 |
| `getImageData` 安全錯誤 | Agora Canvas 為跨域 | 改用 WebSocket 消息監聽 (spec 中有 `setupWebSocketListener`) |
| 教師端有繪圖、學生端沒有 | WebSocket 未連接 / Agora 離線 | 檢查 Network 標籤的 WS 連接 |

**同步失敗根因分析**：
1. `teacherCanSeeDrawing = true` + `studentCanSeeDrawing = false` → WebSocket 同步問題
2. 兩者都 false → Canvas 為跨域，getImageData 靜默失敗（catch 吞了錯誤）
3. 增加同步等待時間（目前 2 秒），網路慢時改 5 秒

---

## 故障修復程式碼指南

依照失敗位置分別說明修復方向和代碼位置。

### 故障點 1️⃣：課程未綁定教師
**症狀**：教師課程列表空白，或課程 ID 無法找到課程記錄

**根因代碼**（[e2e/student_enrollment_flow.spec.ts#L106-L135](../../../e2e/student_enrollment_flow.spec.ts#L106-L135)）：
```typescript
// ✅ 修復：建立課程時必須傳遞 teacherId
const coursePayload: any = {
  id: testCourseId,
  title: testCourseTitle,
  teacherName: "Test Bot",
  enrollmentType: "points",
  pointCost: expectedDeduction,
  startDate: new Date().toISOString(),
  endDate: new Date(Date.now() + 30 * 86400000).toISOString(),
  status: '上架',
  teacherId: teacherId  // ⭐ 必須傳此欄位
};

if (teacherId) {
  coursePayload.teacherId = teacherId;
  console.log(`📌 課程將綁定教師: ${teacherId}`);
}
```

**修復路徑**：
1. 檢查 `POST /api/courses` 是否接收 `teacherId` payload
2. 確認 DynamoDB `COURSES_TABLE` 是否儲存 `teacherId` 字段
3. 驗證查詢課程時是否使用正確的 `teacherId` filter

**查詢 DynamoDB 驗證**：
```bash
# 確認課程確實存在且 teacherId 正確
aws dynamodb get-item --table-name jvtutorcorner-courses \
  --key "{\"id\":{\"S\":\"test-course-123\"}}" \
  --region ap-northeast-1 | jq '.Item | {id, title, teacherId}'

# 期望輸出: { "id": "test-course-123", "title": "...", "teacherId": "teacher@test.com" }
```

---

### 故障點 2️⃣：點數未扣除
**症狀**：Order 狀態為 PAID，但學生點數餘額未減少

**根因代碼**（[app/api/orders/route.ts#L85-L105](../../app/api/orders/route.ts#L85-L105)）：
```typescript
// 🟢 Point Deduction Logic - 此段必須執行
const effectivePointsToDeduct =
  paymentMethod === 'points'
    ? (coursePointCost > 0 ? coursePointCost : Number(pointsUsed) || 0)
    : 0;

if (paymentMethod === 'points' && effectivePointsToDeduct > 0) {
  // ⭐ 必須呼叫此函式，否則點數不會扣除
  const deductResult = await deductUserPoints(userId, effectivePointsToDeduct);
  if (!deductResult.ok) {
    return NextResponse.json({
      error: deductResult.error,
      ok: false,
    }, { status: 400 });
  }
  console.log(
    `[orders API] Deducted ${effectivePointsToDeduct} pts from ${userId} (new balance: ${deductResult.newBalance}) for "${courseTitle}"`
  );
} else if (paymentMethod === 'points' && effectivePointsToDeduct === 0) {
  // 防止免費報名
  return NextResponse.json({
    error: '此課程未設定點數費用，無法以點數報名。',
    ok: false,
  }, { status: 400 });
}
```

**修復檢查清單**：
- [ ] `paymentMethod` === `'points'` 是否正確傳遞？
- [ ] `coursePointCost > 0` 是否滿足？（若否，檢查課程設定）
- [ ] `deductUserPoints()` 函式是否存在且可正常執行？
- [ ] 檢查 console 日誌是否看到 `[orders API] Deducted ... pts` 訊息

**快速驗證**（在瀏覽器 console）：
```bash
# 查詢點數餘額
curl "http://localhost:3000/api/points?userId=student@test.com" | jq '.balance'

# 預期：建立訂單前後的差值應等於 coursePointCost
```

---

### 故障點 3️⃣：SSE 同步失敗
**症狀**：「立即進入教室」按鈕未出現，或只有一方見到 ready 狀態

**根因代碼**（[app/api/classroom/ready/route.ts#L59-L75](../../app/api/classroom/ready/route.ts#L59-L75)）：
```typescript
// POST /api/classroom/ready 中的廣播邏輯
const arr = await readList(uuid);
const filtered = arr.filter((p) => !(p.role === role && p.userId === userId));
if (action === 'ready') {
  filtered.push({ role, userId, present: !!present });
}
await writeList(uuid, filtered);

// ⭐ 此行必須執行，否則 SSE 不會通知
try {
  console.log(`/api/classroom/ready POST broadcast uuid=${uuid} role=${role} userId=${userId} action=${action} present=${!!present} participants=${filtered.length}`);
  broadcast(uuid, { participants: filtered });  // 廣播給所有 SSE 監聽者
} catch (e) {
  console.warn('/api/classroom/ready broadcast failed', e);
}
```

**修復檢查清單**：
- [ ] `broadcast()` 函式是否被正確呼叫？（查看 console 日誌）
- [ ] SSE 連線是否開啟？（Network 標籤 → WS stream）
- [ ] 客戶端是否監聽 SSE 事件更新？

**測試 SSE 連線**（終端 1：監聽，終端 2：發送）：
```bash
# 終端 1：開啟 SSE 監聽
curl "http://localhost:3000/api/classroom/stream?uuid=test-course-1" -N

# 終端 2：發送 ready 事件
curl -X POST "http://localhost:3000/api/classroom/ready" \
  -H "Content-Type: application/json" \
  -d '{"uuid":"test-course-1","role":"teacher","userId":"teacher@test.com","action":"ready"}'

# 終端 1 應看到:
# data: {"participants":[{"role":"teacher","userId":"teacher@test.com","present":true}]}
```

**客戶端監聽修復**（[app/classroom/wait/page.tsx](../../app/classroom/wait/page.tsx)）：
```typescript
// 檢查是否有此 useEffect 來監聽 SSE 事件
useEffect(() => {
  const eventSource = new EventSource(`/api/classroom/stream?uuid=${sessionKey}`);
  
  eventSource.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data);
    // 更新 UI：participants.length 是否滿足進入條件？
    if (payload.participants?.length === 2) {
      // 顯示「立即進入教室」按鈕
    }
  });
  
  return () => eventSource.close();
}, [sessionKey]);
```

---

### 故障點 4️⃣：Canvas 跨域限制
**症狀**：`getImageData()` 拋出 "Tainted canvas" 或安全錯誤

**根因代碼**（spec 中的 `verifyWhiteboardHasDrawing()` 函式）：
```typescript
// ❌ 問題：Agora Canvas 為跨域 iframe，無法直接 getImageData()
async function verifyWhiteboardHasDrawing(page: Page): Promise<boolean> {
  try {
    const canvas = page.locator('canvas').first();
    const imgData = await canvas.evaluate((el) => {
      const ctx = (el as HTMLCanvasElement).getContext('2d');
      return ctx?.getImageData(0, 0, el.width, el.height).data;  // ❌ 可能拋出跨域錯誤
    });
    // ... 檢查 alpha 像素
  } catch (e) {
    console.error('getImageData failed:', e);  // 通常是跨域安全錯誤
  }
}

// ✅ 修復：改用 WebSocket 消息監聽
async function setupWebSocketListener(page: Page): Promise<boolean> {
  let hasDrawing = false;
  
  page.on('websocket', ws => {
    ws.on('framereceived', event => {
      // 分析 WebSocket frame 中的繪圖事件
      if (event.payload?.type === 'drawing') {
        hasDrawing = true;
      }
    });
  });
  
  return hasDrawing;
}
```

**修復方向**：
1. 檢查 Agora Canvas 是否設定了 CORS headers
2. 若無法修改 Agora 設置，改用 WebSocket 監聽繪圖事件
3. 在 spec 中已實施 `setupWebSocketListener()` 作為替代方案

**檢查 Canvas 跨域狀態**（瀏覽器 DevTools）：
```javascript
// 在瀏覽器 console 執行
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
try {
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  console.log('✅ Canvas is accessible');
} catch (e) {
  console.error('❌ Canvas is tainted:', e.message);
}
```

---

### 故障點 5️⃣：WebSocket 同步失敗
**症狀**：教師繪圖，但學生客戶端收不到繪圖事件

**根因檢查**（[components/AgoraWhiteboard/BoardImpl.tsx](../../components/AgoraWhiteboard/BoardImpl.tsx)）：
```typescript
// WebSocket 發送端（教師）
private drawLine(startPoint: Point, endPoint: Point) {
  // 1️⃣ 同步更新本地 Canvas
  const ctx = this.canvas.getContext('2d');
  ctx.strokeStyle = this.color;
  ctx.lineWidth = this.brushWidth;
  ctx.beginPath();
  ctx.moveTo(startPoint.x, startPoint.y);
  ctx.lineTo(endPoint.x, endPoint.y);
  ctx.stroke();

  // 2️⃣ 透過 WebSocket 廣播給學生
  if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
    this.websocket.send(JSON.stringify({
      type: 'drawing',
      points: [startPoint, endPoint],
      color: this.color,
      timestamp: Date.now()
    }));
  } else {
    console.warn('❌ WebSocket 未連接，繪圖無法同步');  // ⭐ 檢查此日誌
  }
}

// WebSocket 接收端（學生）
private setupWebSocketListener() {
  this.websocket.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === 'drawing') {
      // 在學生端重繪
      this.drawLine(payload.points[0], payload.points[1]);
    }
  });
}
```

**修復檢查清單**：
- [ ] 教師端 `websocket.readyState === WebSocket.OPEN` 是否為真？
- [ ] `websocket.send()` 是否拋出錯誤？（檢查 Network → WS frames）
- [ ] 學生端是否有 `message` event listener？
- [ ] 檢查 Network 標籤 → WS frames，教師是否發送消息？

**Network 檢查**（DevTools）：
```
Application > WebSocket > 搜尋 classroom
├─ 檢查 Frames 標籤
├─ 教師繪圖時是否看到 outgoing message？
└─ 學生客戶端是否有相應的 incoming message？
```

---

### 故障點 6️⃣：設備檢測阻擋
**症狀**：等待頁「準備好」按鈕不可見，或被設備檢測對話阻擋

**根因代碼**（[app/classroom/wait/page.tsx](../../app/classroom/wait/page.tsx)）：
```typescript
// ❌ 問題：未正確繞過設備檢測
useEffect(() => {
  // 麥克風、攝影機、聲音測試可能需要真實設備或許可
  checkMicrophone();  // ❌ E2E 中可能超時
  checkCamera();
  checkAudio();
}, []);

// ✅ 修復：在 goto 之前注入 bypass flag
// 位置：e2e/classroom_room_whiteboard_sync.spec.ts
async function goToWaitRoom(page: Page, courseId: string, role: string) {
  // ⭐ 必須在 page.goto() 之前呼叫
  await injectDeviceCheckBypass(page);
  await page.goto(`${baseUrl}/classroom/wait?courseId=${courseId}`, { waitUntil: 'networkidle' });
}

async function injectDeviceCheckBypass(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as any).__E2E_BYPASS_DEVICE_CHECK__ = true;  // 注入全域 flag
  });
}
```

**頁面端檢查此 flag**（[app/classroom/wait/page.tsx](../../app/classroom/wait/page.tsx)）：
```typescript
useEffect(() => {
  // ✅ 若 E2E 模式，跳過設備檢測
  if ((window as any).__E2E_BYPASS_DEVICE_CHECK__) {
    console.log('[E2E] Skipping device checks');
    setReady(true);  // 直接設為準備好
    return;
  }
  
  // 否則進行正常的設備檢測
  checkMicrophone();
}, []);
```

**修復檢查清單**：
- [ ] `injectDeviceCheckBypass()` 是否在 `goto()` 之前呼叫？
- [ ] 頁面是否檢查 `window.__E2E_BYPASS_DEVICE_CHECK__` 標誌？
- [ ] Browser console 是否顯示 `[E2E] Skipping device checks`？

### 🔴 設備權限測試失敗：classroom-wait-device-permissions.spec.ts

**新增測試檔**（2026-04-10）：[e2e/classroom-wait-device-permissions.spec.ts](../../../e2e/classroom-wait-device-permissions.spec.ts)

| 日誌關鍵字 | 根因 | 修復 |
|-----------|------|------|
| `Test 1: Permission UI` 失敗 - 找不到按鈕 | VideoSetup 元件未渲染 | 檢查 `app/classroom/wait/page.tsx` 第 1073 行是否有 `<VideoSetup>` |
| `Test 2: Microphone Permission` 超時 | 麥克風測試按鈕被禁用 | 確認 bypass flag 已注入；檢查 `permissionGranted` state |
| `Test 3: Camera Permission` 失敗 | 視頻元素未出現 | 確認攝影機預覽按鈕已點擊；檢查 `<video srcObject={stream}>` 元素 |
| `Test 4: Speaker Test` 失敗 | 聲音輸出測試按鈕未找到 | 檢查 `startSpeakerTest()` 函式是否存在；按鈕文本可能為 `🔊 測試聲音` |
| `Test 5: Ready Button` 狀態不對 | 並未因 bypass 而啟用 | `__E2E_BYPASS_DEVICE_CHECK__` flag 可能未正確注入；檢查注入時機 |
| `Test 6: Device Selectors` 找不到 | 沒有設備列舉或選擇器未渲染 | 檢查 `enumerateDevices()` 是否被呼叫；設備列表可能需要權限授予後才顯示 |
| `Test 7: Initial State` 失敗 | 按鈕沒有被正確禁用 | 確認頁面加載時（未授予權限時）測試按鈕已禁用 |
| `Test 8: Concurrent Testing` 超時 | BrowserContext 隔離失敗 | 確保 `teacherContext` 和 `studentContext` 完全獨立；檢查 cleanup (close) |

**設備權限默認配置**（`.env.local`）：
```bash
# 若未設定，bypass 將被啟用（供 CI/CD 環境）
# 若要測試實際設備，需要物理媒體設備存在
NEXT_PUBLIC_BASE_URL=http://localhost:3000
LOGIN_BYPASS_SECRET=jv_secure_bypass_2024
TEST_TEACHER_EMAIL=teacher@test.com
TEST_STUDENT_EMAIL=student@test.com
```

**快速排除 - 分步檢查**：
```bash
# 1️⃣ 確保 VideoSetup 元件存在
grep -n "function VideoSetup" app/classroom/wait/page.tsx

# 2️⃣ 查看設備權限繞過邏輯
grep -n "__E2E_BYPASS_DEVICE_CHECK__" app/classroom/wait/page.tsx

# 3️⃣ 單獨執行設備權限測試（不含白板）
npx playwright test e2e/classroom-wait-device-permissions.spec.ts -g "Test 1"

# 4️⃣ 查閱詳細日誌
npx playwright test e2e/classroom-wait-device-permissions.spec.ts --reporter=verbose
```

---

## 核心檔案索引

| 類別 | 檔案 | 修改時機 |
|------|------|---------|
| **E2E 測試** | [e2e/classroom_room_whiteboard_sync.spec.ts](../../../e2e/classroom_room_whiteboard_sync.spec.ts) | 測試邏輯修改 |
| **E2E 設備權限** | [e2e/classroom-wait-device-permissions.spec.ts](../../../e2e/classroom-wait-device-permissions.spec.ts) | 設備權限/媒體測試修改 |
| **前置 E2E** | [e2e/student_enrollment_flow.spec.ts](../../../e2e/student_enrollment_flow.spec.ts) | enrollment 流程壞了 |
| **白板實作** | `components/AgoraWhiteboard/BoardImpl.tsx` | Canvas/繪圖邏輯變更 |
| **教室邏輯** | `app/classroom/ClientClassroom.tsx` | 教室核心元件 |
| **等待頁** | `app/classroom/wait/page.tsx` | 設備檢測 / ready 邏輯 / VideoSetup 元件 (L1073+) |
| **SSE 同步** | `app/api/classroom/stream/route.ts` | 等待頁雙方狀態同步 |
| **Ready API** | `app/api/classroom/ready/route.ts` | ready 狀態更新 |
| **點數扣除** | [app/api/orders/route.ts](../../app/api/orders/route.ts) | 點數扣除邏輯 |

### 相關技能

| 技能 | 何時需要參考 |
|------|-------------|
| [auto-login](../auto-login/SKILL.md) | 登入失敗時 |
| [classroom-wait](../classroom-wait/SKILL.md) | 等待頁面問題（設備檢測、倒數、SSE） |
| [classroom-room](../classroom-room/SKILL.md) | 教室內功能（影音、結束課程） |
| [student-enrollment-flow](../student-enrollment-flow/SKILL.md) | 報名/扣點流程問題 |
| [navbar-verification](../navbar-verification/SKILL.md) | 登入後導覽列狀態 |

---

## 已知修正紀錄

### 2026-04-10 — 設備權限檢驗測試套件完成

新增 [e2e/classroom-wait-device-permissions.spec.ts](../../../e2e/classroom-wait-device-permissions.spec.ts)：8 個完整測試用例

**涵蓋範圍**：
- 權限授予流程 (音頻+視頻組合)
- 麥克風權限與音量測試（頻率分析）
- 攝影機權限與視頻預覽
- 聲音輸出（揚聲器）測試
- 設備檢查完成流程 (bypass + just ready button)
- 設備選擇器與列舉
- 初始狀態驗證（禁用狀態）
- 並發教師+學生測試（BrowserContext 隔離）

**實裝要點**：
1. VideoSetup 元件在 `app/classroom/wait/page.tsx` L1073+
   - `requestPermissions()` - 音頻、視頻權限請求
   - `startCameraPreview()` - 視頻流預覽
   - `startMicTest()` - 麥克風頻率分析
   - `testSpeaker()` - 聲音輸出測試
2. E2E bypass 機制：`__E2E_BYPASS_DEVICE_CHECK__` flag
3. 設備列舉與自動選擇：localStorage 持久化
4. 並發隔離：BrowserContext 獨立媒體權限狀態

**延伸應用**：
- 測試組合工作流：設備權限 + 白板同步 + 實時應用共用
- 支援 CI/CD 無設備環境（bypass）及本地有設備測試（真實流程）

### 2026-04-08 — 完整流程串接重構

1. **舊 `enterClassroom()` → 三函式拆分**
   - 舊版將「找按鈕 → 等待頁 → 準備好 → 進教室」全塞在一個函式
   - 新版拆為 `goToWaitRoom()` + `readyAndEnterRoom()`，失敗時可精確定位卡在哪一步
   - 新增 `injectDeviceCheckBypass()` 在 goto 前注入，避免設備檢測擋住流程

2. **多帳號隔離文檔化**
   - 每個角色都用 `browser.newContext()` = 獨立 session
   - 教師 context 先建立（一般視窗），學生 context 後建立（無痕視窗）
   - spec 內有 `try/finally` 確保 context 正確 close

3. **readyAndEnterRoom 容錯**
   - 先嘗試自動跳轉 (5 秒 timeout)
   - 若未自動跳轉，再等「立即進入教室」按鈕出現後點擊
   - 適配不同版本的等待頁行為

4. **timeout 升級**
   - 總超時從 3 分鐘 → 5 分鐘（涵蓋 enrollment 子流程）

### 2026-04-06 — 初版建立
- 基於 classroom-room 技能建立白板同步子測試
- 包含 `drawOnWhiteboard` + `verifyWhiteboardHasDrawing` + `setupWebSocketListener`
