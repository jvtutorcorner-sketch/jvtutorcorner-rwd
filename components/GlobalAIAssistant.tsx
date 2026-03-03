'use client';

import { useEffect, useState } from 'react';
import { getStoredUser, type StoredUser } from '@/lib/mockAuth';
import { AIAssistantWidget } from './AIAssistantWidget';
import type { AppConfig } from '@/lib/appPermissionsService';

interface GlobalAIAssistantProps {
    initialAppConfigs: AppConfig[];
}

/**
 * Global component to manage the visibility of the AI Assistant Widget
 * based on login status and role-based permissions.
 */
export default function GlobalAIAssistant({ initialAppConfigs }: GlobalAIAssistantProps) {
    const [user, setUser] = useState<StoredUser | null>(null);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        // Initial user load
        setUser(getStoredUser());

        // Listen for storage changes (login/logout in other tabs or components)
        const handleStorageChange = () => {
            setUser(getStoredUser());
        };

        window.addEventListener('storage', handleStorageChange);
        // Custom event if the app uses one for login/logout (common pattern in this codebase)
        window.addEventListener('tutor:auth-changed', handleStorageChange);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('tutor:auth-changed', handleStorageChange);
        };
    }, []);

    // Prevent hydration mismatch
    if (!isMounted) return null;

    // RULE 1: If not logged in, NEVER show the AI Assistant
    if (!user) {
        return null;
    }

    // RULE 2: If logged in, check role-based permissions
    const aiWidgetConfig = initialAppConfigs.find(c => c.id === 'AI_ASSISTANT');
    let isAiWidgetVisible = false;

    if (aiWidgetConfig) {
        const roleKey = user.role || 'student';
        const perm = aiWidgetConfig.permissions.find(p => p.roleId === roleKey);

        // Use perm.visible if it exists, otherwise default to false for safety
        isAiWidgetVisible = perm ? perm.visible === true : false;
    }

    if (!isAiWidgetVisible) {
        return null;
    }

    return <AIAssistantWidget />;
}
