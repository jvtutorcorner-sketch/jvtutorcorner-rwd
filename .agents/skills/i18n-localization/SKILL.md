---
name: i18n-localization
description: '多國語系：locales/{zh-TW,zh-CN,en}/common.json、IntlProvider 與 useT()、語言切換、國家／科目名稱翻譯與日期格式。Use when: adding UI text, a new translation key or locale, or fixing untranslated/mis-formatted text.'
argument-hint: '描述要處理的翻譯，例如：新增頁面文字、某科目沒翻譯'
metadata:
  verified-status: '⚠️ PARTIAL'
  last-verified-date: '2026-09-11'
  architecture-aligned: true
  related-skills: [homepage-verification, navbar-verification]
---

# 多國語系 (i18n & Localization)

本專案採 client-driven 的簡易方案：`app/layout.tsx` 包了全域 [components/IntlProvider.tsx](../../../components/IntlProvider.tsx)，客戶端元件用 `useT()` 取得 `t(key)`；語言選擇存在瀏覽器本地，切換時不重新載入整頁。詳見 [locales/README.md](../../../locales/README.md)。

## 組成

| 檔案 | 功能 |
|---|---|
| `locales/{zh-TW,zh-CN,en}/common.json` | 翻譯字串；三個語系的 key 必須一致（目前各 928 個） |
| [app/api/i18n/route.ts](../../../app/api/i18n/route.ts) | 提供翻譯檔 |
| [components/LanguageSwitcher.tsx](../../../components/LanguageSwitcher.tsx) | 右上角語言切換 |
| [components/LocalDate.tsx](../../../components/LocalDate.tsx)、[lib/dateLocale.ts](../../../lib/dateLocale.ts) | 依語系格式化日期（`getDateFnsLocale`、`getDateFormats`、`interpolate`） |
| [lib/countryI18n.ts](../../../lib/countryI18n.ts)、[lib/subjectI18n.ts](../../../lib/subjectI18n.ts) | 國家、科目的翻譯 key；`untranslatedSubjects()` 列出缺翻譯的科目 |

## 新增文字的規則

1. 三個語系同時加 key，不要只加 zh-TW。
2. 不要把使用者可見文字寫死在元件裡。
3. 需要帶變數時用 `interpolate()`，不要字串相加（語序會不同）。

## 測試指令

```bash
# 三個語系的 key 數一致
node -e "for (const l of ['zh-TW','zh-CN','en']) console.log(l, Object.keys(require('./locales/'+l+'/common.json')).length)"

# 語言切換 UI
npx playwright test e2e/homepage_verification.spec.ts --project=chromium --grep "語言切換"
```

## 環境驗證 (Environment Validation)

- 無必要環境變數。

## 故障排除

- **畫面顯示 key 本身（例如 `nav.home`）**：該語系缺這個 key；用上面的指令比對 key 數。
- **伺服器端元件拿不到翻譯**：目前只有客戶端 `useT()`；伺服器端需要把 locale 當作參數傳入，或改成客戶端元件。
- **部分驗證**：只有語言切換有 e2e 覆蓋；key 一致性目前靠手動指令，沒有進 CI。

## 相關技能

- [homepage-verification](../homepage-verification/SKILL.md)、[navbar-verification](../navbar-verification/SKILL.md)
