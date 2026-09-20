'use client';

// app/apps/_hooks/useConnections.ts
// 載入並操作「已連線」清單（列表、啟用切換、設預設、刪除）。

import { useCallback, useEffect, useState } from 'react';
import {
    listConnections, setConnectionStatus, setConnectionDefault, deleteConnection,
    type ConnectionView,
} from '@/lib/integrations/clientApi';

export function useConnections() {
    const [connections, setConnections] = useState<ConnectionView[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            const data = await listConnections();
            setConnections(data);
            setError(null);
        } catch (e: any) {
            setError(e?.message || '載入連線失敗');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { reload(); }, [reload]);

    const toggleStatus = useCallback(async (id: string, next: 'ACTIVE' | 'INACTIVE') => {
        // optimistic
        setConnections((prev) => prev.map((c) => c.integrationId === id ? { ...c, status: next } : c));
        try {
            const updated = await setConnectionStatus(id, next);
            setConnections((prev) => prev.map((c) => c.integrationId === id ? updated : c));
        } catch (e) {
            await reload(); // rollback via refetch
            throw e;
        }
    }, [reload]);

    const makeDefault = useCallback(async (id: string) => {
        const target = connections.find((c) => c.integrationId === id);
        if (!target) return;
        setConnections((prev) => prev.map((c) =>
            c.type === target.type ? { ...c, isDefault: c.integrationId === id } : c
        ));
        try {
            await setConnectionDefault(id);
        } catch (e) {
            await reload();
            throw e;
        }
    }, [connections, reload]);

    const remove = useCallback(async (id: string) => {
        await deleteConnection(id);
        setConnections((prev) => prev.filter((c) => c.integrationId !== id));
    }, []);

    const countByType = useCallback((type: string) => connections.filter((c) => c.type === type.toUpperCase()).length, [connections]);

    return { connections, loading, error, reload, toggleStatus, makeDefault, remove, countByType };
}
