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

      {(settings?.mode === 'subscription' || !settings?.mode) && (
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
      )}

      {(settings?.mode === 'points' || !settings?.mode) && (
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
      )}

    </div>
  );
}
