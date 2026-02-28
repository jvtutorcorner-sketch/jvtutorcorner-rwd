"use client";

import { useEffect, useState } from 'react';
import { PLAN_TARGETS, PLAN_LABELS, PLAN_DESCRIPTIONS, PLAN_FEATURES, PLAN_PRICES } from '@/lib/mockAuth';

type PlanConfig = {
  id: string;
  label: string;
  priceHint?: string;
  badge?: string;
  targetAudience: string; // 適合對象
  includedFeatures: string; // 包含功能
  features: string[];
  isActive: boolean;
  order: number;
};

type PointPackage = {
  id: string;
  name: string; // 套餐名稱（例如：入門包、超值包）
  points: number; // 點數數量
  price: number; // 價格
  bonus?: number; // 贈送點數
  description?: string; // 描述
  badge?: string; // 徽章（推薦、熱門等）
  isActive: boolean;
  order: number;
};

type PricingSettings = {
  pageTitle: string;
  pageDescription: string;
  mode: 'subscription' | 'points'; // 新增：模式選擇
  plans: PlanConfig[]; // 訂閱方案
  pointPackages: PointPackage[]; // 點數套餐
};

export default function PricingSettingsPage() {
  const [settings, setSettings] = useState<PricingSettings>({
    pageTitle: '方案與價格設定',
    pageDescription: '管理會員方案的標籤、價格和功能特色',
    mode: 'subscription',
    plans: [],
    pointPackages: []
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [originalSettings, setOriginalSettings] = useState<PricingSettings | null>(null);

  const syncTargets = async (autoSave = true) => {
    setSettings(prev => {
      const newPlans = prev.plans.map(plan => {
        const target = (PLAN_TARGETS as Record<string, string>)[plan.id];
        return { ...plan, targetAudience: typeof target === 'string' ? target : plan.targetAudience };
      });
      return { ...prev, plans: newPlans };
    });

    if (autoSave) {
      await saveSettings();
    }
  };

  // Load current pricing data
  useEffect(() => {
    const loadPricingData = async () => {
      try {
        const response = await fetch('/api/admin/pricing');
        const data = await response.json();
        if (response.ok && data.ok) {
          const loadedSettings = data.settings as PricingSettings;
          setSettings(loadedSettings);
          // If no plans exist, suggest importing from mockAuth or public page
          if (!loadedSettings.plans || loadedSettings.plans.length === 0) {
            setMessage('💡 尚未設定任何方案，您可以使用「從 mockAuth 新增方案」或「匯入公開頁內容」按鈕來初始化方案資料');
          }
        } else {
          setMessage('無法載入方案資料：' + (data.error || '未知錯誤'));
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

  // Set originalSettings after loading is complete
  useEffect(() => {
    if (!loading && originalSettings === null) {
      setOriginalSettings(JSON.parse(JSON.stringify(settings)));
    }
  }, [loading]);

  // Import content from the public /pricing page into admin fields
  const importFromPublicPricing = async (base?: PricingSettings) => {
    try {
      const html = await (await fetch('/pricing')).text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      // header paragraph -> pageDescription
      const headerP = doc.querySelector('header.page-header p');
      const pageDescription = headerP ? headerP.textContent?.trim() || '' : '';

      // Map plan cards by label (h2) to plan entries
      const cards = Array.from(doc.querySelectorAll('.card.pricing-card'));
      const currentPlans = base ? [...base.plans] : [...settings.plans];

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
        
        // includedFeatures: use subtitle if present, otherwise use the first 2-3 features joined
        const includedSummary = subtitleText || (features.length > 0 ? features.slice(0, 2).join('、') : '');

        // Find matching plan by label
        const planIndex = currentPlans.findIndex(p => p.label === label);
        if (planIndex !== -1) {
          currentPlans[planIndex] = {
            ...currentPlans[planIndex],
            priceHint: priceText || currentPlans[planIndex].priceHint,
            badge: badgeText || currentPlans[planIndex].badge,
            targetAudience: targetText || currentPlans[planIndex].targetAudience,
            includedFeatures: includedSummary || currentPlans[planIndex].includedFeatures,
            features: features.length > 0 ? features : currentPlans[planIndex].features,
          };
        }
      });

      setSettings(prev => ({ ...prev, pageDescription: pageDescription || prev.pageDescription, plans: currentPlans }));
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
    setSettings(prev => {
      const existingIds = new Set(prev.plans.map(p => p.id));
      const maxOrder = prev.plans.length > 0 ? Math.max(...prev.plans.map(p => p.order)) : 0;
      
      // 定義固定順序，避免 Object.entries() 順序不確定
      const planOrder = ['viewer', 'basic', 'pro', 'elite'];
      
      const plansToAdd: PlanConfig[] = [];
      planOrder.forEach((id, index) => {
        if (!existingIds.has(id)) {
          plansToAdd.push({
            id,
            label: PLAN_LABELS[id as keyof typeof PLAN_LABELS],
            priceHint: PLAN_PRICES[id as keyof typeof PLAN_PRICES],
            badge: id === 'pro' ? '推薦' : undefined,
            targetAudience: PLAN_TARGETS[id as keyof typeof PLAN_TARGETS] || '',
            includedFeatures: PLAN_DESCRIPTIONS[id as keyof typeof PLAN_DESCRIPTIONS] || '',
            features: PLAN_FEATURES[id as keyof typeof PLAN_FEATURES] || [],
            isActive: true,
            order: maxOrder + plansToAdd.length + 1
          });
        }
      });
      
      return {
        ...prev,
        plans: [...prev.plans, ...plansToAdd]
      };
    });
    setMessage('已從 mockAuth 匯入新方案');
    setTimeout(() => setMessage(''), 3000);
    // 在一小段時間後滾動到頁面底部，讓用戶看到新方案
    setTimeout(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  const hasChanges = (): boolean => {
    if (!originalSettings) return false;
    return JSON.stringify(settings) !== JSON.stringify(originalSettings);
  };

  const updatePlan = (planId: string, field: keyof PlanConfig, value: string | string[] | boolean | number) => {
    setSettings(prev => ({
      ...prev,
      plans: prev.plans.map(plan =>
        plan.id === planId ? { ...plan, [field]: value } : plan
      )
    }));
  };

  const addPlan = () => {
    const newPlan: PlanConfig = {
      id: `plan_${Date.now()}`,
      label: '新方案',
      priceHint: '價格說明',
      badge: '',
      targetAudience: '目標用戶',
      includedFeatures: '包含的功能',
      features: ['功能特色 1', '功能特色 2'],
      isActive: true,
      order: Math.max(...settings.plans.map(p => p.order), 0) + 1
    };
    setSettings(prev => ({
      ...prev,
      plans: [...prev.plans, newPlan]
    }));
  };

  const removePlan = (planId: string) => {
    setSettings(prev => ({
      ...prev,
      plans: prev.plans.filter(plan => plan.id !== planId)
    }));
  };

  const movePlan = (planId: string, direction: 'up' | 'down') => {
    const currentIndex = settings.plans.findIndex(p => p.id === planId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= settings.plans.length) return;

    const newPlans = [...settings.plans];
    [newPlans[currentIndex], newPlans[newIndex]] = [newPlans[newIndex], newPlans[currentIndex]];

    // Update order values
    newPlans.forEach((plan, index) => {
      plan.order = index + 1;
    });

    setSettings(prev => ({ ...prev, plans: newPlans }));
  };

  // 點數套餐管理函數
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
    
    // 滾動到頁面底部
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

    // Update order values
    newPackages.forEach((pkg, index) => {
      pkg.order = index + 1;
    });

    setSettings(prev => ({ ...prev, pointPackages: newPackages }));
  };


  const saveSettings = async () => {
    setSaving(true);
    setMessage('');

    try {
      const response = await fetch('/api/admin/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        setMessage('方案設定已儲存！');
        // Update originalSettings after successful save
        setOriginalSettings(JSON.parse(JSON.stringify(settings)));
      } else {
        setMessage(data.error || '儲存失敗，請重試');
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
      <div className="p-6">
        <div className="text-center">載入中...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            頁面標題
          </label>
          <input
            type="text"
            value={settings.pageTitle}
            onChange={(e) => updateSettings('pageTitle', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xl font-bold"
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            頁面描述
          </label>
          <textarea
            value={settings.pageDescription}
            onChange={(e) => updateSettings('pageDescription', e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 模式選擇 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            收費模式
          </label>
          <div className="flex gap-4">
            <button
              onClick={() => updateSettings('mode', 'subscription')}
              className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                settings.mode === 'subscription'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              📅 訂閱方案
            </button>
            <button
              onClick={() => updateSettings('mode', 'points')}
              className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                settings.mode === 'points'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              💎 點數購買
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            {settings.mode === 'subscription' 
              ? '訂閱方案：學員定期付費取得課程存取權' 
              : '點數購買：學員購買點數，每次上課扣除相應點數'}
          </p>
        </div>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-md ${message.includes('失敗') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {message}
        </div>
      )}

      {/* 訂閱方案管理 */}
      {settings.mode === 'subscription' && (
        <>
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">訂閱方案管理</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => syncTargets(true)}
                  className="px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                >
                  同步適合對象
                </button>
                <button
                  onClick={() => importFromPublicPricing()}
                  className="px-3 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600"
                >
                  匯入公開頁內容
                </button>
                <button
                  onClick={() => importFromMockAuth()}
                  className="px-3 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600"
                >
                  從 mockAuth 新增方案
                </button>
                <button
                  onClick={addPlan}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  + 新增方案
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white border-2 border-gray-300 rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
          <table className="min-w-full border-collapse" style={{ borderCollapse: 'collapse' }}>
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ border: '2px solid #d1d5db' }}>
                  排序
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ border: '2px solid #d1d5db' }}>
                  狀態
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ border: '2px solid #d1d5db' }}>
                  方案標籤
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ border: '2px solid #d1d5db' }}>
                  價格提示
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ border: '2px solid #d1d5db' }}>
                  適合對象
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ border: '2px solid #d1d5db' }}>
                  包含功能
                </th>
                
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ border: '2px solid #d1d5db' }}>
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {settings.plans
                .sort((a, b) => a.order - b.order)
                .map((plan, index) => (
                <tr key={plan.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap" style={{ border: '2px solid #d1d5db' }}>
                    {editingPlanId === plan.id ? (
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => {
                            if (window.confirm('確定要上移此方案順序嗎？')) {
                              movePlan(plan.id, 'up');
                            }
                          }}
                          disabled={index === 0}
                          className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm('確定要下移此方案順序嗎？')) {
                              movePlan(plan.id, 'down');
                            }
                          }}
                          disabled={index === settings.plans.length - 1}
                          className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
                        >
                          ↓
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400">–</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap" style={{ border: '2px solid #d1d5db' }}>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={plan.isActive}
                        onChange={(e) => updatePlan(plan.id, 'isActive', e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-600">
                        {plan.isActive ? '啟用' : '停用'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap" style={{ border: '2px solid #d1d5db' }}>
                    <input
                      type="text"
                      value={plan.label}
                      onChange={(e) => updatePlan(plan.id, 'label', e.target.value)}
                      disabled={editingPlanId !== plan.id}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap" style={{ border: '2px solid #d1d5db' }}>
                    <input
                      type="text"
                      value={plan.priceHint || ''}
                      onChange={(e) => updatePlan(plan.id, 'priceHint', e.target.value)}
                      disabled={editingPlanId !== plan.id}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                      placeholder="例如：主力方案／推薦／試用"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap" style={{ border: '2px solid #d1d5db' }}>
                    <input
                      type="text"
                      value={plan.targetAudience}
                      onChange={(e) => updatePlan(plan.id, 'targetAudience', e.target.value)}
                      disabled={editingPlanId !== plan.id}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                      placeholder="例如：初學者、專業學生"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap" style={{ border: '2px solid #d1d5db' }}>
                    <input
                      type="text"
                      value={plan.includedFeatures}
                      onChange={(e) => updatePlan(plan.id, 'includedFeatures', e.target.value)}
                      disabled={editingPlanId !== plan.id}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                      placeholder="例如：白板功能、錄影回放"
                    />
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap" style={{ border: '2px solid #d1d5db' }}>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (editingPlanId === plan.id) {
                            // currently editing: save and exit edit mode
                            await saveSettings();
                            setEditingPlanId(null);
                          } else {
                            // enable editing for this plan
                            setEditingPlanId(plan.id);
                          }
                        }}
                        className={
                          `px-3 py-1 text-sm rounded font-medium ` +
                          (editingPlanId === plan.id
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-orange-500 text-white hover:bg-orange-600')
                        }
                      >
                        {editingPlanId === plan.id ? '儲存' : '編輯'}
                      </button>
                      {editingPlanId === plan.id && (
                        <button
                          onClick={() => {
                            if (window.confirm(`確定要刪除方案「${plan.label}」嗎？此操作無法復原。`)) {
                              removePlan(plan.id);
                            }
                          }}
                          className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                        >
                          刪除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      {/* 點數套餐管理 */}
      {settings.mode === 'points' && (
        <>
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">點數套餐管理</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={addMockPointPackages}
                  className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600"
                >
                  📊 新增模擬資料
                </button>
                <button
                  onClick={addPointPackage}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  + 新增套餐
                </button>
              </div>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              管理點數購買套餐，學員購買點數後可用於報名課程，點數消耗由課程扣點設定決定
            </p>
          </div>

          <div className="bg-white border-2 border-gray-300 rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse" style={{ borderCollapse: 'collapse' }}>
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ border: '2px solid #d1d5db' }}>
                      排序
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ border: '2px solid #d1d5db' }}>
                      狀態
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ border: '2px solid #d1d5db' }}>
                      套餐名稱
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ border: '2px solid #d1d5db' }}>
                      點數
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ border: '2px solid #d1d5db' }}>
                      價格 (NT$)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ border: '2px solid #d1d5db' }}>
                      贈送點數
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ border: '2px solid #d1d5db' }}>
                      徽章
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ border: '2px solid #d1d5db' }}>
                      描述
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ border: '2px solid #d1d5db' }}>
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {(settings.pointPackages || [])
                    .sort((a, b) => a.order - b.order)
                    .map((pkg, index) => (
                    <tr key={pkg.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap" style={{ border: '2px solid #d1d5db' }}>
                        {editingPlanId === pkg.id ? (
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => {
                                if (window.confirm('確定要上移此套餐順序嗎？')) {
                                  movePointPackage(pkg.id, 'up');
                                }
                              }}
                              disabled={index === 0}
                              className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm('確定要下移此套餐順序嗎？')) {
                                  movePointPackage(pkg.id, 'down');
                                }
                              }}
                              disabled={index === (settings.pointPackages || []).length - 1}
                              className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
                            >
                              ↓
                            </button>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400">–</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap" style={{ border: '2px solid #d1d5db' }}>
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={pkg.isActive}
                            onChange={(e) => updatePointPackage(pkg.id, 'isActive', e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="ml-2 text-sm text-gray-600">
                            {pkg.isActive ? '啟用' : '停用'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap" style={{ border: '2px solid #d1d5db' }}>
                        <input
                          type="text"
                          value={pkg.name}
                          onChange={(e) => updatePointPackage(pkg.id, 'name', e.target.value)}
                          disabled={editingPlanId !== pkg.id}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                          placeholder="例如：入門包、超值包"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap" style={{ border: '2px solid #d1d5db' }}>
                        <input
                          type="number"
                          value={pkg.points}
                          onChange={(e) => updatePointPackage(pkg.id, 'points', parseInt(e.target.value) || 0)}
                          disabled={editingPlanId !== pkg.id}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                          placeholder="100"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap" style={{ border: '2px solid #d1d5db' }}>
                        <input
                          type="number"
                          value={pkg.price}
                          onChange={(e) => updatePointPackage(pkg.id, 'price', parseInt(e.target.value) || 0)}
                          disabled={editingPlanId !== pkg.id}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                          placeholder="1000"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap" style={{ border: '2px solid #d1d5db' }}>
                        <input
                          type="number"
                          value={pkg.bonus || 0}
                          onChange={(e) => updatePointPackage(pkg.id, 'bonus', parseInt(e.target.value) || 0)}
                          disabled={editingPlanId !== pkg.id}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap" style={{ border: '2px solid #d1d5db' }}>
                        <input
                          type="text"
                          value={pkg.badge || ''}
                          onChange={(e) => updatePointPackage(pkg.id, 'badge', e.target.value)}
                          disabled={editingPlanId !== pkg.id}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                          placeholder="推薦、熱門"
                        />
                      </td>
                      <td className="px-6 py-4" style={{ border: '2px solid #d1d5db' }}>
                        <input
                          type="text"
                          value={pkg.description || ''}
                          onChange={(e) => updatePointPackage(pkg.id, 'description', e.target.value)}
                          disabled={editingPlanId !== pkg.id}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                          placeholder="套餐說明"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap" style={{ border: '2px solid #d1d5db' }}>
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              if (editingPlanId === pkg.id) {
                                await saveSettings();
                                setEditingPlanId(null);
                              } else {
                                setEditingPlanId(pkg.id);
                              }
                            }}
                            className={
                              `px-3 py-1 text-sm rounded font-medium ` +
                              (editingPlanId === pkg.id
                                ? 'bg-green-600 text-white hover:bg-green-700'
                                : 'bg-orange-500 text-white hover:bg-orange-600')
                            }
                          >
                            {editingPlanId === pkg.id ? '儲存' : '編輯'}
                          </button>
                          {editingPlanId === pkg.id && (
                            <button
                              onClick={() => {
                                if (window.confirm(`確定要刪除套餐「${pkg.name}」嗎？此操作無法復原。`)) {
                                  removePointPackage(pkg.id);
                                }
                              }}
                              className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                            >
                              刪除
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="mt-8 flex justify-end">
        <button
          onClick={saveSettings}
          disabled={saving || !hasChanges()}
          className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? '儲存中...' : '儲存設定'}
        </button>
      </div>
    </div>
  );
}
