# 多語系支援進展報告

## 已完成的轉換 (Completed)

### 核心頁面 (Core Pages)
- ✅ `app/page.tsx` (Homepage) - 主頁推薦老師、課程、平台特色已翻譯
- ✅ `app/login/page.tsx` - 登入頁面，測試帳號列表已翻譯
- ✅ `app/profile/page.tsx` - 個人資料頁面已翻譯
- ✅ `app/orders/page.tsx` - 訂單紀錄頁面已翻譯

### 元件 (Components)
- ✅ `components/SearchForm.tsx` - 搜尋表單（科目、語言、地區、授課方式）已翻譯
- ✅ `components/TeacherDashboard.tsx` - 教師課程管理已翻譯
- ✅ `components/TroubleshootButton.tsx` - 故障排除按鈕已翻譯
- ✅ `components/Header.tsx` - 頁面標題已翻譯（之前完成）
- ✅ `components/MenuBar.tsx` - 導覽列已翻譯（之前完成）
- ✅ `components/AuthStatusBar.tsx` - 認證狀態欄已翻譯（之前完成）
- ✅ `components/EnrollButton.tsx` - 報名按鈕已翻譯（之前完成）
- ✅ `components/CourseSessionDurationEditor.tsx` - 課程時長編輯已翻譯（之前完成）
- ✅ `components/Calendar.tsx` - 日曆已翻譯（之前完成）
- ✅ `components/CourseCard.tsx` - 課程卡片，含per-course資料翻譯已翻譯（之前完成）
- ✅ `components/TeacherCard.tsx` - 教師卡片，含per-teacher資料翻譯已翻譯（之前完成）

### 設定頁面 (Settings)
- ✅ `app/settings/page.tsx` - 已翻譯（之前完成）

### 翻譯檔案 (Locale Files)
- ✅ `locales/zh-TW/common.json` - ~150+ 個 keys 已添加
- ✅ `locales/zh-CN/common.json` - ~150+ 個 keys 已添加
- ✅ `locales/en/common.json` - ~150+ 個 keys 已添加

---

## 仍需轉換的文件 (Remaining Work)

### 高優先級 (High Priority)
- [ ] `app/my-courses/page.tsx` - 教師課程管理頁面，有大量中文字串
  - 新增課程表單、課程列表、確認刪除提示等
- [ ] `app/pricing/page.tsx` - 定價頁面，有大量方案說明和定價資訊
- [ ] `app/dashboard/teacher/page.tsx` - 教師儀表板
- [ ] `app/my-courses/[id]/edit/page.tsx` - 課程編輯頁面

### 中等優先級 (Medium Priority)
- [ ] `components/EnrollmentManager.tsx` - 報名管理器
- [ ] `components/OrdersManager.tsx` - 訂單管理器
- [ ] `components/ProfileMarkdownForm.tsx` - 個人簡介編輯（Markdown）
- [ ] `app/classroom/*` 相關頁面和元件
- [ ] `app/whiteboard/page.tsx` - 白板頁面

### 低優先級 (Low Priority)
- [ ] `app/about/page.tsx` - 關於我們頁面
- [ ] `app/testimony/page.tsx` - 用戶見證頁面
- [ ] `app/terms/page.tsx` - 條款頁面
- [ ] `app/dashboard/*` 其他儀表板頁面
- [ ] PdfViewer 錯誤訊息
- [ ] SimulationButtons 日誌訊息

---

## 使用方式

### 新增翻譯的步驟

1. **在元件中引入 useT**
```tsx
import { useT } from '@/components/IntlProvider';

// 在元件內
const t = useT();
// 使用: {t('key_name')}
```

2. **添加翻譯 key 到 locales 檔案**
```json
// locales/zh-TW/common.json
{
  "key_name": "中文翻譯"
}

// locales/zh-CN/common.json
{
  "key_name": "中文翻译"
}

// locales/en/common.json
{
  "key_name": "English translation"
}
```

3. **提交 git**
```bash
git add -A
git commit -m "feat: add multilingual support to [component/page name]"
```

### 測試翻譯

```bash
npm install
npm run dev
# 開啟 http://localhost:3000
# 用語言選擇器 (LanguageSwitcher) 切換語言測試
```

---

## 尚未實現的功能

- [ ] SSR 元數據翻譯（meta title/description）
- [ ] 動態內容資料庫翻譯（如課程價格說明、教師簡介等）
- [ ] 多語言 URL slug 支援（目前使用 localStorage 儲存語言設定）

---

## 筆記

- **語言持久化**: 使用 localStorage 的 `locale` key 儲存使用者選擇的語言
- **Provider 最佳化**: IntlProvider 會先嘗試動態導入本地 JSON 檔案，再回退到 API 端點
- **Fallback 機制**: 若翻譯 key 不存在，會直接顯示 key 名稱（便於偵錯）
- **資料翻譯策略**: CourseCard 和 TeacherCard 使用 `tt()` 輔助函數來嘗試翻譯動態資料（如 `courses.c1.title`），若無翻譯則使用原始資料

---

## 相關檔案

- 主要 Provider: `components/IntlProvider.tsx`
- API 端點: `app/api/i18n/route.ts`
- 語言選擇器: `components/LanguageSwitcher.tsx`
- 翻譯檔案位置: `locales/{locale}/common.json`

