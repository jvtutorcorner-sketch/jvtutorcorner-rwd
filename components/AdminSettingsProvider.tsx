"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';

type AdminSettingsContextType = {
    settings: any;
    loading: boolean;
    refreshSettings: () => Promise<void>;
};

const AdminSettingsContext = createContext<AdminSettingsContextType>({
    settings: null,
    loading: true,
    refreshSettings: async () => { },
});

export const useAdminSettings = () => useContext(AdminSettingsContext);

export function AdminSettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/admin/settings', { cache: 'no-store' });
            const data = await res.json();
            if (res.ok && data?.settings) {
                setSettings(data.settings);
            }
        } catch (err) {
            console.error('Failed to load admin settings:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();

        // Listen for updates from other components (like admin panel save)
        const handleSettingsChanged = () => {
            fetchSettings();
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('tutor:admin-settings-changed', handleSettingsChanged);
        }

        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('tutor:admin-settings-changed', handleSettingsChanged);
            }
        };
    }, []);

    return (
        <AdminSettingsContext.Provider value={{ settings, loading, refreshSettings: fetchSettings }}>
            {children}
        </AdminSettingsContext.Provider>
    );
}
