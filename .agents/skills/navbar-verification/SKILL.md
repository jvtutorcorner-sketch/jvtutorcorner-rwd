---
name: navbar-verification
description: '驗證建立帳戶後的導覽列（Navbar）狀態與自動登入流程。'
argument-hint: '驗證註冊後的導覽列、自動登入與 Product Tour 功能'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-03-28'
  architecture-aligned: true
---

# 導覽列驗證技能 (Navbar Verification Skill)

負責驗證建立帳戶後的導覽列（Navbar）狀態與自動登入流程。

## 核心職責
- 驗證註冊後是否能正確自動登入。
- 驗證導覽列在登入前後的顯示差異（登入按鈕 vs 使用者頭像/Email）。
- 驗證導覽列下拉選單的功能與權限過濾。
- 驗證新戶導覽（Product Tour）是否在首次登入時觸發。

## 檢查清單

### 1. 註冊後自動登入驗證
- [ ] 前往 `/login/register`。
- [ ] 填寫完整資料並提交。
- [ ] 驗證是否自動導向首頁 `/`。
- [ ] 檢查導覽列是否顯示使用者 Email 或姓名。
- [ ] 檢查 `localStorage` 中是否有 `tutor_mock_user`（表示使用者已登入）。
- [ ] 驗證 `tutor_mock_user` 包含正確的使用者資訊。

### 2. 導覽列 UI 驗證
- [ ] 驗證「登入」按鈕已消失。
- [ ] 驗證「頭像按鈕」（Avatar Button）已顯示，且包含正確的首字母縮寫。
- [ ] 點擊頭像按鈕，驗證下拉選單是否顯示。
- [ ] 驗證選単中包含：設定、我的課程、我的方案、登出等選項。
- [ ] 點擊「登出」，驗證導覽列回歸 Guest 狀態（顯示「登入」按鈕）。

### 2a. Dropdown 菜單 - Student 角色（重點檢查）
**Student 必須看到的菜單項:**
- [ ] ✅ 個人設定
- [ ] ✅ 學生的課程訂單
- [ ] ✅ 方案與價格
- [ ] ✅ 登出

**Student 不應該看到的菜單項:**
- [ ] ❌ 個人檔案（Teacher 特定）
- [ ] ❌ 教師的課程訂單（Teacher 特定）
- [ ] ❌ 老師審核（Admin 特定）
- [ ] ❌ 後台管理選項（Admin 特定）

### 2b. Dropdown 菜單 - Teacher 角色（重點檢查）
**Teacher 必須看到的菜單項:**
- [ ] ✅ 個人檔案（Teacher 特定）
- [ ] ✅ 個人設定
- [ ] ✅ 方案與價格
- [ ] ✅ 登出

**Teacher 不應該看到的菜單項:**
- [ ] ❌ 學生的課程訂單（Student 特定）
- [ ] ❌ 老師審核（Admin 特定）
- [ ] ❌ 後台管理選項（Admin 特定）

**防錯機制:**
- 使用 `has-text()` 定位器精確匹配菜單文本
- 使用 negative assertions 確保不會顯示錯誤角色的菜單項
- 驗證角色標籤（.menu-user div）展示正確的角色名稱

### 3. 多頁面互動導覽與問卷
- [ ] 驗證首頁是否自動開啟 `Product Tour`。
- [ ] 驗證導覽中是否包含「快速問卷」步驟，且可選擇或略過。
- [ ] 驗證導覽是否能正確從首頁跳轉至 `/teachers`。
- [ ] 驗證導覽是否能正確從 `/teachers` 跳轉至 `/courses`。
- [ ] 驗證導覽完成後，`jv_tour_phase` 已從 `localStorage` 移除（或在頁面導航後清空）。

## 自動化測試

### 完整測試套件
執行以下指令來驗證完整的 Navbar 與多頁面導覽流程：
```bash
# 執行所有 navbar 驗證測試（包括 Student 和 Teacher）
npx playwright test e2e/navbar_verification.spec.ts --headed

# 執行 Student 角色專用測試
npx playwright test e2e/navbar_verification.spec.ts -g "Student"

# 執行 Teacher 角色專用測試
npx playwright test e2e/navbar_verification.spec.ts -g "Teacher"
```

### 角色分離測試 - 重要防錯措施
此測試套件包含兩個獨立的測試案例，確保不會混淆不同角色的菜單項：

1. **「Navbar Verification After Registration (Auto-Login)」** - Student 角色
   - 註冊為 Student 角色
   - 驗證 Student 特定的菜單項（學生的課程訂單）
   - 驗證 Student 不會看到 Teacher/Admin 項目

2. **「Navbar Verification After Registration (Teacher Role)」** - Teacher 角色
   - 註冊為 Teacher 角色
   - 驗證 Teacher 特定的菜單項（個人檔案）
   - 驗證 Teacher 不會看到 Student/Admin 項目

## 疑難排解

### 基本問題
- **Navbar 未更新**：檢查是否確實 Dispatch 了 `tutor:auth-changed` 事件。
- **未自動登入**：檢查 `app/login/register/page.tsx` 中的 `setStoredUser` 調用是否正確。
- **Captcha 錯誤**：在自動化環境中，確保使用了 `NEXT_PUBLIC_LOGIN_BYPASS_SECRET` 中定義的 Bypass Code。
- **localStorage 不一致**：某些環境中（如生產環境）頁面導航後 localStorage 可能被清空，這是正常行為。驗證時應檢查使用者是否確實已認證（透過 Navbar 顯示）。

### 角色分離相關問題

#### 問題：菜單項混淆（Student 看到 Teacher 項目或反之）
**原因:**
- MenuBar.tsx 或 Header.tsx 中的 role 過濾邏輯有誤
- 頁面設定（pageConfigs）中的權限設定（permissions）配置錯誤

**解決方案:**
1. 檢查 `app/api/admin/settings/route.ts` 中各菜單項的權限設定
   ```typescript
   // 確保每個頁面都有正確的角色權限
   { id: '/student_courses', permissions: [
       { roleId: 'student', dropdownVisible: true },
       { roleId: 'teacher', dropdownVisible: false }, // 確保 false
       { roleId: 'admin', dropdownVisible: false }
   ]}
   ```

2. 驗證 MenuBar.tsx 中的角色過濾邏輯
   ```typescript
   const roleKey = user?.role || 'student';
   const perm = pc.permissions.find(p => p.roleId === roleKey);
   return perm?.dropdownVisible !== false; // 必須明確檢查 role
   ```

3. 檢查 localStorage 中 `tutor_mock_user` 的 role 字段是否正確

#### 問題：定位器失效（Dropdown 重新打開後找不到元素）
**原因:**
- Dropdown 關閉後重新打開，舊的定位器引用失效
- 應該在 Dropdown 打開時直接執行所有操作

**解決方案:**
- 避免在驗證後關閉 Dropdown（使用 `Escape`），應直接操作（如點擊登出按鈕）
- 如必須重新打開，應重新定義所有定位器

#### 問題：Student/Teacher 測試互相干擾
**原因:**
- 前一個測試的 localStorage 影響下一個測試

**解決方案:**
- 每個 `test()` 都在獨立的 page context 中運行，不應互相干擾
- 確認 logout 後 localStorage 正確清空（`tutor_mock_user` 應為 null）

## 代碼示例 - 角色分離驗證

### Student 角色 Dropdown 驗證
```typescript
// Student 應該看到的菜單項
const settingsOption = page.locator('a:has-text("個人設定")');
const studentCoursesOption = page.locator('a:has-text("學生的課程訂單")');
const myPlansOption = page.locator('a:has-text("方案與價格")');
const logoutOption = page.locator('button:has-text("登出")');

// 驗證這些項目可見
await expect(settingsOption).toBeVisible({ timeout: 5000 });
await expect(studentCoursesOption).toBeVisible({ timeout: 5000 });
await expect(myPlansOption).toBeVisible({ timeout: 5000 });
await expect(logoutOption).toBeVisible({ timeout: 5000 });

// Teacher 項目應該不可見
const teacherProfileOption = page.locator('a:has-text("個人檔案")');
await expect(teacherProfileOption).not.toBeVisible({ timeout: 1000 });
```

### Teacher 角色 Dropdown 驗證
```typescript
// Teacher 應該看到的菜單項
const teacherProfileOption = page.locator('a:has-text("個人檔案")');
const settingsOption = page.locator('a:has-text("個人設定")');
const myPlansOption = page.locator('a:has-text("方案與價格")');
const logoutOption = page.locator('button:has-text("登出")');

// 驗證這些項目可見
await expect(teacherProfileOption).toBeVisible({ timeout: 5000 });
await expect(settingsOption).toBeVisible({ timeout: 5000 });
await expect(myPlansOption).toBeVisible({ timeout: 5000 });
await expect(logoutOption).toBeVisible({ timeout: 5000 });

// Student 項目應該不可見
const studentCoursesOption = page.locator('a:has-text("學生的課程訂單")');
await expect(studentCoursesOption).not.toBeVisible({ timeout: 1000 });
```

### 角色標籤驗證
```typescript
// Student 應該看到角色標籤為「學生」或「使用者」
const roleInNavbar = page.locator('.menu-user div').last();
await expect(roleInNavbar).toHaveText(/學生|使用者/);

// Teacher 應該看到角色標籤為「教師」
await expect(roleInNavbar).toHaveText(/教師/);
```

### 防錯重點 - 避免定位器失效
```typescript
// ✅ 正確做法：在打開 Dropdown 的情況下執行所有操作
const avatarButton = page.locator('.menu-avatar-button');
await avatarButton.click();
await page.waitForTimeout(500);

// 立即驗證所有菜單項
const option1 = page.locator('a:has-text("項目1")');
await expect(option1).toBeVisible();

// 直接執行操作（如登出），無需重新打開
const logoutOption = page.locator('button:has-text("登出")');
await logoutOption.click();

// ❌ 錯誤做法：重新打開後使用舊定位器
await page.press('Escape');
await page.waitForTimeout(300);
await avatarButton.click();
await page.waitForTimeout(500);

// 這個定位器已失效，會導致測試失敗
await expect(option1).toBeVisible(); // ❌ 定位器丟失引用
```
