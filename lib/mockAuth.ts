// lib/mockAuth.ts

export type PlanId = 'basic' | 'pro' | 'elite' | 'viewer' | 'points_100' | 'points_500' | 'points_1000';

export const PLAN_LABELS: Record<PlanId, string> = {
  basic: 'Basic 普通會員',
  pro: 'Pro 中級會員',
  elite: 'Elite 高級會員',
  viewer: '新辦帳戶',
  points_100: '100 點數方案',
  points_500: '500 點數方案',
  points_1000: '1000 點數方案',
};

export const PLAN_DESCRIPTIONS: Record<PlanId, string> = {
  basic: '入門體驗：1對1視訊，無白板',
  pro: '主力方案：白板互動、小班制 2-6 人，錄影回放',
  elite: 'VIP 方案：大班制最多 30 人，家長旁聽，學習報表',
  viewer: '新辦帳戶：僅提供查詢師資與課程的基本功能',
  points_100: '輕量點數：適合單堂體驗與小額儲值',
  points_500: '超值點數：適合常規上課，附贈額外紅利',
  points_1000: '大額點數：適合長期規劃，享有最優惠匯率',
};

export const PLAN_PRICES: Record<PlanId, string> = {
  basic: 'NT$199 / 月',
  pro: 'NT$599 / 月',
  elite: 'NT$1,499 / 月',
  viewer: 'NT$0 / 月（新辦方案）',
  points_100: 'NT$100',
  points_500: 'NT$480',
  points_1000: 'NT$900',
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
  points_100: [
    '獲得 100 點',
    '可用於報名「點數報名」之課程',
    '點數無使用期限',
  ],
  points_500: [
    '獲得 500 點',
    '可用於報名「點數報名」之課程',
    '點數無使用期限',
  ],
  points_1000: [
    '獲得 1000 點',
    '可用於報名「點數報名」之課程',
    '點數無使用期限',
  ],
};

export const PLAN_TARGETS: Record<PlanId, string> = {
  viewer: '僅供瀏覽與查詢師資／課程的使用者。',
  basic: '剛開始嘗試線上家教、想先試水溫的學生與家長。',
  pro: '固定每週上課、重視白板互動與小班制學習的學生／家長。',
  elite: '國際學校、補教體系、願投資高額家教且想要家長旁聽的 VIP 家長。',
  points_100: '想先買少量點數試上一兩堂課的學生。',
  points_500: '有固定上課需求，買剛好點數的學生。',
  points_1000: '每週高度上課，想要以更划算價格買點數的學生。',
};

export const MOCK_USERS: Record<
  string,
  { plan: PlanId; displayName: string; firstName: string; lastName: string; teacherId?: string }
> = {};

export type StoredUser = {
  email: string;
  plan: PlanId;
  // optional role for admin/teacher demo
  role?: 'admin' | 'user' | 'teacher' | string;
  // optional teacher id for demo teacher accounts
  teacherId?: string;
  // roid_id is used for DynamoDB primary key matching
  roid_id?: string;
  id?: string;
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
