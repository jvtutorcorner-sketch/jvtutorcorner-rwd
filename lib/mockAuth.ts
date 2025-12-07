// lib/mockAuth.ts

export type PlanId = 'basic' | 'pro' | 'elite' | 'viewer';

export const PLAN_LABELS: Record<PlanId, string> = {
  basic: 'Basic 普通會員',
  pro: 'Pro 中級會員',
  elite: 'Elite 高級會員',
  viewer: '新辦帳戶',
};

export const PLAN_DESCRIPTIONS: Record<PlanId, string> = {
  basic: '入門體驗、最低價策略',
  pro: '白板 + 錄影回放的主力方案',
  elite: '高端師資與完整錄影的 VIP 方案',
  viewer: '新辦帳戶：僅提供查詢師資與課程的基本功能',
};

export const PLAN_PRICES: Record<PlanId, string> = {
  basic: 'NT$0 / 月（試用）',
  pro: 'NT$499 / 月',
  elite: 'NT$1,999 / 月',
  viewer: 'NT$0 / 月（新辦方案）',
};

export const PLAN_FEATURES: Record<PlanId, string[]> = {
  basic: [
    '有限的課程瀏覽與試聽',
    '社群功能（留言、評價）',
    '基礎教學支援',
  ],
  pro: [
    '完整白板功能',
    '錄影回放（30 天保存）',
    '進階課程搜尋與篩選',
  ],
  elite: [
    '白板與長期錄影（無限保存）',
    '專屬高端師資推薦',
    '一對一客服與優先支援',
  ],
  viewer: [
    '僅能瀏覽與查詢老師和課程清單',
    '無法預約或參與付費課程',
    '無白板與錄影回放功能',
  ],
};

export const TEST_PASSWORD = '123456';

export const MOCK_USERS: Record<
  string,
  { plan: PlanId; displayName: string }
> = {
  'basic@test.com': {
    plan: 'basic',
    displayName: 'Basic 測試帳號',
  },
  'pro@test.com': {
    plan: 'pro',
    displayName: 'Pro 測試帳號',
  },
  'elite@test.com': {
    plan: 'elite',
    displayName: 'Elite 測試帳號',
  },
};

export type StoredUser = {
  email: string;
  plan: PlanId;
  // optional role for admin demo: 'admin' means elevated permissions
  role?: 'admin' | 'user';
};

export const STORAGE_KEY = 'tutor_mock_user';

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
}

// 登出
export function clearStoredUser() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
