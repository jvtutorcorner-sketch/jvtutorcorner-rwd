---
name: object-storage-uploads
description: '物件儲存（S3／Cloudflare R2）抽象與所有上傳、presign、代理讀取端點的權限與路徑穿越防護。Use when: changing lib/s3.ts, adding an upload or presign route, switching storage to R2, or debugging avatar/carousel/whiteboard PDF uploads.'
argument-hint: '描述要改的上傳功能或儲存設定，例如：頭像上傳 403、改用 R2'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-09-11'
  architecture-aligned: true
  related-skills: [server-auth-guards, materials-pdf-preview, cloud-hybrid-architecture, classroom-room-whiteboard-sync]
---

# 物件儲存與上傳 (Object Storage & Uploads)

[lib/s3.ts](../../../lib/s3.ts) 是唯一的 S3 相容客戶端入口；AWS S3 與 Cloudflare R2 都走同一套程式，只差環境變數。

## 儲存抽象

| 函式 | 用途 |
|---|---|
| `getStorageClient()` | 依 `STORAGE_S3_ENDPOINT` 決定連 AWS 或 R2（R2 用 path-style、region `auto`、`requestChecksumCalculation: 'WHEN_REQUIRED'`） |
| `getStorageBucket()` | `STORAGE_BUCKET`，未設定時退回 `AWS_S3_BUCKET_NAME` |
| `isObjectStorageConfigured()` | 路由在動作前先檢查，未設定時回 503 而不是丟例外 |
| `publicUrlForKey(key)` | 有 `STORAGE_PUBLIC_BASE_URL`（R2 自訂網域）就用它，否則組 S3 URL |

切換到 R2 的步驟與成本比較見 [docs/hybrid-architecture-plan.md](../../../docs/hybrid-architecture-plan.md) §4。

## 端點與權限

| 端點 | 身分 | 備註 |
|---|---|---|
| `GET /api/carousel` | 公開 | 首頁輪播 |
| `POST/PATCH/DELETE /api/carousel`、`POST /api/carousel/{upload,presign}` | admin | |
| `POST /api/avatar/upload` | teacher／admin | 學生 403 |
| `POST /api/whiteboard/presign`、`GET/DELETE /api/whiteboard/pdf` | 登入者 | 白板 PDF |
| `POST /api/courses/[id]/materials/presign` | 該課老師／admin | 見 [materials-pdf-preview](../materials-pdf-preview/SKILL.md) |
| `GET /api/uploads/{avatar,carousel,whiteboard}/[...path]` | 公開代理 | 以前綴白名單阻擋路徑穿越；`USE_S3_REDIRECT` 時回 3xx 到物件 URL |

代理路由的防護：解碼後的 key 含 `..`、反斜線或不在該前綴下時，avatar／carousel 回 400、whiteboard 回 403，且絕不讀取本機檔案。

## 相關檔案

- [lib/s3.ts](../../../lib/s3.ts)、[lib/awsHealthChecker.ts](../../../lib/awsHealthChecker.ts)
- [app/api/avatar/upload/route.ts](../../../app/api/avatar/upload/route.ts)、[app/api/carousel/upload/route.ts](../../../app/api/carousel/upload/route.ts)、[app/api/carousel/presign/route.ts](../../../app/api/carousel/presign/route.ts)
- [app/api/whiteboard/pdf/route.ts](../../../app/api/whiteboard/pdf/route.ts)、[app/api/whiteboard/presign/route.ts](../../../app/api/whiteboard/presign/route.ts)
- [app/api/uploads/avatar/[...path]/route.ts](../../../app/api/uploads/avatar/[...path]/route.ts)、[app/api/uploads/carousel/[...path]/route.ts](../../../app/api/uploads/carousel/[...path]/route.ts)、[app/api/uploads/whiteboard/[...path]/route.ts](../../../app/api/uploads/whiteboard/[...path]/route.ts)
- [scripts/diagnose-s3-cors.mjs](../../../scripts/diagnose-s3-cors.mjs)、[next.config.ts](../../../next.config.ts)（`images.remotePatterns` 會依 `STORAGE_PUBLIC_BASE_URL` 展開）
- 測試：[e2e/object_storage_uploads_verification.spec.ts](../../../e2e/object_storage_uploads_verification.spec.ts)

## 測試指令

```bash
npx playwright test e2e/object_storage_uploads_verification.spec.ts --project=chromium
node scripts/diagnose-s3-cors.mjs
```

spec 只送「沒有檔案」或缺欄位的請求，在寫入儲存之前就被擋下；代理讀取只讀不存在的 key。

## 環境驗證 (Environment Validation)

- AWS：`AWS_S3_BUCKET_NAME`、`AWS_REGION`、`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`
- R2（選用，設定後優先）：`STORAGE_S3_ENDPOINT`、`STORAGE_S3_REGION`、`STORAGE_BUCKET`、`STORAGE_ACCESS_KEY_ID`、`STORAGE_SECRET_ACCESS_KEY`、`STORAGE_PUBLIC_BASE_URL`
- `USE_S3_REDIRECT`：代理路由改回 3xx。
- `STORAGE_SECRET_ACCESS_KEY` 已列入 `npm run check:bundle-secrets` 的檢查名單，不得出現在 client bundle。

## 故障排除

- **瀏覽器直傳 presigned URL 被 CORS 擋**：跑 `node scripts/diagnose-s3-cors.mjs`；R2 要在 bucket 設定 CORS，不是在 Cloudflare 的 Workers。
- **R2 上傳回 `NotImplemented`／checksum 錯誤**：確認 `requestChecksumCalculation: 'WHEN_REQUIRED'` 還在 `getStorageClient()`。
- **next/image 拒絕載入圖片**：`STORAGE_PUBLIC_BASE_URL` 的網域需在 build 時就存在（`remotePatterns` 在 build 時展開）。
- **已知缺口**：`/api/uploads/carousel` 缺物件時回 500（avatar 回 404），spec 暫時兩者都接受。

## 相關技能

- [server-auth-guards](../server-auth-guards/SKILL.md)
- [materials-pdf-preview](../materials-pdf-preview/SKILL.md)：課程教材的受保護預覽。
- [cloud-hybrid-architecture](../cloud-hybrid-architecture/SKILL.md)：S3 → R2 的遷移規劃。
