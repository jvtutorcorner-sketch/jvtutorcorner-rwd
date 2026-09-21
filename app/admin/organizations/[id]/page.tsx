import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import OrganizationDetailManager, { type OrganizationSummary } from '@/components/OrganizationDetailManager';
import { getSession } from '@/lib/auth/sessionManager';
import organizationService from '@/lib/organizationService';
import { resolveOrgViewerScope } from '../orgViewerScope';

export const metadata = {
  title: 'Admin - Organization Detail',
};

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // layout 已做同樣的判斷；layout 與 page 會平行 render，這裡再擋一次避免只靠 layout。
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;
  const session = token ? await getSession(token) : null;
  if (!session) {
    redirect('/login?reason=admin_invalid_session');
  }
  const viewerScope = await resolveOrgViewerScope(session, id);
  if (!viewerScope) {
    redirect('/dashboard?forbidden=1');
  }

  // dept_admin 無法呼叫 GET /api/organizations/[id]（API 只開放 system / org admin），
  // 這裡由 server 端提供不含計費資訊的摘要，讓頁首仍能顯示組織名稱與席次。
  let initialOrg: OrganizationSummary | null = null;
  if (viewerScope === 'dept_admin') {
    try {
      const org = await organizationService.getOrganizationById(id);
      if (org) {
        initialOrg = {
          id: org.id,
          name: org.name,
          planTier: org.planTier,
          status: org.status,
          maxSeats: org.maxSeats,
          usedSeats: org.usedSeats,
        };
      }
    } catch (err) {
      console.warn('[admin/organizations/[id]] load org summary failed', err instanceof Error ? err.message : err);
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <OrganizationDetailManager orgId={id} viewerScope={viewerScope} initialOrg={initialOrg} />
    </main>
  );
}
