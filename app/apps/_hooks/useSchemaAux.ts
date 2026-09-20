'use client';

// app/apps/_hooks/useSchemaAux.ts
// 供 SchemaForm 使用的輔助資料：AI 模型清單、可參照的 AI 連線、AI 技能清單。

import { useEffect, useState } from 'react';
import { listConnections } from '@/lib/integrations/clientApi';
import type { SchemaFormAux } from '@/components/integrations/SchemaForm';

export function useSchemaAux(): { aux: SchemaFormAux; loading: boolean } {
    const [aux, setAux] = useState<SchemaFormAux>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        (async () => {
            const next: SchemaFormAux = {};
            // AI 模型清單
            try {
                const res = await fetch('/api/admin/ai-models', { credentials: 'same-origin' });
                const data = await res.json();
                if (data.ok && Array.isArray(data.data)) {
                    const map: Record<string, string[]> = {};
                    for (const m of data.data) map[m.provider] = m.models;
                    next.models = map;
                }
            } catch { /* ignore */ }
            // 可參照的 AI 連線（integration-ref）
            try {
                const ai = await listConnections({ category: 'ai' });
                next.aiIntegrations = ai.map((c) => ({ integrationId: c.integrationId, name: c.name, type: c.type }));
            } catch { /* ignore */ }
            // AI 技能（skill-ref）—— Phase 4 端點，缺少時容忍
            try {
                const res = await fetch('/api/ai-skills', { credentials: 'same-origin' });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data.skills)) next.skills = data.skills.map((s: any) => ({ id: s.id, label: s.label || s.id }));
                }
            } catch { /* ignore */ }
            if (alive) { setAux(next); setLoading(false); }
        })();
        return () => { alive = false; };
    }, []);

    return { aux, loading };
}
