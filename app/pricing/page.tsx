// app/pricing/page.tsx
'use client';

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
  const [upgrades, setUpgrades] = useState<any[]>([]);
  const [loadingUpgrades, setLoadingUpgrades] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setUser(getStoredUser());
    const u = getStoredUser();
    if (u) {
      setPlan(u.plan);
      fetchUpgrades(u.email);
    }
    fetchSettings();
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

  const dynamicPlans = settings?.plans?.filter((p: any) => p.isActive).sort((a: any, b: any) => a.order - b.order) || [];
  const dynamicPointsPlans = settings?.pointPackages?.filter((p: any) => p.isActive).sort((a: any, b: any) => a.order - b.order) || [];

  const PLANS: any[] = dynamicPlans.length > 0 ? dynamicPlans.map((p: any) => ({
    id: p.id,
    label: p.label,
    badge: p.badge,
    priceHint: p.priceHint,
    target: p.targetAudience,
    features: p.features || (p.includedFeatures ? p.includedFeatures.split('、') : []),
    description: p.includedFeatures,
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

  const POINTS_PLANS: any[] = dynamicPointsPlans.length > 0 ? dynamicPointsPlans.map((p: any) => ({
    id: p.id,
    label: p.name,
    priceHint: `NT$ ${p.price}`,
    target: p.description || '',
    features: [`${p.points} 點${p.bonus ? ` + 贈送 ${p.bonus} 點` : ''}`],
    badge: p.badge,
    description: p.description,
  })) : [
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

      <section className="section">
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
                  <p>{plan.priceHint}</p>
                  <small>{t('pricing_price_note')}</small>
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

                <div className="card-actions">
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
              </div>
            );
          })}
        </div>
      </section>

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
                <p>{plan.priceHint}</p>
                <small>一次性付費</small>
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

              <div className="card-actions">
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
            </div>
          ))}
        </div>
      </section>
      {/* 升級方案 / 付款 已移除 */}
      {user && (
        <section className="section" style={{ marginTop: '2rem' }}>
          <header className="page-header" style={{ marginBottom: '2rem' }}>
            <h2>付款紀錄與方案狀態</h2>
            <p>查看您的升級與點數購買紀錄</p>
          </header>

          {loadingUpgrades ? (
            <p>{t('loading') || '載入中...'}</p>
          ) : upgrades.length === 0 ? (
            <p>{t('no_orders') || '尚無付款紀錄'}</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="orders-table" style={{ borderCollapse: 'collapse', border: '1px solid #ddd', width: '100%', marginBottom: '12px', minWidth: '800px' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>方案</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>金額</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>訂單流程</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>方案開始時間</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>方案結束時間</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {upgrades.map((o) => {
                    const status = (o.status || 'PENDING').toUpperCase();
                    let flowSteps = [0, 0, 0, 0]; // [Created, Pending, Paid, Completed]

                    if (status === 'PENDING') flowSteps = [1, 1, 0, 0];
                    else if (status === 'PAID') flowSteps = [1, 1, 1, 0];
                    else if (status === 'COMPLETED') flowSteps = [1, 1, 1, 1];
                    else if (status === 'CANCELLED' || status === 'REFUNDED') flowSteps = [1, 0, 0, 0];

                    const isPoints = o.planId?.startsWith('points_');
                    let startStr = '-';
                    let endStr = '-';
                    if (o.createdAt) {
                      const st = new Date(o.createdAt);
                      startStr = st.toLocaleString();
                      if (!isPoints) {
                        const en = new Date(st);
                        en.setMonth(en.getMonth() + 1);
                        endStr = en.toLocaleString();
                      }
                    }

                    const isExpanded = expandedId === o.upgradeId;

                    return (
                      <Fragment key={o.upgradeId}>
                        <tr>
                          <td style={{ border: '1px solid #ddd', padding: '6px' }}>{PLAN_LABELS[o.planId as PlanId] || o.planId}</td>
                          <td style={{ border: '1px solid #ddd', padding: '6px' }}>{o.amount} {o.currency || 'TWD'}</td>
                          <td style={{ border: '1px solid #ddd', padding: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                              {['Created', 'Pending', 'Paid', 'Completed'].map((step, i) => (
                                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <span style={{
                                    width: 20, height: 20, borderRadius: 10,
                                    background: flowSteps[i] ? '#0366d6' : '#fff',
                                    color: flowSteps[i] ? '#fff' : '#999',
                                    border: '1px solid #0366d6',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 11, fontWeight: 'bold'
                                  }}>
                                    {flowSteps[i] ? '✓' : (i + 1)}
                                  </span>
                                  {i < 3 && <span style={{ color: flowSteps[i] && flowSteps[i + 1] ? '#0366d6' : '#ddd', fontSize: 10 }}>→</span>}
                                </span>
                              ))}
                              {(status === 'CANCELLED' || status === 'REFUNDED') && (
                                <span style={{
                                  marginLeft: 4, padding: '2px 6px', borderRadius: 3,
                                  background: '#f8d7da', color: '#721c24', fontSize: 11, fontWeight: 'bold'
                                }}>
                                  {status}
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ border: '1px solid #ddd', padding: '6px', fontSize: 12 }}>{startStr}</td>
                          <td style={{ border: '1px solid #ddd', padding: '6px', fontSize: 12 }}>{isPoints ? '無期限' : endStr}</td>
                          <td style={{ border: '1px solid #ddd', padding: '6px' }}>
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : o.upgradeId)}
                              style={{
                                padding: '4px 8px', fontSize: '12px',
                                background: isExpanded ? '#28a745' : '#0366d6',
                                color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer'
                              }}
                            >
                              {isExpanded ? '隱藏' : '詳情'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} style={{ border: '1px solid #ddd', padding: '12px', background: '#f9f9f9' }}>
                              <h4 style={{ margin: '0 0 8px 0' }}>訂單詳細資訊</h4>
                              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>訂單編號：</strong> {o.upgradeId}</p>
                              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>建立時間：</strong> {new Date(o.createdAt).toLocaleString()}</p>
                              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>最後更新：</strong> {new Date(o.updatedAt).toLocaleString()}</p>
                              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>目前狀態：</strong> {status}</p>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
