/**
 * Offline Sync Logic Example utilizing localForage
 * 
 * 此腳本展示如何在老師/學生端網路斷線時，利用 localForage (IndexedDB)
 * 緩存白板截圖與畫記數據，並在網路恢復後自動補齊課程分析。
 */

import localforage from 'localforage';

// 初始化配置
localforage.config({
  name: 'jvtutorcorner-platform',
  storeName: 'whiteboard_offline_queue'
});

/**
 * 當網路斷線或切換頁面時，將當前重點截圖存入本機
 * @param {string} pageId 頁碼或唯一識別碼
 * @param {Blob} imageBlob 畫布截圖
 * @param {Array} strokes 當前頁面的畫記數據
 */
export async function captureOfflinePoint(pageId, imageBlob, strokes) {
  const timestamp = Date.now();
  const data = {
    pageId,
    imageBlob,
    strokes,
    timestamp,
    status: 'pending' // 標註為待同步
  };
  
  await localforage.setItem(`sync_${pageId}_${timestamp}`, data);
  console.log(`[OfflineSync] 內容已存入本機緩存: Page ${pageId}`);
}

/**
 * 當網路恢復 (online) 時，自動補傳所有待處理的截圖
 */
export async function syncPendingData() {
  if (!navigator.onLine) return;

  const keys = await localforage.keys();
  const pendingKeys = keys.filter(key => key.startsWith('sync_'));

  for (const key of pendingKeys) {
    const item = await localforage.getItem(key);
    if (item.status === 'pending') {
      try {
        // 執行上傳至 API
        const success = await uploadToServer(item);
        if (success) {
          // 上傳成功後移除或標註為完成
          await localforage.removeItem(key);
          console.log(`[OfflineSync] 同步完成: ${key}`);
        }
      } catch (err) {
        console.error(`[OfflineSync] 同步失敗，稍後重試: ${key}`, err);
      }
    }
  }
}

// 模擬上傳邏輯
async function uploadToServer(data) {
  // 建立 FormData 並傳送至 /api/whiteboard/pdf 等接口
  console.log('正在傳送數據至伺服器進行分析...');
  return true;
}

// 監聽網路狀態
if (typeof window !== 'undefined') {
  window.addEventListener('online', syncPendingData);
}
