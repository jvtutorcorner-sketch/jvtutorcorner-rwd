'use client';

// components/integrations/SchemaForm.tsx
//
// 依 provider.fields 動態渲染設定表單，建立與編輯共用同一份 schema。
// 關鍵：永遠依 schema 渲染（不依現有 config 的 key），所以建立時略過的欄位在編輯時
// 一定會出現、能補填 —— 解決舊 AppConfigModal「只渲染既有 key」的缺陷。
//
// 密鑰欄位（secret）在編輯模式：預設空白 + 「已設定 ••••（留空＝不變更）」提示，
// 另提供「清除」把值設為 { __clear: true }（伺服器端據此刪除）。

import React from 'react';
import type { CatalogProvider } from '@/lib/integrations/clientApi';

type FieldDef = CatalogProvider['fields'][number] & {
    key: string; label: string; type: string;
    required?: boolean; secret?: boolean; placeholder?: string; help?: string;
    default?: unknown; group?: string; options?: { value: string; label: string }[];
    refCategory?: string; rows?: number; min?: number; max?: number; path?: string;
    showIf?: { key: string; equals: unknown };
};

export interface SchemaFormAux {
    models?: Record<string, string[]>;
    aiIntegrations?: { integrationId: string; name: string; type: string }[];
    skills?: { id: string; label: string }[];
}

export interface SchemaFormProps {
    provider: CatalogProvider;
    value: Record<string, any>;
    onChange: (next: Record<string, any>) => void;
    mode: 'create' | 'edit';
    secretsSet?: string[];
    errors?: Record<string, string>;
    aux?: SchemaFormAux;
}

function getPath(obj: any, path: string) {
    return path.split('.').reduce((a, k) => (a == null ? a : a[k]), obj);
}
function setPath(obj: any, path: string, val: any) {
    const keys = path.split('.');
    const next = { ...obj };
    let cur = next;
    for (let i = 0; i < keys.length - 1; i++) {
        cur[keys[i]] = { ...(cur[keys[i]] || {}) };
        cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = val;
    return next;
}

const inputCls =
    'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none';

export default function SchemaForm({ provider, value, onChange, mode, secretsSet = [], errors = {}, aux }: SchemaFormProps) {
    const fields = (provider.fields || []) as FieldDef[];

    const readField = (f: FieldDef) => (f.path ? getPath(value, f.path) : value[f.key]);
    const writeField = (f: FieldDef, v: any) => {
        onChange(f.path ? setPath(value, f.path, v) : { ...value, [f.key]: v });
    };

    // 依 group 分組（無 group 者歸 'default'），維持宣告順序
    const groups: { name: string; fields: FieldDef[] }[] = [];
    for (const f of fields) {
        if (f.showIf) {
            const cond = value[f.showIf.key];
            if (cond !== f.showIf.equals) continue;
        }
        const g = f.group || 'default';
        let bucket = groups.find((x) => x.name === g);
        if (!bucket) { bucket = { name: g, fields: [] }; groups.push(bucket); }
        bucket.fields.push(f);
    }

    const groupLabels: Record<string, string> = {
        default: '', basic: '基本', stages: '階段設定', behavior: '行為', tools: '可用工具',
    };

    const renderField = (f: FieldDef) => {
        const raw = readField(f);
        const err = errors[f.key];
        const isSecretSet = f.secret && secretsSet.includes(f.key);
        const cleared = raw && typeof raw === 'object' && (raw as any).__clear === true;

        // model-picker
        if (f.type === 'model-picker') {
            const models = aux?.models?.[provider.type] || [];
            const selected: string[] = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(',').filter(Boolean) : []);
            return (
                <div>
                    {models.length === 0 ? (
                        <p className="text-xs text-gray-500">此服務尚無可選模型（可先同步模型清單）。</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {models.map((m) => {
                                const on = selected.includes(m);
                                return (
                                    <button
                                        type="button"
                                        key={m}
                                        onClick={() => writeField(f, on ? selected.filter((x) => x !== m) : [...selected, m])}
                                        className={`px-2.5 py-1 rounded-full text-xs border ${on ? 'bg-purple-600 text-white border-purple-600' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'}`}
                                    >
                                        {m}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            );
        }

        // integration-ref
        if (f.type === 'integration-ref') {
            const opts = aux?.aiIntegrations || [];
            return (
                <select className={inputCls} value={typeof raw === 'string' ? raw : ''} onChange={(e) => writeField(f, e.target.value)}>
                    <option value="">— 請選擇 —</option>
                    {opts.map((o) => <option key={o.integrationId} value={o.integrationId}>{o.name}（{o.type}）</option>)}
                </select>
            );
        }

        // skill-ref
        if (f.type === 'skill-ref') {
            const opts = aux?.skills || [];
            return (
                <select className={inputCls} value={typeof raw === 'string' ? raw : ''} onChange={(e) => writeField(f, e.target.value)}>
                    <option value="">— 不套用技能 —</option>
                    {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
            );
        }

        if (f.type === 'select') {
            return (
                <select className={inputCls} value={typeof raw === 'string' ? raw : (f.default as string) || ''} onChange={(e) => writeField(f, e.target.value)}>
                    <option value="">— 請選擇 —</option>
                    {(f.options || []).map((o: { value: string; label: string }) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            );
        }

        if (f.type === 'toggle') {
            return (
                <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!raw} onChange={(e) => writeField(f, e.target.checked)} className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">啟用</span>
                </label>
            );
        }

        if (f.type === 'textarea' || f.type === 'json') {
            return (
                <textarea
                    className={inputCls}
                    rows={f.rows || 4}
                    placeholder={isSecretSet && mode === 'edit' ? '已設定（留空＝不變更）' : f.placeholder}
                    value={typeof raw === 'string' ? raw : (raw == null ? '' : JSON.stringify(raw))}
                    onChange={(e) => writeField(f, e.target.value)}
                />
            );
        }

        // text / password / number
        const type = f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text';
        if (cleared) {
            return (
                <div className="flex items-center gap-2">
                    <span className="text-sm text-red-600">將於儲存時清除</span>
                    <button type="button" className="text-xs text-purple-600 underline" onClick={() => writeField(f, '')}>復原</button>
                </div>
            );
        }
        return (
            <div className="flex items-center gap-2">
                <input
                    type={type}
                    className={inputCls}
                    placeholder={isSecretSet && mode === 'edit' ? '已設定 ••••（留空＝不變更）' : f.placeholder}
                    value={typeof raw === 'string' || typeof raw === 'number' ? raw : ''}
                    min={f.min}
                    max={f.max}
                    onChange={(e) => writeField(f, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                />
                {isSecretSet && mode === 'edit' && (
                    <button type="button" className="text-xs text-red-600 whitespace-nowrap underline" onClick={() => writeField(f, { __clear: true })}>清除</button>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {groups.map((g) => (
                <div key={g.name} className="space-y-4">
                    {groupLabels[g.name] ? (
                        <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700 pb-1">{groupLabels[g.name]}</h4>
                    ) : null}
                    {g.fields.map((f) => (
                        <div key={f.key}>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                            </label>
                            {renderField(f)}
                            {f.help && <p className="text-xs text-gray-400 mt-1">{f.help}</p>}
                            {errors[f.key] && <p className="text-xs text-red-500 mt-1">{errors[f.key]}</p>}
                        </div>
                    ))}
                </div>
            ))}
            {fields.length === 0 && <p className="text-sm text-gray-500">此服務沒有需要設定的欄位。</p>}
        </div>
    );
}
