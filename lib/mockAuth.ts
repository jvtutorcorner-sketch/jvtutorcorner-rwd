// lib/mockAuth.ts

export type PlanId = 'basic' | 'pro' | 'elite' | 'viewer';

export const PLAN_LABELS: Record<PlanId, string> = {
  basic: 'Basic 普通會員',
  pro: 'Pro 中級會員',
  elite: 'Elite 高級會員',
  viewer: '新辦帳戶',
};

export const PLAN_DESCRIPTIONS: Record<PlanId, string> = {
  basic: '入門體驗：1對1視訊，無白板',
  pro: '主力方案：白板互動、小班制 2-6 人，錄影回放',
  elite: 'VIP 方案：大班制最多 30 人，家長旁聽，學習報表',
  viewer: '新辦帳戶：僅提供查詢師資與課程的基本功能',
};

export const PLAN_PRICES: Record<PlanId, string> = {
  basic: 'NT$199 / 月',
  pro: 'NT$599 / 月',
  elite: 'NT$1,499 / 月',
  viewer: 'NT$0 / 月（新辦方案）',
};

export const PLAN_FEATURES: Record<PlanId, string[]> = {
  basic: [
    '可預約老師',
    '1對1 一般畫質視訊上課',
    '無內建白板（Basic 方案不包含白板）',
    'App 基本功能：課表、通知、簡單評價',
  ],
  pro: [
    '高畫質視訊（720p / 1080p）',
    '內建對話白板，教師可授權學生白板書寫',
    '小班制 2–6 人同課，下辫旁聽旁聽',
    '課後雲端錄影回放（保留 7–30 天）',
    '優先客服：App 內客服／Line 客服',
    '老師選擇更多，可篩選專長、評價、時薪區間',
  ],
  elite: [
    '高速視訊、優先走高頻寬節點',
    '大班制最多 30 人同時上課',
    '家長旁聽連線（旁聽薪對總人數不占位）',
    '完整錄影，雲端保留 180–365 天，可提供下載',
    '高端師資：資深老師、名校背景、雙語／全英教學',
    '專屬客服窗口與學習報表：出席率、時數、主題統計',
  ],
  viewer: [
    '僅能瀏覽與查詢老師和課程清單',
    '無法預約或參與付費課程',
    '無白板與錄影回放功能',
  ],
};

export const PLAN_TARGETS: Record<PlanId, string> = {
  viewer: '僅供瀏覽與查詢師資／課程的使用者。',
  basic: '剛開始嘗試線上家教、想先試水溫的學生與家長。',
  pro: '固定每週上課、重視白板互動與小班制學習的學生／家長。',
  elite: '國際學校、補教體系、願投資高額家教且想要家長旁聽的 VIP 家長。',
};

export const TEST_PASSWORD = '123456';

export const MOCK_USERS: Record<
  string,
  { plan: PlanId; displayName: string; firstName: string; lastName: string; teacherId?: string }
> = {
  'basic@test.com': {
    plan: 'basic',
    displayName: 'Basic 測試帳號',
    firstName: '三',
    lastName: '張',
  },
  'pro@test.com': {
    plan: 'pro',
    displayName: 'Pro 測試帳號',
    firstName: '四',
    lastName: '李',
  },
  'elite@test.com': {
    plan: 'elite',
    displayName: 'Elite 測試帳號',
    firstName: '五',
    lastName: '王',
  },
  // removed legacy demo teacher 'teacher@test.com'
  // Teacher demo accounts mapped to real local profile emails
  // 'lin@test.com' corresponds to teacher id 't1' (林老師)
  'lin@test.com': {
    plan: 'pro',
    displayName: '林老師',
    firstName: '林',
    lastName: '',
    teacherId: 't1',
  },
  // 'chen@test.com' corresponds to teacher id 't2' (陳老師)
  'chen@test.com': {
    plan: 'pro',
    displayName: '陳老師',
    firstName: '陳',
    lastName: '',
    teacherId: 't2',
  },
  // 'wang@test.com' corresponds to teacher id 't3' (王老師)
  'wang@test.com': {
    plan: 'pro',
    displayName: '王老師',
    firstName: '王',
    lastName: '',
    teacherId: 't3',
  },
  // (removed optional fourth demo teacher)
};

export type StoredUser = {
  email: string;
  plan: PlanId;
  // optional role for admin/teacher demo
  role?: 'admin' | 'user' | 'teacher' | string;
  // optional teacher id for demo teacher accounts
  teacherId?: string;
  // roid_id is used for DynamoDB primary key matching
  roid_id?: string;
  // optional display/name fields used in various UIs
  displayName?: string;
  firstName?: string;
  lastName?: string;
};

export const STORAGE_KEY = 'tutor_mock_user';
export const SESSION_START_KEY = 'tutor_session_start';

// 取得目前登入使用者（從 localStorage）
export function getStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredUser;
    if (!parsed?.email || !parsed?.plan) return null;
    return parsed;
  } catch {
    return null;
  }
}

// 設定登入使用者
export function setStoredUser(user: StoredUser) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  // Set session start timestamp when user logs in
  try {
    window.localStorage.setItem(SESSION_START_KEY, String(Date.now()));
  } catch { }
}

// 登出
export function clearStoredUser() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  try {
    // remove both possible session keys for compatibility
    window.localStorage.removeItem('tutor_session_expiry');
    window.localStorage.removeItem(SESSION_START_KEY);
  } catch { }
}

export function getSessionStart(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(SESSION_START_KEY);
    if (!v) return null;
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  } catch { }
  return null;
}

export function setSessionStart(ms: number) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SESSION_START_KEY, String(ms));
  } catch { }
}
