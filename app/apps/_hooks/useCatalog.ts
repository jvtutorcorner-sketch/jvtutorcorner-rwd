'use client';

// app/apps/_hooks/useCatalog.ts
// 載入服務目錄（registry provider 定義 + 分類）。

import { useEffect, useState } from 'react';
import { fetchCatalog, type CatalogProvider, type CatalogCategory } from '@/lib/integrations/clientApi';

export function useCatalog() {
    const [providers, setProviders] = useState<CatalogProvider[]>([]);
    const [categories, setCategories] = useState<CatalogCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const { providers, categories } = await fetchCatalog();
                if (!alive) return;
                setProviders(providers);
                setCategories(categories);
            } catch (e: any) {
                if (alive) setError(e?.message || '載入目錄失敗');
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    const getProvider = (type: string) => providers.find((p) => p.type === type.toUpperCase());
    return { providers, categories, loading, error, getProvider };
}
