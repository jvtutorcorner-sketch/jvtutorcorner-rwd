"use client";

import { useEffect, useState } from 'react';
import { SubscriptionConfig, SubscriptionType } from '@/lib/subscriptionsService';

export default function SubscriptionsSettingsPage() {
    const [subscriptions, setSubscriptions] = useState<SubscriptionConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

    useEffect(() => {
        loadSubscriptions();
    }, []);

    const loadSubscriptions = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/admin/subscriptions');
            const data = await response.json();
            if (response.ok && data.ok) {
                setSubscriptions(data.subscriptions || []);
            } else {
                setMessage('載入方案失敗');
            }
        } catch (error) {
            console.error('Failed to load subscriptions:', error);
            setMessage('網路錯誤，無法載入方案');
        } finally {
            setLoading(false);
        }
    };

    const updateSubscriptionLocal = (id: string, field: keyof SubscriptionConfig, value: any) => {
        setSubscriptions(prev =>
            prev.map(sub => (sub.id === id ? { ...sub, [field]: value } : sub))
        );
    };

    const addSubscription = (type: SubscriptionType) => {
        const newSub: SubscriptionConfig = {
            id: `${type.toLowerCase()}_${Date.now()}`,
            type,
            label: type === 'PLAN' ? '新方案' : '新擴充功能',
            priceHint: '',
            targetAudience: '',
            includedFeatures: '',
            features: ['功能 1'],
            isActive: true,
            order: subscriptions.filter(s => s.type === type).length + 1,
        };
        setSubscriptions(prev => [...prev, newSub]);
        setEditingPlanId(newSub.id);
    };

    const removeSubscriptionLocal = async (id: string) => {
        if (!confirm('確定要刪除此項目嗎？將無法復原。')) return;
        try {
            const response = await fetch(`/api/admin/subscriptions?id=${id}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                setSubscriptions(prev => prev.filter(sub => sub.id !== id));
                setMessage('刪除成功');
            } else {
                setMessage('刪除失敗');
            }
        } catch (e) {
            setMessage('刪除錯誤');
        }
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

        // Update order values for the group
        const updatedGroup = newGroup.map((s, index) => ({ ...s, order: index + 1 }));

        setSubscriptions(prev => {
            const others = prev.filter(s => s.type !== sub.type);
            return [...others, ...updatedGroup];
        });
    };

    const saveSubscription = async (id: string) => {
        const subToSave = subscriptions.find(s => s.id === id);
        if (!subToSave) return;

        setSaving(true);
        setMessage('');

        try {
            const response = await fetch('/api/admin/subscriptions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription: subToSave }),
            });

            const data = await response.json();

            if (response.ok && data.ok) {
                setMessage('儲存成功！');
                setEditingPlanId(null);
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

    const plans = subscriptions.filter(s => s.type === 'PLAN').sort((a, b) => a.order - b.order);
    const extensions = subscriptions.filter(s => s.type === 'EXTENSION').sort((a, b) => a.order - b.order);

    const renderTable = (items: SubscriptionConfig[], type: SubscriptionType) => (
        <div className="bg-white border text-gray-800 border-gray-300 rounded-lg shadow-sm overflow-hidden mb-8">
            <div className="overflow-x-auto">
                <table className="min-w-full border-collapse" style={{ borderCollapse: 'collapse' }}>
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border">
                                排序
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border">
                                狀態
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border">
                                ID (唯一值)
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border">
                                標籤名稱
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border">
                                價格提示
                            </th>
                            {type === 'EXTENSION' && (
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border">
                                    期限(月)
                                </th>
                            )}
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border">
                                包含功能 (簡述)
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border">
                                操作
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white">
                        {items.map((item, index) => {
                            const isEditing = editingPlanId === item.id;
                            return (
                                <tr key={item.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap border text-gray-800">
                                        <div className="flex flex-col gap-1">
                                            <button
                                                onClick={() => moveSubscription(item.id, 'up')}
                                                disabled={index === 0}
                                                className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
                                            >
                                                ↑
                                            </button>
                                            <button
                                                onClick={() => moveSubscription(item.id, 'down')}
                                                disabled={index === items.length - 1}
                                                className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
                                            >
                                                ↓
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap border text-gray-800">
                                        <div className="flex items-center">
                                            <input
                                                type="checkbox"
                                                checked={item.isActive}
                                                onChange={(e) => updateSubscriptionLocal(item.id, 'isActive', e.target.checked)}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap border text-gray-800">
                                        <input
                                            type="text"
                                            value={item.id}
                                            onChange={(e) => updateSubscriptionLocal(item.id, 'id', e.target.value)}
                                            disabled={!isEditing || item.createdAt !== undefined} // Disable ID edit after creation
                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm disabled:opacity-60"
                                        />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap border text-gray-800">
                                        <input
                                            type="text"
                                            value={item.label}
                                            onChange={(e) => updateSubscriptionLocal(item.id, 'label', e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm disabled:opacity-60"
                                        />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap border text-gray-800">
                                        <input
                                            type="text"
                                            value={item.priceHint || ''}
                                            onChange={(e) => updateSubscriptionLocal(item.id, 'priceHint', e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm disabled:opacity-60"
                                        />
                                    </td>
                                    {type === 'EXTENSION' && (
                                        <td className="px-6 py-4 whitespace-nowrap border text-gray-800">
                                            <input
                                                type="number"
                                                value={item.durationMonths || ''}
                                                onChange={(e) => updateSubscriptionLocal(item.id, 'durationMonths', parseInt(e.target.value))}
                                                disabled={!isEditing}
                                                className="w-full px-2 py-1 border border-gray-300 text-gray-800 rounded text-sm disabled:opacity-60"
                                                placeholder="選填"
                                            />
                                        </td>
                                    )}
                                    <td className="px-6 py-4 whitespace-nowrap border text-gray-800">
                                        <input
                                            type="text"
                                            value={item.includedFeatures || ''}
                                            onChange={(e) => updateSubscriptionLocal(item.id, 'includedFeatures', e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full px-2 py-1 border text-gray-800 border-gray-300 rounded text-sm disabled:opacity-60"
                                        />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap border text-gray-800">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    if (isEditing) {
                                                        saveSubscription(item.id);
                                                    } else {
                                                        setEditingPlanId(item.id);
                                                    }
                                                }}
                                                className={`px-3 py-1 text-sm rounded font-medium ${isEditing ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'}`}
                                            >
                                                {isEditing ? (saving ? '儲存中' : '儲存') : '編輯'}
                                            </button>
                                            <button
                                                onClick={() => removeSubscriptionLocal(item.id)}
                                                className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                                            >
                                                刪除
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {items.length === 0 && (
                            <tr>
                                <td colSpan={type === 'EXTENSION' ? 8 : 7} className="px-6 py-4 text-center text-gray-500">
                                    沒有資料
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">訂閱方案與擴充管理</h1>
                    <p className="text-gray-600 text-sm mt-1">管理主會員方案與彈性擴充包 (包含 DynamoDB 儲存)</p>
                </div>
            </div>

            {message && (
                <div className={`mb-4 p-3 rounded-md ${message.includes('失敗') || message.includes('錯誤') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {message}
                </div>
            )}

            {/* 主方案區塊 */}
            <div className="mb-8">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-800">主會員方案 (Plans)</h2>
                    <button
                        onClick={() => addSubscription('PLAN')}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium text-sm"
                    >
                        + 新增主方案
                    </button>
                </div>
                {renderTable(plans, 'PLAN')}
            </div>

            {/* 擴充功能區塊 */}
            <div className="mb-8">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-800">擴充包 (Extensions)</h2>
                    <button
                        onClick={() => addSubscription('EXTENSION')}
                        className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 font-medium text-sm"
                    >
                        + 新增擴充包
                    </button>
                </div>
                {renderTable(extensions, 'EXTENSION')}
            </div>
        </div>
    );
}
