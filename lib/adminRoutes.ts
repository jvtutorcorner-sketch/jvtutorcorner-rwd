/**
 * Single source of truth for all /admin/** page routes.
 *
 * This does NOT replace the DB-backed `pageConfigs` visibility system
 * (lib/pagePermissionsService.ts / app/api/admin/settings/route.ts) — that
 * system still decides *whether* a role sees a link (menuVisible/
 * dropdownVisible/pageVisible flags). This manifest only replaces the
 * literal duplicated path+label strings that used to be copy-pasted across
 * components/MenuBar.tsx, app/dashboard/page.tsx, and other consumers.
 *
 * When adding a new /admin/** page, add one entry here — do not hand-write
 * the path string anywhere else.
 */

export type AdminRouteGroup =
  | 'finance'
  | 'reviews'
  | 'tools'
  | 'organizations'
  | 'settings'
  | 'roles'
  | 'analytics'
  | 'legacy';

export interface AdminRouteEntry {
  /** Stable id, independent of path — use as lookup key; survives future path renames. */
  key: string;
  /** Canonical URL path. The source of truth — never hardcode this elsewhere. */
  path: string;
  label: string;
  group: AdminRouteGroup;
}

export const ADMIN_ROUTES: AdminRouteEntry[] = [
  // ---- finance ----
  { key: 'admin.finance.orders', path: '/admin/finance/orders', label: '訂單管理列表', group: 'finance' },
  { key: 'admin.finance.payments', path: '/admin/finance/payments', label: '💳 收款管理', group: 'finance' },
  { key: 'admin.finance.refunds', path: '/admin/finance/refunds', label: '退款申請處理', group: 'finance' },

  // ---- reviews ----
  { key: 'admin.reviews.teacher', path: '/admin/reviews/teacher-reviews', label: '老師審核', group: 'reviews' },
  { key: 'admin.reviews.course', path: '/admin/reviews/course-reviews', label: '課程審核', group: 'reviews' },

  // ---- tools ----
  { key: 'admin.tools.whiteboardAgora', path: '/admin/tools/whiteboard_agora', label: 'Agora 白板 SDK', group: 'tools' },
  { key: 'admin.tools.whiteboardCanvas', path: '/admin/tools/whiteboard_canvas', label: 'Canvas 白板', group: 'tools' },
  { key: 'admin.tools.whiteboardSse', path: '/admin/tools/whiteboard_sse', label: '白板 SSE', group: 'tools' },
  { key: 'admin.tools.makeSettings', path: '/admin/tools/make-settings', label: 'Make.com 整合設定', group: 'tools' },
  { key: 'admin.tools.migrateReminders', path: '/admin/tools/migrate-reminders', label: '提醒資料遷移工具', group: 'tools' },
  { key: 'admin.tools.aiChat', path: '/admin/tools/ai-chat', label: 'AI 聊天室', group: 'tools' },
  { key: 'admin.tools.auditLogs', path: '/admin/audit-logs', label: '稽核紀錄查詢', group: 'tools' },

  // ---- untouched groups, catalogued for completeness (this manifest = ALL of app/admin/**) ----
  { key: 'admin.organizations.list', path: '/admin/organizations', label: '企業組織管理', group: 'organizations' },
  { key: 'admin.settings.root', path: '/admin/settings', label: '系統設定', group: 'settings' },
  { key: 'admin.settings.menu', path: '/admin/settings/menu', label: 'Menu 設定', group: 'settings' },
  { key: 'admin.settings.dropdown', path: '/admin/settings/dropdown', label: 'Dropdown Menu 設定', group: 'settings' },
  { key: 'admin.settings.pagePerms', path: '/admin/settings/page-permissions', label: 'Page 存取權限', group: 'settings' },
  { key: 'admin.settings.rolesUsage', path: '/admin/settings/roles-usage', label: 'Role 使用設定', group: 'settings' },
  { key: 'admin.settings.about', path: '/admin/settings/about', label: '關於', group: 'settings' },
  { key: 'admin.settings.whiteboard', path: '/admin/settings/whiteboard', label: '白板與課堂互動設定', group: 'settings' },
  { key: 'admin.roles', path: '/admin/roles', label: '角色權限管理', group: 'roles' },
  { key: 'admin.analytics', path: '/admin/analytics', label: '網站流量分析 (GA4)', group: 'analytics' },
  { key: 'admin.legacy.teacherEscrow', path: '/admin/teacher-escrow', label: '教師點數 Escrow（舊版）', group: 'legacy' },
];

// Dynamic-segment helpers — the manifest above only covers static paths.
export const adminOrderDetailPath = (orderId: string) => `/admin/finance/orders/${orderId}`;
export const adminOrganizationDetailPath = (id: string) => `/admin/organizations/${id}`;

export function getAdminRoute(key: string): AdminRouteEntry | undefined {
  return ADMIN_ROUTES.find((r) => r.key === key);
}

export function getAdminRoutesByGroup(group: AdminRouteGroup): AdminRouteEntry[] {
  return ADMIN_ROUTES.filter((r) => r.group === group);
}
