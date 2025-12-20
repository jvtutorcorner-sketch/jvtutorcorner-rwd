// app/pricing/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  PLAN_LABELS,
  PLAN_DESCRIPTIONS,
  PLAN_PRICES,
  PLAN_FEATURES,
  getStoredUser,
  clearStoredUser,
  setStoredUser,
  StoredUser,
  PlanId,
} from '@/lib/mockAuth';

type PlanConfig = {
  id: PlanId;
  priceHint: string;
  badge?: string;
  features: string[];
  target: string;
};

const PLANS: PlanConfig[] = [
  {
    id: 'viewer',
    badge: '預設',
    priceHint: 'NT$0 / 僅查詢',
    target: '僅供瀏覽與查詢師資／課程的使用者。',
    features: [
      '僅能瀏覽與查詢老師和課程清單',
      '無法預約或參與付費課程',
      '無白板與錄影回放功能',
    ],
  },
  {
    id: 'basic',
    priceHint: '最低入門價（可到時再定價）',
    target: '剛開始嘗試線上家教、想先試水溫的學生與家長。',
    features: [
      '可預約老師',
      '一般畫質視訊上課',
      '無內建白板（可自行使用紙本或截圖）',
      'App 基本功能：課表、通知、簡單評價',
    ],
  },
  {
    id: 'pro',
    priceHint: '主力方案，建議訂為 Basic 的 2–3 倍',
    badge: '推薦',
    target: '固定每週上課、重視白板與錄影回放的學生／家長。',
    features: [
      '高畫質視訊（720p / 1080p 視實作而定）',
      '內建線上白板，可畫圖、寫題目、標註重點',
      '課後雲端錄影回放（保留 7–30 天，可再調整）',
      '優先客服：App 內客服／Line 客服',
      '老師選擇更多，可篩選專長、評價、時薪區間',
    ],
  },
  {
    id: 'elite',
    priceHint: '高客單價、可採合約制或專案報價',
    target: '國際學校、補教體系或願意投資高額家教的 VIP 家長。',
    features: [
      '高速視訊、優先走高頻寬節點',
      '支援並行串流：小班團體課＋家長旁聽',
      '完整錄影，雲端保留 180–365 天，並可提供下載',
      '高端師資：資深老師、名校背景、雙語／全英教學',
      '專屬客服窗口與學習報表：出席率、時數、主題統計',
    ],
  },
];

export default function PricingPage() {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [plan, setPlan] = useState<PlanId | ''>('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardCountry, setCardCountry] = useState('TW');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
    const u = getStoredUser();
    if (u) setPlan(u.plan);
  }, []);

  const handleLogout = () => {
    clearStoredUser();
    setUser(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('tutor:auth-changed'));
    }
    router.refresh();
    alert('已登出測試帳號。');
  };
  const router = useRouter();

  function handleSwitchAccount() {
    router.push('/login');
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>方案與價格（Pricing）</h1>
        <p>
          依照不同的學習深度與需求，將家教平台分為{' '}
          <strong>Basic / Pro / Elite</strong> 三種方案，
          核心差異在於視訊品質、白板與錄影回放、以及師資與服務等級。
        </p>

        {/* Auth tag removed from Pricing page per request */}
      </header>

      <section className="section">
        <div className="card-grid">
          {PLANS.filter(p => p.id !== 'viewer').map((plan) => {
            const isCurrent = user?.plan === plan.id;

            return (
              <div
                key={plan.id}
                className={`card pricing-card ${
                  plan.badge ? 'pricing-card-highlight' : ''
                }`}
              >
                <header className="pricing-header">
                  <h2>{PLAN_LABELS[plan.id]}</h2>
                  <p className="pricing-subtitle">
                    {PLAN_DESCRIPTIONS[plan.id]}
                  </p>
                  {plan.badge && (
                    <span className="tag tag-accent">{plan.badge}</span>
                  )}
                </header>

                <div className="pricing-price">
                  <p>{plan.priceHint}</p>
                  <small>（實際價格可在上線前再細部調整）</small>
                </div>

                <div className="pricing-target">
                  <h3>適合對象</h3>
                  <p>{plan.target}</p>
                </div>

                <div className="pricing-features">
                  <h3>包含功能</h3>
                  <ul>
                    {plan.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>

                <div className="card-actions">
                  {isCurrent ? (
                    <button className="card-button" disabled>
                      ✓ 您目前已啟用此方案
                    </button>
                  ) : (
                    <Link
                      href="/login"
                      className="card-button primary"
                    >
                      登入以使用此方案
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      {/* 升級方案 / 付款 已移除 */}
    </div>
  );
}
