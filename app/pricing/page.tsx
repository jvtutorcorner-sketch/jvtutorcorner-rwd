// app/pricing/page.tsx
'use client';
export const dynamic = 'force-dynamic';


import { useEffect, useState, Fragment } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/IntlProvider';
import {
  PLAN_LABELS,
  PLAN_DESCRIPTIONS,
  PLAN_PRICES,
  PLAN_FEATURES,
  PLAN_TARGETS,
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

export default function PricingPage() {
  const t = useT();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [plan, setPlan] = useState<PlanId | ''>('');
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any>(null);
  const [userPoints, setUserPoints] = useState<number | null>(null);
  const [upgrades, setUpgrades] = useState<any[]>([]);
  const [loadingUpgrades, setLoadingUpgrades] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const router = useRouter();

  async function fetchUserPoints(email: string) {
    try {
      const res = await fetch(`/api/points?userId=${encodeURIComponent(email)}`, { cache: 'no-store' });
      const d = await res.json();
      if (d?.ok) setUserPoints(d.balance);
    } catch (e) {
      console.error('Failed to fetch points:', e);
      setUserPoints(null);
    }
  }

  useEffect(() => {
    setUser(getStoredUser());
    const u = getStoredUser();
    if (u) {
      setPlan(u.plan);
      fetchUpgrades(u.email);
      fetchUserPoints(u.email);
    }
    fetchSettings();
    fetchSubs();

    // Listen for points updated event (useful for multi-tab or soft navigation)
    const handlePointsUpdate = () => {
      const updatedUser = getStoredUser();
      if (updatedUser?.email) fetchUserPoints(updatedUser.email);
    };

    // Handle BFCache (Back-Forward Cache) to refresh when user navigates back to this page
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) { // If loaded from BFCache
        const updatedUser = getStoredUser();
        if (updatedUser?.email) fetchUserPoints(updatedUser.email);
      }
    };

    window.addEventListener('tutor:points-updated', handlePointsUpdate);
    window.addEventListener('pageshow', handlePageShow);
    
    return () => {
      window.removeEventListener('tutor:points-updated', handlePointsUpdate);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  async function fetchSettings() {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/pricing');
      const data = await res.json();
      if (data.ok && data.settings) {
        setSettings(data.settings);
      }
    } catch (err) {
      console.error('Failed to fetch pricing settings:', err);
    } finally {
      setLoading(false);
    }
  }

  const [dynamicSubs, setDynamicSubs] = useState<any[]>([]);
  async function fetchSubs() {
    try {
      const res = await fetch('/api/admin/subscriptions');
      const data = await res.json();
      if (data.ok && data.subscriptions) {
        setDynamicSubs(data.subscriptions);
      }
    } catch (err) {
      console.error('Failed to fetch subscriptions:', err);
    }
  }

  const dynamicPlansFromSettings = settings?.plans?.filter((p: any) => p.isActive) || [];
  const dynamicPlansFromSubs = dynamicSubs.filter((p: any) => p.type === 'PLAN' && p.isActive) || [];

  // Combine, preferring subscriptions as the newer source
  const mergedPlans = [...dynamicPlansFromSubs];
  dynamicPlansFromSettings.forEach((p: any) => {
    if (!mergedPlans.find(m => m.id === p.id)) {
      mergedPlans.push(p);
    }
  });
  mergedPlans.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

  const dynamicPointsPlans = settings?.pointPackages?.filter((p: any) => p.isActive).sort((a: any, b: any) => a.order - b.order) || [];
  const appPlansFromSettings = settings?.appPlans || [];

  const formatDate = (d?: Date | string) => {
    if (!d) return '';
    try {
      return new Date(d).toLocaleDateString('zh-TW');
    } catch (e) {
      return String(d);
    }
  };

  const PLANS: any[] = mergedPlans.length > 0 ? mergedPlans.map((p: any) => ({
    id: p.id,
    label: p.label,
    badge: p.badge,
    priceHint: p.priceHint,
    target: p.targetAudience,
    features: p.features || (p.includedFeatures ? p.includedFeatures.split('、') : []),
    description: p.includedFeatures,
    discountPlanId: p.discountPlanId,
    appPlanIds: p.appPlanIds || [],
  })) : [
    {
      id: 'viewer',
      badge: t('plan_viewer_badge'),
      priceHint: t('plan_viewer_price_hint'),
      target: t('plan_viewer_target'),
      features: [
        t('plan_viewer_feature1'),
        t('plan_viewer_feature2'),
        t('plan_viewer_feature3'),
      ],
    },
    {
      id: 'basic',
      priceHint: t('plan_basic_price_hint'),
      target: t('plan_basic_target'),
      features: [
        t('plan_basic_feature1'),
        t('plan_basic_feature2'),
        t('plan_basic_feature3'),
        t('plan_basic_feature4'),
      ],
    },
    {
      id: 'pro',
      priceHint: t('plan_pro_price_hint'),
      badge: t('plan_pro_badge'),
      target: t('plan_pro_target'),
      features: [
        t('plan_pro_feature1'),
        t('plan_pro_feature2'),
        t('plan_pro_feature3'),
        t('plan_pro_feature4'),
        t('plan_pro_feature5'),
      ],
    },
    {
      id: 'elite',
      priceHint: t('plan_elite_price_hint'),
      target: t('plan_elite_target'),
      features: [
        t('plan_elite_feature1'),
        t('plan_elite_feature2'),
        t('plan_elite_feature3'),
        t('plan_elite_feature4'),
        t('plan_elite_feature5'),
      ],
    },
  ];

  const POINTS_PLANS: any[] = dynamicPointsPlans.length > 0 ? dynamicPointsPlans.map((p: any) => {
    const discountPlan = settings.discountPlans?.find((dp: any) => dp.id === p.discountPlanId && dp.isActive);
    let finalPrice = p.price; // p.price is already calculated in the setting save, but we can re-verify if needed

    return {
      id: p.id,
      label: p.name,
      originalPrice: p.unitPrice * p.points,
      manualDiscount: p.manualDiscount || 0,
      price: p.price,
      priceHint: `NT$ ${p.price}`,
      target: p.description || '',
      features: [`${p.points} 點${p.manualDiscount ? ` (已省 NT$ ${p.manualDiscount})` : ''}`],
      badge: p.badge,
      description: p.description,
      discountPlan: discountPlan,
      appPlanIds: p.appPlanIds || [],
      prePurchasePointsCost: p.prePurchasePointsCost || 0,
      points: p.points,
    };
  }) : [
    {
      id: 'points_100',
      priceHint: PLAN_PRICES['points_100'],
      target: PLAN_TARGETS['points_100'],
      features: PLAN_FEATURES['points_100'],
    },
    {
      id: 'points_500',
      priceHint: PLAN_PRICES['points_500'],
      badge: '熱門選擇',
      target: PLAN_TARGETS['points_500'],
      features: PLAN_FEATURES['points_500'],
    },
    {
      id: 'points_1000',
      priceHint: PLAN_PRICES['points_1000'],
      target: PLAN_TARGETS['points_1000'],
      features: PLAN_FEATURES['points_1000'],
    },
  ];

  async function fetchUpgrades(email: string) {
    setLoadingUpgrades(true);
    try {
      const res = await fetch(`/api/plan-upgrades?userId=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (data.ok && data.data) {
        setUpgrades(
          data.data.sort(
            (a: any, b: any) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingUpgrades(false);
    }
  }

  const handleLogout = () => {
    clearStoredUser();
    setUser(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('tutor:auth-changed'));
    }
    router.refresh();
    alert(t('alert_logged_out'));
  };

  function handleSwitchAccount() {
    router.push('/login');
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>{settings?.pageTitle || t('pricing_title')}</h1>
        <p>
          {settings?.pageDescription || t('pricing_description')}
        </p>


        {/* Auth tag removed from Pricing page per request */}
      </header>

      <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg border">
        {user ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-lg">{user.displayName || user.email.split('@')[0] || user.email}</div>
              <div className="text-sm text-gray-500">{user.email}</div>
              <div className="text-sm text-gray-500">方案：{user.plan}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">點數餘額</div>
              <div className="text-2xl font-bold text-indigo-600">{userPoints !== null ? `${userPoints} 點` : '—'}</div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-600">請登入以檢視帳戶與點數資訊。 <Link href="/login" className="underline">登入</Link></div>
        )}
      </div>

      {mergedPlans.length > 0 && (
        <section className="section">
          <header className="page-header" style={{ marginBottom: '2rem' }}>
            <h2>訂閱方案</h2>
            <p>訂閱方案可享有特定期間內的完整功能與服務。</p>
          </header>
          <div className="card-grid">
            {PLANS.filter(p => p.id !== 'viewer').map((plan) => {
              const isCurrent = user?.plan === plan.id;

              return (
                <div
                  key={plan.id}
                  className={`card pricing-card ${plan.badge ? 'pricing-card-highlight' : ''
                    }`}
                >
                  <header className="pricing-header">
                    <h2>{plan.label || (PLAN_LABELS as any)[plan.id] || plan.id}</h2>
                    <p className="pricing-subtitle">
                      {plan.description || (PLAN_DESCRIPTIONS as any)[plan.id] || ''}
                    </p>
                    {plan.badge && (
                      <span className="tag tag-accent">{plan.badge}</span>
                    )}
                  </header>

                  <div className="pricing-price">
                    {(() => {
                      const discountPlan = settings?.discountPlans?.find((dp: any) => dp.id === plan.discountPlanId && dp.isActive);
                      // In the current implementation, plan.price is the final price saved in DB. 
                      // However, if we want to show "Original vs Discounted", we might need the original price.
                      // For now, let's assume we show the price as is, but if there's a discountPlan, we can add a note.
                      return (
                        <>
                          <p>{plan.priceHint}</p>
                        </>
                      );
                    })()}
                    <small>{t('pricing_price_note')}</small>
                  </div>

                  <div className="card-actions mb-4">
                    {isCurrent ? (
                      <button className="card-button" disabled>
                        {t('pricing_current_plan')}
                      </button>
                    ) : user ? (
                      <Link
                        href={`/pricing/checkout?plan=${plan.id}`}
                        className="card-button primary"
                      >
                        {t('pricing_upgrade')}
                      </Link>
                    ) : (
                      <Link
                        href="/login"
                        className="card-button primary"
                      >
                        {t('pricing_login_to_use')}
                      </Link>
                    )}
                  </div>

                  <div className="pricing-target">
                    <h3>{t('pricing_target_title')}</h3>
                    <p>{plan.target}</p>
                  </div>

                  <div className="pricing-features">
                    <h3>{t('pricing_features_title')}</h3>
                    <ul>
                      {plan.features.map((f: string) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>

                  {plan.appPlanIds && plan.appPlanIds.length > 0 && (
                    <div className="mt-3">
                      <h3 className="text-sm font-medium text-gray-600">綁定應用服務</h3>
                      <ul className="text-sm text-gray-700 mt-1">
                        {plan.appPlanIds.map((apid: string) => {
                          const ap = appPlansFromSettings.find((a: any) => a.id === apid);
                          const days = ap?.durationDays || ap?.duration || ap?.days;
                          let period = null;
                          if (days && typeof days === 'number') {
                            const start = new Date();
                            const end = new Date(start);
                            end.setDate(start.getDate() + days);
                            period = `${formatDate(start)} → ${formatDate(end)}`;
                          }
                          const pointsCost = ap?.pointsCost;
                          return (
                            <li key={apid} className="truncate">
                              {ap?.name || apid}{ap?.appName ? ` — ${ap.appName}` : ''}
                              {period && <div className="text-xs text-gray-500">{period}</div>}
                              {pointsCost && pointsCost > 0 && <div className="text-xs text-orange-500">💰 需消耗 {pointsCost} 點</div>}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {dynamicPointsPlans.length > 0 && (
        <section className="section" style={{ marginTop: '2rem' }}>
          <header className="page-header" style={{ marginBottom: '2rem' }}>
            <h2>點數方案</h2>
            <p>單次購買點數，依特定課程需求彈性扣點，免綁約更自在。</p>
          </header>

          <div className="card-grid">
            {POINTS_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`card pricing-card ${plan.badge ? 'pricing-card-highlight' : ''}`}
              >
                <header className="pricing-header">
                  <h2>{plan.label || (PLAN_LABELS as any)[plan.id] || plan.id}</h2>
                  <p className="pricing-subtitle">
                    {plan.description || (PLAN_DESCRIPTIONS as any)[plan.id] || ''}
                  </p>
                  {plan.badge && (
                    <span className="tag tag-accent">{plan.badge}</span>
                  )}
                </header>

                <div className="pricing-price">
                  {plan.originalPrice > plan.price ? (
                    <div className="flex flex-col">
                      <span className="text-sm text-gray-400 line-through">NT$ {plan.originalPrice}</span>
                      <p className="text-green-600 font-bold">{plan.priceHint}</p>
                    </div>
                  ) : (
                    <p>{plan.priceHint}</p>
                  )}
                  <small>一次性付費</small>
                </div>

                <div className="card-actions mb-4">
                  {user ? (
                    <Link
                      href={`/pricing/checkout?plan=${plan.id}`}
                      className="card-button primary"
                    >
                      購買點數
                    </Link>
                  ) : (
                    <Link
                      href="/login"
                      className="card-button primary"
                    >
                      {t('pricing_login_to_use')}
                    </Link>
                  )}
                </div>

                <div className="pricing-target">
                  <h3>{t('pricing_target_title')}</h3>
                  <p>{plan.target}</p>
                </div>

                <div className="pricing-features">
                  <h3>{t('pricing_features_title')}</h3>
                  <ul>
                    {plan.features.map((f: string) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>

                {plan.appPlanIds && plan.appPlanIds.length > 0 && (
                  <div className="mt-3">
                    <h3 className="text-sm font-medium text-gray-600">綁定應用服務</h3>
                    <ul className="text-sm text-gray-700 mt-1">
                      {plan.appPlanIds.map((apid: string) => {
                        const ap = appPlansFromSettings.find((a: any) => a.id === apid);
                        const days = ap?.durationDays || ap?.duration || ap?.days;
                        let period = null;
                        if (days && typeof days === 'number') {
                          const start = new Date();
                          const end = new Date(start);
                          end.setDate(start.getDate() + days);
                          period = `${formatDate(start)} → ${formatDate(end)}`;
                        }
                        const pointsCost = ap?.pointsCost;
                        return (
                          <li key={apid} className="truncate">
                            {ap?.name || apid}{ap?.appName ? ` — ${ap.appName}` : ''}
                            {period && <div className="text-xs text-gray-500">{period}</div>}
                            {pointsCost && pointsCost > 0 && <div className="text-xs text-orange-500">💰 需消耗 {pointsCost} 點</div>}
                          </li>
                        );
                      })}
                    </ul>

                    {/* 顯示點數購買前消耗和購買後剩餘 */}
                    {plan.prePurchasePointsCost && plan.prePurchasePointsCost > 0 && (
                      <div className="mt-2 text-xs text-orange-600 bg-orange-50 p-2 rounded">
                        購買前消耗 {plan.prePurchasePointsCost} 點 → 購買 {plan.points} 點後可用 {Math.max(0, (plan.points || 0) - (plan.prePurchasePointsCost || 0))} 點
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
