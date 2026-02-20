"use client";

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAdminSettings } from '@/components/AdminSettingsProvider';
import { getStoredUser } from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';

export default function PermissionGuard() {
    const pathname = usePathname();
    const router = useRouter();
    const { settings, loading } = useAdminSettings();
    const [authorized, setAuthorized] = useState(true);
    const [checking, setChecking] = useState(true);
    const t = useT();

    useEffect(() => {
        // If settings are still loading, we can't decide yet.
        // However, to avoid blocking the UI too much, we might opt to fail open or closed.
        // Safe default: wait for settings.
        if (loading) return;

        // Logic to check permissions
        const checkAccess = () => {
            if (!settings?.pageConfigs) {
                // If no config, assume everything is allowed (or safer: wait?)
                // Let's assume allowed if configs are missing to prevent lockout on error
                setAuthorized(true);
                setChecking(false);
                return;
            }

            // Find config for current path
            // We need to match exact paths or subpaths.
            // Simple strategy: check if any config path matches the start of current path
            // BUT, be careful about specificity.
            // e.g. /admin vs /admin/users

            // Let's try to find an exact match first, then parent paths?
            // Actually, pageConfigs usually contains exact routes like /pricing.
            // What about /pricing/subfeature?

            // Bypass for /classroom paths since they manage their own permissions
            if (pathname?.startsWith('/classroom')) {
                setAuthorized(true);
                setChecking(false);
                return;
            }

            // Filter configs that match the start of the pathname
            // Sort by length descending to match most specific path first
            const config = settings.pageConfigs
                .filter((pc: any) => pathname === pc.path || (pathname?.startsWith(pc.path + '/') && pc.path !== '/'))
                .sort((a: any, b: any) => b.path.length - a.path.length)[0];

            if (!config) {
                // Page not managed by permissions -> Allow access
                setAuthorized(true);
                setChecking(false);
                return;
            }

            // Found a config, check role permission
            const user = getStoredUser();
            const role = user?.role || 'student'; // Default role is student (guest treated as student/viewer often, or explicit guest?)

            // Check for specific role permission
            // If user is not logged in (user is null), treat as 'student' or 'guest'?
            // System seems to use 'student' as default for public/viewer in some places, 
            // check mockAuth strategies.

            // If role is admin, usually allow all? 
            // But admin *can* restrict themselves in the UI settings (though risky).
            // Let's strictly follow the settings.

            const perm = (config.permissions || []).find((p: any) => String(p.roleId).toLowerCase() === String(role).toLowerCase());

            // Default rule:
            // If permission record exists: use pageVisible
            // If no permission record for this role: 
            //    - If role is admin -> allow (fallback safety)
            //    - If other -> block? Or allow?
            //    Based on PageAccessSettings.tsx logic, if missing it might be added.
            //    Let's default to ALLOW if strictly not forbidden, 
            //    BUT the UI checkboxes imply "checked = visible".

            let isAllowed = true;
            if (perm) {
                isAllowed = perm.pageVisible !== false;
            } else {
                // No explicit permission set for this role on this page
                // Default behavior: Allow? 
                // If I am a new role 'parent' and no config exists, do I see it?
                // Safest: Allow unless forbidden.
                isAllowed = true;
            }

            console.log(`[PermissionGuard] Path: ${pathname}, Role: ${role}, Matched Config: ${config.path}, Allowed: ${isAllowed}`);

            if (!isAllowed) {
                console.log(`[PermissionGuard] Access denied for ${role} to ${pathname}`);
                setAuthorized(false);
            } else {
                setAuthorized(true);
            }
            setChecking(false);
        };

        checkAccess();

        // Re-check on auth change (listen to event)
        const onAuthChange = () => checkAccess();
        window.addEventListener('tutor:auth-changed', onAuthChange);

        return () => {
            window.removeEventListener('tutor:auth-changed', onAuthChange);
        };

    }, [pathname, settings, loading]);

    // Effect to handle redirection when unauthorized
    useEffect(() => {
        if (!checking && !authorized) {
            if (pathname === '/') return; // Don't redirect homepage loop

            // If specific authorized redirect is needed
            router.replace('/');
            // Or show a toast/alert?
            // alert('Access Denied'); // A bit intrusive
        }
    }, [checking, authorized, router, pathname]);

    if (loading || checking) {
        return null; // Or a spinner? Transparent is better to avoid flicker if fast
    }

    if (!authorized) {
        // Return null to render nothing while redirecting
        // Or render a "403" component
        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666'
            }}>
                <h2>403 - Access Denied</h2>
                <p>You do not have permission to view this page.</p>
                <button
                    onClick={() => router.push('/')}
                    style={{
                        marginTop: 16,
                        padding: '8px 16px',
                        background: '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer'
                    }}
                >
                    Return Home
                </button>
            </div>
        );
    }

    return null; // Render nothing if authorized (it's just a guard)
}
