"use client";

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAdminSettings } from '@/components/AdminSettingsProvider';
import { getStoredUser } from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';

/**
 * 依管理員在後台設定的頁面可見度矩陣（settings.pageConfigs）決定要不要顯示內容。
 *
 * 這是「介面層」的可見度控制，不是安全邊界：角色來自 localStorage，使用者可以自行修改。
 * 真正的存取控制在兩個地方 ——
 *   1. 各區塊的 server layout（lib/auth/pageGuard.ts），在渲染前於伺服器端擋下
 *   2. API 路由的 apiGuard（withAuth / withAdmin / …）
 *
 * 先前這個元件是 `{children}` 的「兄弟節點」而非包裹層：判定拒絕時只是在頁面上方
 * 多渲染一塊 403 面板，被保護的內容仍然完整掛載並送出所有 API 請求。現在它會真正
 * 包住內容，拒絕時內容不會被渲染。
 *
 * 判定完成前「照常渲染」children：角色存在 localStorage，伺服器端無法得知，
 * 若在判定前回傳 null，伺服器端永遠停在 checking 狀態，所有頁面的 SSR HTML
 * 都只剩 header/footer（SEO、課程頁、票券 QR 都因此消失）。伺服器端與第一次
 * client 渲染輸出相同內容，hydration 才不會不一致；判定為拒絕後才換成 403 面板
 * 並導回首頁。需要真正擋下的頁面由 server layout 的 pageGuard 在渲染前處理。
 */
export default function PermissionGuard({ children }: { children: React.ReactNode }) {
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

            // Bypass for /classroom paths and checkDevices since they manage their own permissions
            if (pathname?.startsWith('/classroom') || pathname?.startsWith('/checkDevices')) {
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
            if (role === 'admin' && pathname?.startsWith('/admin')) {
                // Safety bypass: Admin can always access admin pages
                isAllowed = true;
            } else if (perm) {
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

    // 判定完成且確定拒絕時才擋下；判定中（含伺服器端渲染）照常輸出內容，理由見上方說明。
    if (!loading && !checking && !authorized) {
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

    return <>{children}</>;
}
