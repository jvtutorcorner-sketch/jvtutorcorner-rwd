"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import OrgUnitTreePanel from "@/components/org/OrgUnitTreePanel";
import OrgMembersPanel from "@/components/org/OrgMembersPanel";
import OrgLicensesPanel from "@/components/org/OrgLicensesPanel";
import OrgBillingPanel from "@/components/org/OrgBillingPanel";
// viewerScope 由 server page（app/admin/organizations/[id]/page.tsx）依 profile 判定，與 API 權限一致：
//   - system    ：全部分頁與操作
//   - org_admin ：自己組織全部分頁；計費建立/續約、組織管理員指派等仍為系統管理員專屬
//   - dept_admin：只有組織單位 / 成員（API 只開放部門子樹），無法讀取組織、授權、帳單 API
import type { OrgViewerScope } from "@/app/admin/organizations/orgViewerScope";

type Organization = {
  id: string;
  name: string;
  domain?: string;
  planTier: 'starter' | 'business' | 'enterprise';
  status: 'active' | 'suspended' | 'trial' | 'cancelled';
  maxSeats: number;
  usedSeats: number;
  billingEmail?: string;
  contractStartDate?: string;
  contractEndDate?: string;
};

/** Server 端提供給 dept_admin 的組織摘要（不含計費資訊）。 */
export type OrganizationSummary = Pick<Organization, 'id' | 'name' | 'planTier' | 'status' | 'maxSeats' | 'usedSeats'>;


type Tab = 'overview' | 'units' | 'members' | 'licenses' | 'billing';

const STATUS_LABEL: Record<Organization['status'], string> = {
  active: '啟用中',
  trial: '試用中',
  suspended: '已停用',
  cancelled: '已取消'
};

interface Props {
  orgId: string;
  viewerScope: OrgViewerScope;
  initialOrg?: OrganizationSummary | null;
}

export default function OrganizationDetailManager({ orgId, viewerScope, initialOrg }: Props) {
  const isSystemAdmin = viewerScope === 'system';
  const isDeptAdminView = viewerScope === 'dept_admin';
  const [org, setOrg] = useState<Organization | null>(initialOrg ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(isDeptAdminView ? 'units' : 'overview');

  async function loadOrg() {
    // dept_admin 無權呼叫 GET /api/organizations/[id]，改用 server 提供的摘要（不再重新載入）。
    if (isDeptAdminView) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/organizations/${orgId}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '無法載入組織資料');
      setOrg(data.organization);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  if (loading) return <p>載入中...</p>;
  if (error) return <p style={{ color: '#d32f2f' }}>{error}</p>;
  if (!org) return isDeptAdminView ? <p style={{ color: '#d32f2f' }}>無法載入組織資料</p> : null;

  const seatPct = org.maxSeats > 0 ? Math.min(100, Math.round((org.usedSeats / org.maxSeats) * 100)) : 0;

  return (
    <div>
      {isSystemAdmin && (
        <Link href="/admin/organizations" style={{ color: '#1565c0', fontSize: 13 }}>
          ← 返回組織列表
        </Link>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          padding: 16,
          margin: '12px 0 20px',
          backgroundColor: '#f5f5f5',
          borderRadius: 6
        }}
      >
        <div>
          <h2 style={{ margin: '0 0 6px' }}>{org.name}</h2>
          <div style={{ fontSize: 13, color: '#555' }}>
            {org.domain && <span style={{ marginRight: 12 }}>網域：{org.domain}</span>}
            <span style={{ marginRight: 12 }}>方案：{org.planTier}</span>
            {org.billingEmail && <span>計費信箱：{org.billingEmail}</span>}
          </div>
          {(org.contractStartDate || org.contractEndDate) && (
            <div style={{ fontSize: 13, color: '#777', marginTop: 4 }}>
              合約：{org.contractStartDate || '-'} ~ {org.contractEndDate || '-'}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', minWidth: 160 }}>
          <span
            style={{
              padding: '4px 10px',
              backgroundColor: org.status === 'active' ? '#4caf50' : org.status === 'trial' ? '#ff9800' : '#9e9e9e',
              color: 'white',
              borderRadius: 3,
              fontSize: 12,
              fontWeight: 'bold'
            }}
          >
            {STATUS_LABEL[org.status]}
          </span>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            席次 {org.usedSeats} / {org.maxSeats}
          </div>
          <div style={{ background: '#eee', borderRadius: 3, height: 6, marginTop: 4, overflow: 'hidden' }}>
            <div
              style={{
                width: `${seatPct}%`,
                height: '100%',
                backgroundColor: seatPct >= 90 ? '#f44336' : '#4caf50'
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '2px solid #eee' }}>
        {(([
          ['overview', '概覽'],
          ['units', '組織單位'],
          ['members', '成員'],
          ['licenses', '授權'],
          ['billing', '帳單']
        ] as [Tab, string][]).filter(([key]) => !isDeptAdminView || key === 'units' || key === 'members')).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: tab === key ? '3px solid #2196f3' : '3px solid transparent',
              backgroundColor: 'transparent',
              fontWeight: tab === key ? 'bold' : 'normal',
              cursor: 'pointer'
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && !isDeptAdminView && (
        <div>
          <p>
            這個企業註冊入口的邀請連結：
            <br />
            <code>/login/register_enterprise</code>（選擇「{org.name}」即可加入此組織，前提是組織狀態為啟用中/試用中且席次未滿）
          </p>
        </div>
      )}
      {tab === 'units' && <OrgUnitTreePanel orgId={orgId} />}
      {tab === 'members' && (
        <OrgMembersPanel
          orgId={orgId}
          orgDomain={org.domain}
          usedSeats={org.usedSeats}
          maxSeats={org.maxSeats}
          isSystemAdmin={isSystemAdmin}
          canManageDeptAdmins={viewerScope === 'system' || viewerScope === 'org_admin'}
          canImportMembers={viewerScope === 'system' || viewerScope === 'org_admin'}
          onSeatsChanged={loadOrg}
        />
      )}
      {tab === 'licenses' && !isDeptAdminView && <OrgLicensesPanel orgId={orgId} onSeatsChanged={loadOrg} />}
      {tab === 'billing' && !isDeptAdminView && <OrgBillingPanel orgId={orgId} isSystemAdmin={isSystemAdmin} />}
    </div>
  );
}
