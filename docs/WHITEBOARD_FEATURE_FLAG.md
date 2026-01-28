# 白板功能開關文檔

## 概述

專案現在支持在 **Agora Interactive Whiteboard (Fastboard)** 和 **傳統 Canvas 白板** 之間切換，透過環境變數控制。

## 環境變數配置

### `.env.local` 或 `.env`

```bash
# === Agora Whiteboard 憑證 ===
AGORA_WHITEBOARD_APP_ID=你的AppIdentifier
AGORA_WHITEBOARD_AK=你的AccessKey
AGORA_WHITEBOARD_SK=你的SecretKey

# === 功能開關 ===
# true = 使用 Agora Fastboard (新白板)
# false = 使用 Canvas Whiteboard (舊白板)
NEXT_PUBLIC_USE_AGORA_WHITEBOARD=false
```

## 使用方式

### 1. **啟用 Agora 白板**

```bash
# .env.local
NEXT_PUBLIC_USE_AGORA_WHITEBOARD=true
```

重啟開發伺服器：
```bash
npm run dev
```

進入教室頁面 `/classroom`，將自動使用 Agora Fastboard。

### 2. **切換回 Canvas 白板**

```bash
# .env.local
NEXT_PUBLIC_USE_AGORA_WHITEBOARD=false
```

重啟後將使用原本的 Canvas 白板（EnhancedWhiteboard）。

## 技術實作細節

### 動態引入 (Dynamic Import)

AgoraWhiteboard 使用 `next/dynamic` 來避免 SSR 問題：

```typescript
const AgoraWhiteboard = dynamic(() => import('@/components/AgoraWhiteboard'), { 
  ssr: false,
  loading: () => <LoadingSpinner />
});
```

### 條件式渲染邏輯

在 [ClientClassroom.tsx](../app/classroom/ClientClassroom.tsx#L1140-L1166) 中：

```typescript
{useAgoraWhiteboard && agoraRoomData ? (
  <AgoraWhiteboard
    ref={agoraWhiteboardRef}
    roomUuid={agoraRoomData.uuid}
    roomToken={agoraRoomData.roomToken}
    // ...
  />
) : (
  <EnhancedWhiteboard 
    channelName={effectiveChannelName}
    // ...
  />
)}
```

### API 整合

當功能開關啟用時，會自動呼叫 `/api/whiteboard/room` 建立 Agora 房間：

```typescript
useEffect(() => {
  if (!useAgoraWhiteboard || !mounted) return;
  
  const res = await fetch('/api/whiteboard/room', {
    method: 'POST',
    body: JSON.stringify({ userId })
  });
  
  const data = await res.json();
  setAgoraRoomData(data);
}, [useAgoraWhiteboard, mounted, userId]);
```

## 組件對照表

| 功能開關 | 組件 | 技術 | 檔案 |
|---------|------|------|------|
| `false` (預設) | EnhancedWhiteboard | HTML5 Canvas + BroadcastChannel | [EnhancedWhiteboard.tsx](../components/EnhancedWhiteboard.tsx) |
| `true` | AgoraWhiteboard | Agora Fastboard SDK | [AgoraWhiteboard.tsx](../components/AgoraWhiteboard.tsx) |

## 功能比較

### Canvas 白板 (EnhancedWhiteboard)
- ✅ 自製控制，完全客製化
- ✅ 無額外雲端費用
- ❌ 同步延遲與閃爍問題
- ❌ PDF 圖層處理複雜

### Agora 白板 (AgoraWhiteboard)
- ✅ 企業級同步效能
- ✅ 官方維護與支援
- ✅ 內建工具列與分頁控制
- ✅ PDF 自動轉檔與插入
- ❌ 需要 Agora 憑證與費用

## PDF 插入功能

### Canvas 白板
```typescript
// PDF 透過 pdfFile prop 傳入
<EnhancedWhiteboard 
  pdfFile={selectedPdf}
  onPdfSelected={(f) => setSelectedPdf(f)}
/>
```

### Agora 白板
```typescript
// 透過 ref 呼叫 insertPDF
agoraWhiteboardRef.current?.insertPDF(
  'https://your-s3-bucket.amazonaws.com/lecture.pdf',
  'Lecture 01'
);
```

## 測試建議

### 階段 1：本地測試
1. 設定 `NEXT_PUBLIC_USE_AGORA_WHITEBOARD=true`
2. 確認 Agora 憑證正確
3. 測試白板基本繪圖功能

### 階段 2：並行運行
1. 保持功能開關為 `false`
2. 在測試環境中設為 `true`
3. 比較兩種白板的使用體驗

### 階段 3：完全遷移
1. 確認 Agora 白板穩定運行
2. 將功能開關改為 `true`
3. 可選：移除舊 Canvas 白板組件

## 疑難排解

### Agora 白板無法顯示
1. 檢查環境變數是否正確設定
2. 確認 `/api/whiteboard/room` 返回有效數據
3. 檢查瀏覽器 Console 錯誤訊息

### PDF 無法插入
1. 確保 PDF URL 可公開訪問
2. 檢查 Agora Console 是否啟用「文件轉換」服務
3. 確認 S3 CORS 設定正確

### 功能開關不生效
1. 確認環境變數名稱為 `NEXT_PUBLIC_USE_AGORA_WHITEBOARD`
2. 重啟開發伺服器 (`npm run dev`)
3. 清除瀏覽器快取

## 相關檔案

- 🎨 [AgoraWhiteboard.tsx](../components/AgoraWhiteboard.tsx) - 新白板組件
- 🖼️ [EnhancedWhiteboard.tsx](../components/EnhancedWhiteboard.tsx) - 舊白板組件
- 🔌 [/api/whiteboard/room/route.ts](../app/api/whiteboard/room/route.ts) - API Route
- 🏫 [ClientClassroom.tsx](../app/classroom/ClientClassroom.tsx) - 教室頁面整合
- 📝 [.env.local](../.env.local) - 環境變數配置

## 授權與支持

如有問題，請參考 [Agora Interactive Whiteboard 官方文檔](https://docs.agora.io/en/interactive-whiteboard/overview/product-overview)。
