"use client";

import { useEffect, useState } from 'react';
import { PLAN_TARGETS } from '@/lib/mockAuth';

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

type PricingSettings = {
  pageTitle: string;
  pageDescription: string;
  plans: PlanConfig[];
};

export default function PricingSettingsPage() {
  const [settings, setSettings] = useState<PricingSettings>({
    pageTitle: '方案與價格設定',
    pageDescription: '管理會員方案的標籤、價格和功能特色',
    plans: []
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

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
          // If the stored settings look like defaults, try importing from public page
          if (!loadedSettings.plans || loadedSettings.plans.length === 0 || loadedSettings.pageDescription === '管理會員方案的標籤、價格和功能特色') {
            importFromPublicPricing(loadedSettings);
          }
        } else {
          // Fallback to default data
          const loadedSettings: PricingSettings = {
            pageTitle: '方案與價格設定',
            pageDescription: '管理會員方案的標籤、價格和功能特色',
            plans: [
              {
                id: 'viewer',
                label: '新辦帳戶',
                priceHint: 'NT$0 / 僅查詢',
                badge: '預設',
                targetAudience: '新手學員、試用者',
                includedFeatures: '課程瀏覽、師資查詢',
                features: [
                  '僅能瀏覽與查詢老師和課程清單',
                  '無法預約或參與付費課程',
                  '無白板與錄影回放功能',
                ],
                isActive: true,
                order: 1
              },
              {
                id: 'basic',
                label: 'Basic 普通會員',
                priceHint: '最低入門價（可到時再定價）',
                targetAudience: '初學者、預算有限的學生',
                includedFeatures: '基礎課程瀏覽、社群互動',
                features: [
                  '有限的課程瀏覽與試聽',
                  '社群功能（留言、評價）',
                  '基礎教學支援',
                ],
                isActive: true,
                order: 2
              },
              {
                id: 'pro',
                label: 'Pro 中級會員',
                priceHint: '主力方案，建議訂為 Basic 的 2–3 倍',
                badge: '推薦',
                targetAudience: '進階學習者、專業學生',
                includedFeatures: '白板功能、錄影回放、進階搜尋',
                features: [
                  '完整白板功能',
                  '錄影回放（30 天保存）',
                  '進階課程搜尋與篩選',
                ],
                isActive: true,
                order: 3
              },
              {
                id: 'elite',
                label: 'Elite 高級會員',
                priceHint: '高客單價、可採合約制或專案報價',
                targetAudience: 'VIP客戶、高端學習者',
                includedFeatures: '長期錄影、專屬師資、一對一支援',
                features: [
                  '白板與長期錄影（無限保存）',
                  '專屬高端師資推薦',
                  '一對一客服與優先支援',
                ],
                isActive: true,
                order: 4
              }
            ]
          };
          setSettings(loadedSettings);
          // try to import from the public page to prefill
          importFromPublicPricing(loadedSettings);
        }
      } catch (error) {
        console.error('Failed to load pricing data:', error);
        // Fallback to default data
        const loadedSettings: PricingSettings = {
          pageTitle: '方案與價格設定',
          pageDescription: '管理會員方案的標籤、價格和功能特色',
          plans: [
            {
              id: 'viewer',
              label: '新辦帳戶',
              priceHint: 'NT$0 / 僅查詢',
              badge: '預設',
              targetAudience: '新手學員、試用者',
              includedFeatures: '課程瀏覽、師資查詢',
              features: [
                '僅能瀏覽與查詢老師和課程清單',
                '無法預約或參與付費課程',
                '無白板與錄影回放功能',
              ],
              isActive: true,
              order: 1
            },
            {
              id: 'basic',
              label: 'Basic 普通會員',
              priceHint: '最低入門價（可到時再定價）',
              targetAudience: '初學者、預算有限的學生',
              includedFeatures: '基礎課程瀏覽、社群互動',
              features: [
                '有限的課程瀏覽與試聽',
                '社群功能（留言、評價）',
                '基礎教學支援',
              ],
              isActive: true,
              order: 2
            },
            {
              id: 'pro',
              label: 'Pro 中級會員',
              priceHint: '主力方案，建議訂為 Basic 的 2–3 倍',
              badge: '推薦',
              targetAudience: '進階學習者、專業學生',
              includedFeatures: '白板功能、錄影回放、進階搜尋',
              features: [
                '完整白板功能',
                '錄影回放（30 天保存）',
                '進階課程搜尋與篩選',
              ],
              isActive: true,
              order: 3
            },
            {
              id: 'elite',
              label: 'Elite 高級會員',
              priceHint: '高客單價、可採合約制或專案報價',
              targetAudience: 'VIP客戶、高端學習者',
              includedFeatures: '長期錄影、專屬師資、一對一支援',
              features: [
                '白板與長期錄影（無限保存）',
                '專屬高端師資推薦',
                '一對一客服與優先支援',
              ],
              isActive: true,
              order: 4
            }
          ]
        };
        setSettings(loadedSettings);
        // try to import from the public page to prefill
        importFromPublicPricing(loadedSettings);
      } finally {
        setLoading(false);
      }
    };

    loadPricingData();
  }, []);

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
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-md ${message.includes('失敗') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {message}
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">方案管理</h2>
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
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => movePlan(plan.id, 'up')}
                        disabled={index === 0}
                        className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => movePlan(plan.id, 'down')}
                        disabled={index === settings.plans.length - 1}
                        className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
                      >
                        ↓
                      </button>
                    </div>
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
                      <button
                        onClick={() => removePlan(plan.id)}
                        className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? '儲存中...' : '儲存設定'}
        </button>
      </div>
    </div>
  );
}
