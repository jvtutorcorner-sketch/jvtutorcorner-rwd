// lib/mockAuth.ts

export type PlanId = 'basic' | 'pro' | 'elite';

export const PLAN_LABELS: Record<PlanId, string> = {
  basic: 'Basic 普通會員',
  pro: 'Pro 中級會員',
  elite: 'Elite 高級會員',
};

export const PLAN_DESCRIPTIONS: Record<PlanId, string> = {
  basic: '入門體驗、最低價策略',
  pro: '白板 + 錄影回放的主力方案',
  elite: '高端師資與完整錄影的 VIP 方案',
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
