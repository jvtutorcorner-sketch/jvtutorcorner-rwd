"use client";

import React, { useEffect, useState, useRef } from 'react';

type AppRolePermission = { roleId: string; roleName: string; visible: boolean };
type AppConfig = { id: string; path: string; label: string; permissions: AppRolePermission[] };
type Role = { id: string; name: string; isActive: boolean };
type Settings = { appConfigs: AppConfig[] };

export default function AppAccessSettings() {
    const [internalSettings, setInternalSettings] = useState<Settings | null>(null);
    const [internalRoles, setInternalRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [initialSettings, setInitialSettings] = useState<string>('');
    const [hasChanges, setHasChanges] = useState(false);
    const isInitializedRef = useRef(false);

    // Monitor for changes
    useEffect(() => {
        if (initialSettings && internalSettings) {
            const currentState = JSON.stringify(internalSettings);
            setHasChanges(currentState !== initialSettings);
        }
    }, [internalSettings, initialSettings]);

    useEffect(() => {
        async function load() {
            try {
                // Load settings from new API
                const resSettings = await fetch('/api/apps/permissions');
                const dataSettings = await resSettings.json();

                if (resSettings.ok) {
                    const settings = dataSettings.settings || dataSettings;
                    setInternalSettings(settings);
                    if (!isInitializedRef.current) {
                        setInitialSettings(JSON.stringify(settings));
                        setHasChanges(false);
                        isInitializedRef.current = true;
                    }
                }

                // Load roles from existing admin API
                const resRoles = await fetch('/api/admin/roles');
                const dataRoles = await resRoles.json();
                if (resRoles.ok) {
                    setInternalRoles(dataRoles.roles || dataRoles);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    async function save() {
        if (!internalSettings) return;
        setSaving(true);
        try {
            const res = await fetch('/api/apps/permissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(internalSettings)
            });
            const data = await res.json();

            if (res.ok) {
                const savedSettings = data.settings || internalSettings;
                setInternalSettings(savedSettings);
                setInitialSettings(JSON.stringify(savedSettings));
                setHasChanges(false);
                if (typeof window !== 'undefined') alert('儲存成功');
            } else {
                alert('儲存失敗: ' + data.error);
            }
        } catch (err: any) {
            console.error('發生錯誤:', err);
            alert('發生錯誤');
        } finally {
            setSaving(false);
        }
    }

    if (loading || !internalSettings) return <div style={{ padding: 16 }}>Loading App Access settings…</div>;

    const apps = internalSettings.appConfigs || [];
    
    // Separate categories and services
    const categories = apps.filter(app => app.id.startsWith('APP_CATEGORY_'));
    const services = apps.filter(app => !app.id.startsWith('APP_CATEGORY_'));

    if (apps.length === 0) {
        return (
            <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 text-gray-600">
                無法找到任何應用程式設定
            </div>
        );
    }

    // Helper component for rendering permission table
    const PermissionTable = ({ items, title }: { items: AppConfig[], title: string }) => (
        <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-2">{title}</h4>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse border border-gray-200">
                    <thead className="bg-gray-50 text-gray-700">
                        <tr>
                            <th className="px-4 py-3 border-b border-gray-200 font-medium">項目</th>
                            {internalRoles.filter(r => r.isActive).map(r => (
                                <th key={r.id} className="px-4 py-3 border-b border-gray-200 font-medium text-center min-w-[80px]">
                                    {r.name}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(app => (
                            <tr key={app.id} className="hover:bg-gray-50 border-b border-gray-100 last:border-b-0">
                                <td className="px-4 py-3">
                                    <div className="font-semibold text-gray-900">{app.label || app.id}</div>
                                    <div className="text-xs text-gray-500 font-mono mt-0.5">{app.id}</div>
                                </td>
                                {internalRoles.filter(r => r.isActive).map(role => {
                                    const perm = app.permissions.find(pp => pp.roleId === role.id);
                                    return (
                                        <td key={role.id} className="px-4 py-3 text-center">
                                            <input
                                                type="checkbox"
                                                checked={perm?.visible !== false}
                                                onChange={(e) => {
                                                    setInternalSettings(prev => {
                                                        if (!prev) return prev;
                                                        const updated = prev.appConfigs.map(ac => {
                                                            if (ac.id !== app.id) return ac;

                                                            let newItemPermissions = [...ac.permissions];
                                                            const existingPermIndex = newItemPermissions.findIndex(pp => pp.roleId === role.id);

                                                            if (existingPermIndex >= 0) {
                                                                newItemPermissions[existingPermIndex] = {
                                                                    ...newItemPermissions[existingPermIndex],
                                                                    visible: e.target.checked
                                                                };
                                                            } else {
                                                                newItemPermissions.push({
                                                                    roleId: role.id,
                                                                    roleName: role.name,
                                                                    visible: e.target.checked
                                                                });
                                                            }
                                                            return { ...ac, permissions: newItemPermissions };
                                                        });
                                                        return { ...prev, appConfigs: updated };
                                                    });
                                                }}
                                                className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                                            />
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="flex justify-between items-center mb-6">
                <h3 className="m-0 text-lg font-semibold text-gray-800">應用程式存取權限管理</h3>
                <button
                    onClick={save}
                    disabled={saving || !hasChanges}
                    className={`px-4 py-2 text-sm font-medium text-white rounded-md border-none transition-colors ${!hasChanges ? 'bg-gray-400 cursor-not-allowed opacity-60' : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'}`}
                >
                    {saving ? '儲存中...' : '儲存變更'}
                </button>
            </div>

            {categories.length > 0 && (
                <PermissionTable items={categories} title="📋 分類卡權限設定" />
            )}

            {services.length > 0 && (
                <PermissionTable items={services} title="🔌 應用程式服務權限設定" />
            )}

            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="m-0 text-xs text-blue-800">
                    <strong>💡 說明：</strong>
                    <br/>
                    • <strong>分類卡權限</strong> 控制主選單中是否顯示該分類（例如「通訊渠道」、「金流服務」等）
                    <br/>
                    • <strong>應用程式服務權限</strong> 控制該角色是否可以存取及設定該應用程式
                    <br/>
                    • 勾選表示該角色可見；未勾選表示隱藏
                </p>
            </div>
        </div>
    );
}
