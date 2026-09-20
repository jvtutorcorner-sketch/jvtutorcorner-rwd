// lib/teacherVisibility.ts
/**
 * 公開教師列表的可見性判斷。
 *
 * `/api/register` 只要 role === 'teacher' 就會立刻寫入公開教師表，而註冊表單
 * 從不送出 subjects / avatarUrl / intro / hourlyRate，因此每次 E2E 測試註冊都會
 * 在 /teachers 留下一張空白破圖卡片。這裡集中定義哪些資料不該出現在公開頁面，
 * 不對 DynamoDB 做任何寫入 —— 資料完整保留，只是不顯示。
 */

/** 測試用網域，涵蓋每次 E2E 執行產生的殘留資料 */
const TEST_EMAIL_SUFFIXES = ['@example.com', '@test.com', '@localhost'];

/** E2E helper 產生的固定命名格式，用來補 email 缺漏的情況 */
const TEST_NAME_PATTERNS = [
  /^Teacher User_\d{13}$/,
  /^group[ -]\d+-teacher$/i,
];

/**
 * 不符合上述任何 pattern、但確認為測試用途的個別資料。
 * 刻意逐筆明列而非用 plus-alias 之類的啟發式規則：筆數少、可預測，
 * 也不會誤擋日後真的用 plus alias 註冊的老師。
 */
export const HIDDEN_TEACHER_IDS: ReadonlySet<string> = new Set([
  '17aa66e8-1106-49d1-9329-d3526c0afa36', // J T / pizzahotbro@gmail.com
  'dccd5d2f-7111-412a-931c-5e2e1b0ac1ca', // hsu su / n7842165+1@gmail.com
  '6acd6b7b-7903-4641-beb1-3dabc29a6321', // hi sj / n7842165+2@gmail.com
]);

/** email 屬於測試網域 */
export function isTestTeacherEmail(email?: unknown): boolean {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.endsWith('.test')) return true;
  return TEST_EMAIL_SUFFIXES.some(suffix => normalized.endsWith(suffix));
}

/** 名稱符合 E2E helper 的自動產生格式 */
export function isTestTeacherName(name?: unknown): boolean {
  if (typeof name !== 'string') return false;
  const normalized = name.trim();
  if (!normalized) return false;
  return TEST_NAME_PATTERNS.some(pattern => pattern.test(normalized));
}

/**
 * 這筆教師資料是否該出現在公開頁面。
 * 已含既有的 status === 'resigned' 判斷，呼叫端只需要這一個條件。
 */
export function isPubliclyVisibleTeacher(teacher: any): boolean {
  if (!teacher) return false;
  if (teacher.status === 'resigned') return false;

  const id = teacher.id || teacher.roid_id;
  if (id && HIDDEN_TEACHER_IDS.has(String(id))) return false;

  if (isTestTeacherEmail(teacher.email)) return false;
  if (isTestTeacherName(teacher.name)) return false;
  if (isTestTeacherName(teacher.displayName)) return false;

  return true;
}
