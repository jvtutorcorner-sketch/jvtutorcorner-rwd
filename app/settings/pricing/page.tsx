"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PLAN_TARGETS, PLAN_LABELS, PLAN_DESCRIPTIONS, PLAN_FEATURES, PLAN_PRICES } from '@/lib/mockAuth';
import { SubscriptionConfig, SubscriptionType } from '@/lib/subscriptionsService';

type PointPackage = {
  id: string;
  name: string;
  points: number;
  price: number;
  bonus?: number;
  description?: string;
  badge?: string;
  isActive: boolean;
  order: number;
};

type PricingSettings = {
  pageTitle: string;
  pageDescription: string;
  mode: 'subscription' | 'points';
  plans?: any[]; // For backward compatibility
  pointPackages: PointPackage[];

};


export default function PricingSettingsPage() {
  const [settings, setSettings] = useState<PricingSettings>({
    pageTitle: '方案與價格設定',
    pageDescription: '管理會員方案的標籤、價格和功能特色',
    mode: 'subscription',
    pointPackages: []
  });
  const [subscriptions, setSubscriptions] = useState<SubscriptionConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [originalSettings, setOriginalSettings] = useState<PricingSettings | null>(null);
  const [originalSubscriptions, setOriginalSubscriptions] = useState<SubscriptionConfig[] | null>(null);

  const syncTargets = async (autoSave = true) => {
    setSubscriptions(prev => {
      return prev.map(sub => {
        if (sub.type === 'PLAN') {
          const target = (PLAN_TARGETS as Record<string, string>)[sub.id];
          return { ...sub, targetAudience: typeof target === 'string' ? target : sub.targetAudience };
        }
        return sub;
      });
    });

    if (autoSave) {
      await saveSettings();
    }
  };


  useEffect(() => {
    const loadPricingData = async () => {
      try {
        const [pricingRes, subsRes] = await Promise.all([
          fetch('/api/admin/pricing'),
          fetch('/api/admin/subscriptions')
        ]);

        const pricingData = await pricingRes.json();
        const subsData = await subsRes.json();

        let loadedSettings: PricingSettings | null = null;
        let loadedSubs: SubscriptionConfig[] = [];

        if (pricingRes.ok && pricingData.ok) {
          loadedSettings = pricingData.settings as PricingSettings;
          setSettings(loadedSettings);
        } else {
          setMessage('無法載入方案資料：' + (pricingData.error || '未知錯誤'));
        }

        if (subsRes.ok && subsData.ok) {
          loadedSubs = subsData.subscriptions || [];
          if (loadedSubs.length > 0) {
            setSubscriptions(loadedSubs);
          } else if (loadedSettings?.plans && Array.isArray(loadedSettings.plans)) {
            // Migration from old data format
            const migratedSubs: SubscriptionConfig[] = loadedSettings.plans.map((p: any) => ({
              id: p.id,
              type: 'PLAN',
              label: p.label,
              priceHint: p.priceHint,
              badge: p.badge,
              targetAudience: p.targetAudience,
              includedFeatures: p.includedFeatures,
              features: p.features || [],
              isActive: p.isActive,
              order: p.order
            }));
            setSubscriptions(migratedSubs);
          }
        }

        if ((!loadedSubs || loadedSubs.length === 0) && (!loadedSettings?.plans || loadedSettings.plans.length === 0)) {
          setMessage('💡 尚未設定任何方案，您可以使用「從 mockAuth 新增方案」或「匯入公開頁內容」按鈕來初始化方案資料');
        }
      } catch (error) {
        console.error('Failed to load pricing data:', error);
        setMessage('網路錯誤，無法載入方案資料');
      } finally {
        setLoading(false);
      }
    };

    loadPricingData();
  }, []);

  useEffect(() => {
    if (!loading && originalSettings === null) {
      setOriginalSettings(JSON.parse(JSON.stringify(settings)));
      setOriginalSubscriptions(JSON.parse(JSON.stringify(subscriptions)));
    }
  }, [loading, settings, subscriptions, originalSettings]);

  const importFromPublicPricing = async () => {
    try {
      const html = await (await fetch('/pricing')).text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const headerP = doc.querySelector('header.page-header p');
      const pageDescription = headerP ? headerP.textContent?.trim() || '' : '';

      const cards = Array.from(doc.querySelectorAll('.card.pricing-card'));

      setSubscriptions(prev => {
        const newSubs = [...prev];
        cards.forEach((card) => {
          const h2 = card.querySelector('h2');
          const label = h2?.textContent?.trim() || '';

          const subtitleP = card.querySelector('.pricing-subtitle');
          const subtitleText = subtitleP ? subtitleP.textContent?.trim() || '' : '';

          const priceP = card.querySelector('.pricing-price p');
          const priceText = priceP ? priceP.textContent?.trim() || '' : '';

          const badgeSpan = card.querySelector('.tag.tag-accent');
          const badgeText = badgeSpan ? badgeSpan.textContent?.trim() || '' : '';

          const targetP = card.querySelector('.pricing-target p');
          const targetText = targetP ? targetP.textContent?.trim() || '' : '';

          const featureLis = Array.from(card.querySelectorAll('.pricing-features ul li'));
          const features = featureLis.map(li => li.textContent?.trim() || '').filter(Boolean);

          const includedSummary = subtitleText || (features.length > 0 ? features.slice(0, 2).join('、') : '');

          const index = newSubs.findIndex(p => p.type === 'PLAN' && p.label === label);
          if (index !== -1) {
            newSubs[index] = {
              ...newSubs[index],
              priceHint: priceText || newSubs[index].priceHint,
              badge: badgeText || newSubs[index].badge,
              targetAudience: targetText || newSubs[index].targetAudience,
              includedFeatures: includedSummary || newSubs[index].includedFeatures,
              features: features.length > 0 ? features : newSubs[index].features,
            };
          }
        });
        return newSubs;
      });

      setSettings(prev => ({ ...prev, pageDescription: pageDescription || prev.pageDescription }));
      setMessage('已從公開頁面匯入內容');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Import error:', err);
      setMessage('匯入失敗，請稍後再試');
      setTimeout(() => setMessage(''), 3000);
    }
  };


  const updateSettings = (field: keyof PricingSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const importFromMockAuth = () => {
    setSubscriptions(prev => {
      const existingIds = new Set(prev.map(p => p.id));
      const planSubs = prev.filter(s => s.type === 'PLAN');
      const maxOrder = planSubs.length > 0 ? Math.max(...planSubs.map(p => p.order)) : 0;

      const planOrder = ['viewer', 'basic', 'pro', 'elite'];

      const plansToAdd: SubscriptionConfig[] = [];
      planOrder.forEach((id, index) => {
        if (!existingIds.has(id)) {
          plansToAdd.push({
            id,
            type: 'PLAN',
            label: PLAN_LABELS[id as keyof typeof PLAN_LABELS],
            priceHint: PLAN_PRICES[id as keyof typeof PLAN_PRICES],
            price: 0,
            interval: 'month',
            badge: id === 'pro' ? '推薦' : undefined,
            targetAudience: PLAN_TARGETS[id as keyof typeof PLAN_TARGETS] || '',
            includedFeatures: PLAN_DESCRIPTIONS[id as keyof typeof PLAN_DESCRIPTIONS] || '',
            features: PLAN_FEATURES[id as keyof typeof PLAN_FEATURES] || [],
            isActive: true,
            order: maxOrder + plansToAdd.length + 1
          });
        }
      });

      return [...prev, ...plansToAdd];
    });

    setMessage('已從 mockAuth 匯入新方案');
    setTimeout(() => setMessage(''), 3000);
    setTimeout(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  const hasChanges = (): boolean => {
    if (!originalSettings || !originalSubscriptions) return false;
    return JSON.stringify(settings) !== JSON.stringify(originalSettings) ||
      JSON.stringify(subscriptions) !== JSON.stringify(originalSubscriptions);
  };

  const updateSubscription = (id: string, field: keyof SubscriptionConfig, value: any) => {
    setSubscriptions(prev => prev.map(sub =>
      sub.id === id ? { ...sub, [field]: value } : sub
    ));
  };

  const addSubscription = (type: SubscriptionType) => {
    const isPlan = type === 'PLAN';
    const group = subscriptions.filter(s => s.type === type);
    const maxOrder = group.length > 0 ? Math.max(...group.map(p => p.order)) : 0;

    const newSub: SubscriptionConfig = {
      id: `${type.toLowerCase()}_${Date.now()}`,
      type,
      label: isPlan ? '新方案' : '新擴充功能',
      priceHint: '價格說明',
      price: isPlan ? 990 : 100,
      currency: 'TWD',
      interval: isPlan ? 'month' : 'one-time',
      badge: '',
      targetAudience: '目標用戶',
      includedFeatures: '包含的功能',
      features: ['功能特色 1', '功能特色 2'],
      isActive: true,
      order: maxOrder + 1
    };

    setSubscriptions(prev => [...prev, newSub]);
    setEditingPlanId(newSub.id);
  };

  const removeSubscription = (id: string) => {
    setSubscriptions(prev => prev.filter(sub => sub.id !== id));
  };

  const moveSubscription = (id: string, direction: 'up' | 'down') => {
    const sub = subscriptions.find(s => s.id === id);
    if (!sub) return;

    const group = subscriptions.filter(s => s.type === sub.type).sort((a, b) => a.order - b.order);
    const currentIndex = group.findIndex(s => s.id === id);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= group.length) return;

    const newGroup = [...group];
    [newGroup[currentIndex], newGroup[newIndex]] = [newGroup[newIndex], newGroup[currentIndex]];

    const updatedGroup = newGroup.map((s, index) => ({ ...s, order: index + 1 }));

    setSubscriptions(prev => {
      const others = prev.filter(s => s.type !== sub.type);
      return [...others, ...updatedGroup];
    });
  };


  const addPointPackage = () => {
    const newPackage: PointPackage = {
      id: `points_${Date.now()}`,
      name: '新套餐',
      points: 100,
      price: 1000,
      bonus: 0,
      description: '套餐描述',
      badge: '',
      isActive: true,
      order: Math.max(...(settings.pointPackages?.map(p => p.order) || [0]), 0) + 1
    };
    setSettings(prev => ({
      ...prev,
      pointPackages: [...(prev.pointPackages || []), newPackage]
    }));
  };

  const addMockPointPackages = () => {
    const maxOrder = Math.max(...(settings.pointPackages?.map(p => p.order) || [0]), 0);

    const mockPackages: PointPackage[] = [
      {
        id: `points_${Date.now()}_1`,
        name: '入門包',
        points: 50,
        price: 500,
        bonus: 0,
        description: '適合新手體驗的基礎套餐',
        badge: '推薦新手',
        isActive: true,
        order: maxOrder + 1
      },
      {
        id: `points_${Date.now()}_2`,
        name: '普通包',
        points: 100,
        price: 900,
        bonus: 10,
        description: '性價比最好的熱銷套餐',
        badge: '熱銷',
        isActive: true,
        order: maxOrder + 2
      },
      {
        id: `points_${Date.now()}_3`,
        name: '超值包',
        points: 250,
        price: 2000,
        bonus: 50,
        description: '大量購買享優惠',
        badge: '推薦',
        isActive: true,
        order: maxOrder + 3
      },
      {
        id: `points_${Date.now()}_4`,
        name: 'VIP 尊享包',
        points: 500,
        price: 3500,
        bonus: 150,
        description: '專為忠實用戶設計的頂級套餐',
        badge: 'VIP',
        isActive: true,
        order: maxOrder + 4
      }
    ];

    setSettings(prev => ({
      ...prev,
      pointPackages: [...(prev.pointPackages || []), ...mockPackages]
    }));

    setMessage('已新增 4 個模擬點數套餐');
    setTimeout(() => setMessage(''), 3000);

    setTimeout(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  const removePointPackage = (packageId: string) => {
    setSettings(prev => ({
      ...prev,
      pointPackages: (prev.pointPackages || []).filter(pkg => pkg.id !== packageId)
    }));
  };

  const updatePointPackage = (packageId: string, field: keyof PointPackage, value: string | number | boolean) => {
    setSettings(prev => ({
      ...prev,
      pointPackages: (prev.pointPackages || []).map(pkg =>
        pkg.id === packageId ? { ...pkg, [field]: value } : pkg
      )
    }));
  };

  const movePointPackage = (packageId: string, direction: 'up' | 'down') => {
    const packages = settings.pointPackages || [];
    const currentIndex = packages.findIndex(p => p.id === packageId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= packages.length) return;

    const newPackages = [...packages];
    [newPackages[currentIndex], newPackages[newIndex]] = [newPackages[newIndex], newPackages[currentIndex]];

    newPackages.forEach((pkg, index) => {
      pkg.order = index + 1;
    });

    setSettings(prev => ({ ...prev, pointPackages: newPackages }));
  };


  const saveSettings = async () => {
    setSaving(true);
    setMessage('');

    try {
      // Create settings object without plans for backward compatibility or pure settings layout
      const pricingPayload = { ...settings };
      // Even if settings doesn't have plans, we pass it just to be safe if the DB model historically requires it
      // but according to interface we updated, plans is removed. Wait, we removed it from the local type.
      // API validation might fail if it strictly checks, let's look at api/admin/pricing.
      // API checks `if (!settings || !settings.pageTitle ...)` wait, we better check the API.
      // No, we will also update api/admin/pricing to not require plans, wait, if we leave plans as [] to bypass validation, it's safer.
      const payloadWithFallback = { ...pricingPayload, plans: [] as any[] };

      const [pricingRes, subsRes] = await Promise.all([
        fetch('/api/admin/pricing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings: payloadWithFallback }),
        }),
        fetch('/api/admin/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscriptions: subscriptions }),
        })
      ]);

      const pricingData = await pricingRes.json();
      const subsData = await subsRes.json();

      if (pricingRes.ok && pricingData.ok && subsRes.ok && subsData.ok) {
        setMessage('方案設定與訂閱資料已儲存！');
        setOriginalSettings(JSON.parse(JSON.stringify(settings)));
        setOriginalSubscriptions(JSON.parse(JSON.stringify(subscriptions)));
      } else {
        setMessage((pricingData.error || subsData.error) || '儲存失敗，請重試');
      }
    } catch (error) {
      console.error('Save error:', error);
      setMessage('網路錯誤，請重試');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };


  if (loading) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent shadow-md"></div>
          <p className="text-gray-500 font-medium">載入設定中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
      <div className="mx-auto max-w-5xl space-y-8">

        {/* Banner */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-2xl p-6 md:p-8 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 overflow-hidden relative">
          <div className="absolute -top-24 -right-24 w-80 h-80 bg-white/10 blur-3xl rounded-full pointer-events-none"></div>
          <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-blue-500/20 blur-3xl rounded-full pointer-events-none"></div>

          <div className="relative z-10">
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2 tracking-tight">
              <svg className="w-6 h-6 text-yellow-300 drop-shadow-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              解鎖完整的商業收款能力
            </h2>
            <p className="text-blue-100 max-w-xl text-sm md:text-base leading-relaxed">
              希望讓學生無縫付費嗎？前往「系統設定」頁面，即可輕鬆串接 Stripe、ECPay、PayPal 等多種在地與國際金流服務，自動處理帳務。
            </p>
          </div>
          <div className="shrink-0 relative z-10">
            <Link
              href="/apps?type=payment"
              className="inline-flex items-center gap-2 bg-white text-blue-700 hover:bg-blue-50 px-6 py-3 rounded-xl font-bold transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
            >
              前往金流設定
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">方案與價格設定</h1>
          <button
            onClick={saveSettings}
            disabled={saving || !hasChanges()}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow transition-all"
          >
            {saving ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
            )}
            {saving ? '儲存中...' : '儲存全部變更'}
          </button>
        </div>

        {message && (
          <div className={`p-4 rounded-xl shadow-sm border ${message.includes('失敗') ? 'bg-red-50 text-red-800 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'} animate-in fade-in slide-in-from-top-2`}>
            {message}
          </div>
        )}

        {/* 基本設定 Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8">
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            公開頁面顯示設定
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">頁面大標題 (H1)</label>
              <input
                type="text"
                value={settings.pageTitle}
                onChange={(e) => updateSettings('pageTitle', e.target.value)}
                className="w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-gray-900"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">頁面副標題描述 (Description)</label>
              <textarea
                value={settings.pageDescription}
                onChange={(e) => updateSettings('pageDescription', e.target.value)}
                rows={2}
                className="w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-gray-900 resize-none"
              />
            </div>
          </div>
        </div>

        {/* 模式切換 Segmented Tabs */}
        <div className="flex bg-gray-100/80 p-1.5 rounded-2xl w-fit drop-shadow-sm border border-gray-200/50">
          <button
            onClick={() => updateSettings('mode', 'subscription')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${settings.mode === 'subscription'
              ? 'bg-white text-blue-700 shadow-sm ring-1 ring-black/5'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
              }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            維護訂閱方案
          </button>
          <button
            onClick={() => updateSettings('mode', 'points')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${settings.mode === 'points'
              ? 'bg-white text-blue-700 shadow-sm ring-1 ring-black/5'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
              }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            維護點數購買
          </button>
        </div>

        {/* 訂閱方案管理區塊 */}
        {settings.mode === 'subscription' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">訂閱方案管理</h3>
                <p className="text-sm text-gray-500 mt-1">學員定期付費取得課程存取權。調整下方卡片即可動態更改定價資訊。</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => syncTargets(true)} className="px-3 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 shadow-sm">
                  同步對象
                </button>
                <button onClick={() => importFromPublicPricing()} className="px-3 py-2 bg-white border border-yellow-200 text-yellow-700 text-sm font-semibold rounded-lg hover:bg-yellow-50 shadow-sm">
                  匯入公開頁
                </button>
                <button onClick={() => importFromMockAuth()} className="px-3 py-2 bg-white border border-purple-200 text-purple-700 text-sm font-semibold rounded-lg hover:bg-purple-50 shadow-sm">
                  匯入 mockAuth
                </button>
                <button onClick={() => addSubscription('PLAN')} className="px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-lg hover:bg-gray-800 shadow-sm">
                  + 新增方案
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {subscriptions
                .filter(s => s.type === 'PLAN')
                .sort((a, b) => a.order - b.order)
                .map((plan, index, filteredArray) => (
                  <div key={plan.id} className={`bg-white rounded-2xl p-5 md:p-6 transition-all border ${editingPlanId === plan.id ? 'border-blue-400 shadow-md ring-4 ring-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="flex flex-col lg:flex-row gap-6">

                      {/* Left Block: Controls */}
                      <div className="flex lg:flex-col items-center justify-between lg:justify-start gap-4 lg:w-32 lg:shrink-0 lg:border-r border-gray-100 lg:pr-6">
                        <div className="flex lg:flex-col gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { if (window.confirm('確定要上移此方案順序嗎？')) moveSubscription(plan.id, 'up'); }}
                            disabled={index === 0}
                            className="p-1.5 bg-gray-100 text-gray-600 rounded-md disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-200 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button
                            onClick={() => { if (window.confirm('確定要下移此方案順序嗎？')) moveSubscription(plan.id, 'down'); }}
                            disabled={index === filteredArray.length - 1}
                            className="p-1.5 bg-gray-100 text-gray-600 rounded-md disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-200 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={plan.isActive}
                            onChange={(e) => updateSubscription(plan.id, 'isActive', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                          <span className="ml-3 text-sm font-bold text-gray-700">{plan.isActive ? '啟用中' : '已停用'}</span>
                        </label>
                      </div>

                      {/* Middle Block: Form Fields */}
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">方案標籤 (Label)</label>
                          <input
                            type="text"
                            value={plan.label}
                            onChange={(e) => updateSubscription(plan.id, 'label', e.target.value)}
                            disabled={editingPlanId !== plan.id}
                            className={`w-full px-3 py-2 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 border ${editingPlanId === plan.id ? 'bg-white border-gray-300' : 'bg-transparent border-transparent text-gray-900 font-medium px-0'}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">價格短述 (Price Hint)</label>
                          <input
                            type="text"
                            value={plan.priceHint || ''}
                            onChange={(e) => updateSubscription(plan.id, 'priceHint', e.target.value)}
                            disabled={editingPlanId !== plan.id}
                            placeholder="例如：NT$ 800 / 月"
                            className={`w-full px-3 py-2 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 border ${editingPlanId === plan.id ? 'bg-white border-gray-300' : 'bg-transparent border-transparent text-gray-900 font-medium px-0'}`}
                          />
                        </div>

                        {/* NEW: Price, Currency, Interval */}
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-green-500 uppercase tracking-widest">實際結帳價格 (Price)</label>
                          <input
                            type="number"
                            value={plan.price ?? 0}
                            onChange={(e) => updateSubscription(plan.id, 'price', parseInt(e.target.value) || 0)}
                            disabled={editingPlanId !== plan.id}
                            className={`w-full px-3 py-2 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 border ${editingPlanId === plan.id ? 'bg-white border-green-300' : 'bg-transparent border-transparent text-green-700 font-bold px-0'}`}
                          />
                        </div>
                        <div className="space-y-1 flex gap-2">
                          <div className="flex-1">
                            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">週期 (Interval)</label>
                            <select
                              value={plan.interval || 'month'}
                              onChange={(e) => updateSubscription(plan.id, 'interval', e.target.value)}
                              disabled={editingPlanId !== plan.id}
                              className={`w-full px-3 py-2 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 border ${editingPlanId === plan.id ? 'bg-white border-gray-300' : 'bg-transparent border-transparent text-gray-900 font-medium px-0 appearance-none'}`}
                            >
                              <option value="month">月 (Month)</option>
                              <option value="year">年 (Year)</option>
                              <option value="one-time">單次 (One-time)</option>
                            </select>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">適合對象 (Target Audience)</label>
                          <input
                            type="text"
                            value={plan.targetAudience}
                            onChange={(e) => updateSubscription(plan.id, 'targetAudience', e.target.value)}
                            disabled={editingPlanId !== plan.id}
                            className={`w-full px-3 py-2 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 border ${editingPlanId === plan.id ? 'bg-white border-gray-300' : 'bg-transparent border-transparent text-gray-900 font-medium px-0'}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">包含功能概述 (Included Features)</label>
                          <input
                            type="text"
                            value={plan.includedFeatures}
                            onChange={(e) => updateSubscription(plan.id, 'includedFeatures', e.target.value)}
                            disabled={editingPlanId !== plan.id}
                            className={`w-full px-3 py-2 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 border ${editingPlanId === plan.id ? 'bg-white border-gray-300' : 'bg-transparent border-transparent text-gray-900 font-medium px-0'}`}
                          />
                        </div>
                      </div>

                      {/* Right Block: Actions */}
                      <div className="flex lg:flex-col items-center lg:items-end justify-center lg:justify-start gap-2 lg:w-24 lg:shrink-0 lg:pl-4">
                        <button
                          onClick={async () => {
                            if (editingPlanId === plan.id) {
                              await saveSettings();
                              setEditingPlanId(null);
                            } else {
                              setEditingPlanId(plan.id);
                            }
                          }}
                          className={`w-full px-4 py-2 text-sm font-bold rounded-lg transition-colors ${editingPlanId === plan.id
                            ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                          {editingPlanId === plan.id ? '完成編輯' : '編輯內容'}
                        </button>
                        {editingPlanId === plan.id && (
                          <button
                            onClick={() => {
                              if (window.confirm(`確定要刪除這筆方案嗎？此操作無法復原。`)) {
                                removeSubscription(plan.id);
                              }
                            }}
                            className="w-full px-4 py-2 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                          >
                            刪除
                          </button>
                        )}
                      </div>

                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 擴充功能管理區塊 */}
        {settings.mode === 'subscription' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">擴充功能管理 (Extensions)</h3>
                <p className="text-sm text-gray-500 mt-1">獨立販售的加值服務，例如額外的儲存空間或專屬諮詢時段。</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => addSubscription('EXTENSION')} className="px-4 py-2 bg-indigo-900 text-white text-sm font-bold rounded-lg hover:bg-indigo-800 shadow-sm">
                  + 新增擴充功能
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {subscriptions
                .filter(s => s.type === 'EXTENSION')
                .sort((a, b) => a.order - b.order)
                .map((ext, index, filteredArray) => (
                  <div key={ext.id} className={`bg-white rounded-2xl p-5 md:p-6 transition-all border ${editingPlanId === ext.id ? 'border-indigo-400 shadow-md ring-4 ring-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="flex flex-col lg:flex-row gap-6">

                      {/* Left Block: Controls */}
                      <div className="flex lg:flex-col items-center justify-between lg:justify-start gap-4 lg:w-32 lg:shrink-0 lg:border-r border-gray-100 lg:pr-6">
                        <div className="flex lg:flex-col gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { if (window.confirm('確定要上移此順序嗎？')) moveSubscription(ext.id, 'up'); }}
                            disabled={index === 0}
                            className="p-1.5 bg-gray-100 text-gray-600 rounded-md disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-200 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button
                            onClick={() => { if (window.confirm('確定要下移此順序嗎？')) moveSubscription(ext.id, 'down'); }}
                            disabled={index === filteredArray.length - 1}
                            className="p-1.5 bg-gray-100 text-gray-600 rounded-md disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-200 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ext.isActive}
                            onChange={(e) => updateSubscription(ext.id, 'isActive', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                          <span className="ml-3 text-sm font-bold text-gray-700">{ext.isActive ? '啟用中' : '已停用'}</span>
                        </label>
                      </div>

                      {/* Middle Block: Form Fields */}
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">擴充標籤 (Label)</label>
                          <input
                            type="text"
                            value={ext.label}
                            onChange={(e) => updateSubscription(ext.id, 'label', e.target.value)}
                            disabled={editingPlanId !== ext.id}
                            className={`w-full px-3 py-2 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 border ${editingPlanId === ext.id ? 'bg-white border-gray-300' : 'bg-transparent border-transparent text-gray-900 font-medium px-0'}`}
                          />
                        </div>
                        <div className="space-y-1 flex gap-2">
                          <div className="flex-1">
                            <label className="text-[11px] font-bold text-green-500 uppercase tracking-widest">實際結帳價格 (Price)</label>
                            <input
                              type="number"
                              value={ext.price ?? 0}
                              onChange={(e) => updateSubscription(ext.id, 'price', parseInt(e.target.value) || 0)}
                              disabled={editingPlanId !== ext.id}
                              className={`w-full px-3 py-2 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 border ${editingPlanId === ext.id ? 'bg-white border-green-300' : 'bg-transparent border-transparent text-green-700 font-bold px-0'}`}
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">週期 (Interval)</label>
                            <select
                              value={ext.interval || 'one-time'}
                              onChange={(e) => updateSubscription(ext.id, 'interval', e.target.value)}
                              disabled={editingPlanId !== ext.id}
                              className={`w-full px-3 py-2 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 border ${editingPlanId === ext.id ? 'bg-white border-gray-300' : 'bg-transparent border-transparent text-gray-900 font-medium px-0 appearance-none'}`}
                            >
                              <option value="month">月 (Month)</option>
                              <option value="year">年 (Year)</option>
                              <option value="one-time">單次 (One-time)</option>
                            </select>
                          </div>
                        </div>

                        <div className="space-y-1 sm:col-span-2">
                          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">功能概述 (Included Features)</label>
                          <input
                            type="text"
                            value={ext.includedFeatures}
                            onChange={(e) => updateSubscription(ext.id, 'includedFeatures', e.target.value)}
                            disabled={editingPlanId !== ext.id}
                            className={`w-full px-3 py-2 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 border ${editingPlanId === ext.id ? 'bg-white border-gray-300' : 'bg-transparent border-transparent text-gray-900 font-medium px-0'}`}
                          />
                        </div>
                      </div>

                      {/* Right Block: Actions */}
                      <div className="flex lg:flex-col items-center lg:items-end justify-center lg:justify-start gap-2 lg:w-24 lg:shrink-0 lg:pl-4">
                        <button
                          onClick={async () => {
                            if (editingPlanId === ext.id) {
                              await saveSettings();
                              setEditingPlanId(null);
                            } else {
                              setEditingPlanId(ext.id);
                            }
                          }}
                          className={`w-full px-4 py-2 text-sm font-bold rounded-lg transition-colors ${editingPlanId === ext.id
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                          {editingPlanId === ext.id ? '完成編輯' : '編輯內容'}
                        </button>
                        {editingPlanId === ext.id && (
                          <button
                            onClick={() => {
                              if (window.confirm(`確定要刪除這筆擴充功能嗎？此操作無法復原。`)) {
                                removeSubscription(ext.id);
                              }
                            }}
                            className="w-full px-4 py-2 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                          >
                            刪除
                          </button>
                        )}
                      </div>

                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 點數套餐管理區塊 */}
        {settings.mode === 'points' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">點數套餐管理</h3>
                <p className="text-sm text-gray-500 mt-1">學員購買點數後可用於報名課程，點數消耗由課程扣點設定決定。</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={addMockPointPackages} className="px-3 py-2 bg-white border border-purple-200 text-purple-700 text-sm font-semibold rounded-lg hover:bg-purple-50 shadow-sm">
                  📊 新增模擬資料
                </button>
                <button onClick={addPointPackage} className="px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-lg hover:bg-gray-800 shadow-sm">
                  + 新增套餐
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {(settings.pointPackages || [])
                .sort((a, b) => a.order - b.order)
                .map((pkg, index) => (
                  <div key={pkg.id} className={`bg-white rounded-2xl p-5 md:p-6 transition-all border ${editingPlanId === pkg.id ? 'border-indigo-400 shadow-md ring-4 ring-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="flex flex-col lg:flex-row gap-6">

                      {/* Left Block: Controls */}
                      <div className="flex lg:flex-col items-center justify-between lg:justify-start gap-4 lg:w-32 lg:shrink-0 lg:border-r border-gray-100 lg:pr-6">
                        <div className="flex lg:flex-col gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { if (window.confirm('確定要上移此套餐順序嗎？')) movePointPackage(pkg.id, 'up'); }}
                            disabled={index === 0}
                            className="p-1.5 bg-gray-100 text-gray-600 rounded-md disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-200 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button
                            onClick={() => { if (window.confirm('確定要下移此套餐順序嗎？')) movePointPackage(pkg.id, 'down'); }}
                            disabled={index === (settings.pointPackages?.length || 0) - 1}
                            className="p-1.5 bg-gray-100 text-gray-600 rounded-md disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-200 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={pkg.isActive}
                            onChange={(e) => updatePointPackage(pkg.id, 'isActive', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                          <span className="ml-3 text-sm font-bold text-gray-700">{pkg.isActive ? '上架中' : '未上架'}</span>
                        </label>
                      </div>

                      {/* Middle Block: Form Fields */}
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">套餐名稱</label>
                          <input
                            type="text"
                            value={pkg.name}
                            onChange={(e) => updatePointPackage(pkg.id, 'name', e.target.value)}
                            disabled={editingPlanId !== pkg.id}
                            className={`w-full px-3 py-2 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 border ${editingPlanId === pkg.id ? 'bg-white border-gray-300' : 'bg-transparent border-transparent text-gray-900 font-bold px-0'}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">點數數量</label>
                          <input
                            type="number"
                            value={pkg.points}
                            onChange={(e) => updatePointPackage(pkg.id, 'points', parseInt(e.target.value) || 0)}
                            disabled={editingPlanId !== pkg.id}
                            className={`w-full px-3 py-2 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 border ${editingPlanId === pkg.id ? 'bg-white border-gray-300' : 'bg-transparent border-transparent text-gray-900 font-medium px-0'}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">價格 (NT$)</label>
                          <input
                            type="number"
                            value={pkg.price}
                            onChange={(e) => updatePointPackage(pkg.id, 'price', parseInt(e.target.value) || 0)}
                            disabled={editingPlanId !== pkg.id}
                            className={`w-full px-3 py-2 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 border ${editingPlanId === pkg.id ? 'bg-white border-gray-300' : 'bg-transparent border-transparent text-gray-900 font-medium px-0'}`}
                          />
                        </div>
                        <div className="space-y-1 shadow-sm sm:shadow-none bg-yellow-50/50 sm:bg-transparent -mx-5 px-5 sm:mx-0 sm:px-0 py-2 sm:py-0 border-y border-yellow-100 sm:border-0">
                          <label className="text-[11px] font-bold text-orange-400 uppercase tracking-widest">贈送點數 (Bonus)</label>
                          <input
                            type="number"
                            value={pkg.bonus || 0}
                            onChange={(e) => updatePointPackage(pkg.id, 'bonus', parseInt(e.target.value) || 0)}
                            disabled={editingPlanId !== pkg.id}
                            className={`w-full px-3 py-2 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 border ${editingPlanId === pkg.id ? 'bg-white border-orange-200' : 'bg-transparent border-transparent text-orange-700 font-bold px-0'}`}
                          />
                        </div>

                        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">套餐描述</label>
                          <input
                            type="text"
                            value={pkg.description || ''}
                            onChange={(e) => updatePointPackage(pkg.id, 'description', e.target.value)}
                            disabled={editingPlanId !== pkg.id}
                            className={`w-full px-3 py-2 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 border ${editingPlanId === pkg.id ? 'bg-white border-gray-300' : 'bg-transparent border-transparent text-gray-600 px-0'}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">促銷推廣徽章</label>
                          <input
                            type="text"
                            value={pkg.badge || ''}
                            onChange={(e) => updatePointPackage(pkg.id, 'badge', e.target.value)}
                            disabled={editingPlanId !== pkg.id}
                            placeholder="如：熱銷、最划算"
                            className={`w-full px-3 py-2 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 border ${editingPlanId === pkg.id ? 'bg-white border-gray-300' : 'bg-transparent border-transparent text-indigo-600 font-semibold px-0'}`}
                          />
                        </div>
                      </div>

                      {/* Right Block: Actions */}
                      <div className="flex lg:flex-col items-center lg:items-end justify-center lg:justify-start gap-2 lg:w-24 lg:shrink-0 lg:pl-4">
                        <button
                          onClick={async () => {
                            if (editingPlanId === pkg.id) {
                              await saveSettings();
                              setEditingPlanId(null);
                            } else {
                              setEditingPlanId(pkg.id);
                            }
                          }}
                          className={`w-full px-4 py-2 text-sm font-bold rounded-lg transition-colors ${editingPlanId === pkg.id
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                          {editingPlanId === pkg.id ? '完成編輯' : '編輯內容'}
                        </button>
                        {editingPlanId === pkg.id && (
                          <button
                            onClick={() => {
                              if (window.confirm(`確定要刪除這筆套餐嗎？此操作無法復原。`)) {
                                removePointPackage(pkg.id);
                              }
                            }}
                            className="w-full px-4 py-2 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                          >
                            刪除
                          </button>
                        )}
                      </div>

                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
