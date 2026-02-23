// app/pricing/page.tsx
'use client';

import { useEffect, useState } from 'react';
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
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const PLANS: PlanConfig[] = [
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
    alert(t('alert_logged_out'));
  };

  function handleSwitchAccount() {
    router.push('/login');
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>{t('pricing_title')}</h1>
        <p>
          {t('pricing_description')}
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
                  <small>{t('pricing_price_note')}</small>
                </div>

                <div className="pricing-target">
                  <h3>{t('pricing_target_title')}</h3>
                  <p>{plan.target}</p>
                </div>

                <div className="pricing-features">
                  <h3>{t('pricing_features_title')}</h3>
                  <ul>
                    {plan.features.map((f) => (
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
      {/* 升級方案 / 付款 已移除 */}
    </div>
  );
}
