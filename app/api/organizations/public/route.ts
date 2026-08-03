/**
 * Public Organizations Listing — minimal, unauthenticated endpoint for the pre-login
 * enterprise registration page (app/login/register_enterprise). Deliberately NOT the
 * same route as GET /api/organizations (which is now system-admin/org-admin gated) —
 * mixing an admin-only route with a public-safe variant behind a weaker guard would
 * mean one endpoint with two security postures. Only exposes what a registration form
 * needs: id, name, domain (for email-domain matching) and remaining seat capacity.
 */

import { NextResponse } from 'next/server';
import organizationService from '@/lib/organizationService';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [active, trial] = await Promise.all([
      organizationService.listOrganizations('active'),
      organizationService.listOrganizations('trial')
    ]);

    const organizations = [...active, ...trial]
      .filter((org) => org.domain) // 沒有設定網域的組織不開放公開自助註冊，避免任何人都能加入
      .map((org) => ({
        id: org.id,
        name: org.name,
        domain: org.domain,
        availableSeats: Math.max(0, org.maxSeats - org.usedSeats)
      }));

    return NextResponse.json(
      { ok: true, organizations },
      { headers: { 'Cache-Control': 'public, max-age=60' } }
    );
  } catch (error: any) {
    console.error('[OrganizationsPublicAPI] GET failed:', error.message);
    return NextResponse.json(
      { ok: false, error: 'Failed to list organizations' },
      { status: 500 }
    );
  }
}
