簡單多國語系使用說明

- 翻譯檔位置：`locales/{locale}/common.json`，目前有 `zh-TW`、`zh-CN` 與 `en`。
- 新增翻譯：在對應資料夾加入 `common.json`，以 `key: value` 格式。
- 開發流程：頁面會使用全域 `IntlProvider`（在 `app/layout.tsx` 已包裹），客戶端元件可使用 `useT()` 取得 `t(key)`。
- 切換語言：點擊畫面右上角的語言切換按鈕會在本地儲存語言並即時載入翻譯（不會重新載入整頁）。
- 若要在伺服器端渲染使用翻譯，請改為在路由中將 locale 作為路徑參數，或將翻譯移至伺服器層（這個專案目前採用 client-driven 的簡易方案）。
