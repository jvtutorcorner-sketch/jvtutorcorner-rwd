"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Organization = {
  id: string;
  name: string;
  domain?: string;
  planTier: 'starter' | 'business' | 'enterprise';
  status: 'active' | 'suspended' | 'trial' | 'cancelled';
  maxSeats: number;
  usedSeats: number;
  billingEmail: string;
  industry?: string;
  country?: string;
  taxId?: string;
  createdAt: string;
  updatedAt: string;
};

const STATUS_LABEL: Record<Organization['status'], string> = {
  active: '啟用中',
  trial: '試用中',
  suspended: '已停用',
  cancelled: '已取消'
};

const STATUS_COLOR: Record<Organization['status'], string> = {
  active: '#4caf50',
  trial: '#ff9800',
  suspended: '#9e9e9e',
  cancelled: '#f44336'
};

const PLAN_LABEL: Record<Organization['planTier'], string> = {
  starter: 'Starter',
  business: 'Business',
  enterprise: 'Enterprise'
};

type FormState = {
  name: string;
  domain: string;
  planTier: Organization['planTier'];
  maxSeats: string;
  billingEmail: string;
  industry: string;
  country: string;
  taxId: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  domain: '',
  planTier: 'starter',
  maxSeats: '10',
  billingEmail: '',
  industry: '',
  country: '',
  taxId: ''
};

export default function OrganizationsManager() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | Organization['status']>('ALL');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const q = statusFilter !== 'ALL' ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/organizations${q}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '無法載入組織列表');
      setOrganizations(data.organizations || []);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          domain: form.domain || undefined,
          planTier: form.planTier,
          maxSeats: parseInt(form.maxSeats, 10),
          billingEmail: form.billingEmail,
          industry: form.industry || undefined,
          country: form.country || undefined,
          taxId: form.taxId || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '建立組織失敗');
      setForm(EMPTY_FORM);
      setShowCreateForm(false);
      await load();
    } catch (err: any) {
      setFormError(err?.message || String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(org: Organization, status: Organization['status']) {
    if (!confirm(`確定要將「${org.name}」的狀態改為「${STATUS_LABEL[status]}」嗎？`)) return;
    try {
      const res = await fetch(`/api/organizations/${org.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '更新狀態失敗');
      await load();
    } catch (err: any) {
      alert(err?.message || String(err));
    }
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>組織列表</h2>
        <button
          onClick={() => setShowCreateForm((v) => !v)}
          style={{
            padding: '8px 16px',
            backgroundColor: '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          {showCreateForm ? '取消' : '+ 建立組織'}
        </button>
      </div>

      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          style={{
            marginBottom: 20,
            padding: 16,
            backgroundColor: '#f5f5f5',
            borderRadius: 4,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12
          }}
        >
          <label>
            組織名稱 *
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={{ width: '100%', padding: 6, marginTop: 4 }}
            />
          </label>
          <label>
            網域（選填，如 acme.com）
            <input
              value={form.domain}
              onChange={(e) => setForm({ ...form, domain: e.target.value })}
              style={{ width: '100%', padding: 6, marginTop: 4 }}
            />
          </label>
          <label>
            方案
            <select
              value={form.planTier}
              onChange={(e) => setForm({ ...form, planTier: e.target.value as Organization['planTier'] })}
              style={{ width: '100%', padding: 6, marginTop: 4 }}
            >
              <option value="starter">Starter</option>
              <option value="business">Business</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </label>
          <label>
            席次上限 *
            <input
              required
              type="number"
              min={1}
              value={form.maxSeats}
              onChange={(e) => setForm({ ...form, maxSeats: e.target.value })}
              style={{ width: '100%', padding: 6, marginTop: 4 }}
            />
          </label>
          <label>
            計費信箱 *
            <input
              required
              type="email"
              value={form.billingEmail}
              onChange={(e) => setForm({ ...form, billingEmail: e.target.value })}
              style={{ width: '100%', padding: 6, marginTop: 4 }}
            />
          </label>
          <label>
            產業別
            <input
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              style={{ width: '100%', padding: 6, marginTop: 4 }}
            />
          </label>
          <label>
            國家
            <input
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              style={{ width: '100%', padding: 6, marginTop: 4 }}
            />
          </label>
          <label>
            統一編號 / Tax ID
            <input
              value={form.taxId}
              onChange={(e) => setForm({ ...form, taxId: e.target.value })}
              style={{ width: '100%', padding: 6, marginTop: 4 }}
            />
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            {formError && <p style={{ color: '#d32f2f' }}>{formError}</p>}
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '8px 20px',
                backgroundColor: '#4caf50',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: submitting ? 'not-allowed' : 'pointer'
              }}
            >
              {submitting ? '建立中...' : '建立'}
            </button>
          </div>
        </form>
      )}

      <div style={{ marginBottom: 16 }}>
        <label>
          <strong>狀態篩選：</strong>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={{ marginLeft: 10, padding: 5 }}
          >
            <option value="ALL">全部</option>
            <option value="active">啟用中</option>
            <option value="trial">試用中</option>
            <option value="suspended">已停用</option>
            <option value="cancelled">已取消</option>
          </select>
        </label>
      </div>

      {error && (
        <div style={{ color: '#d32f2f', padding: 10, marginBottom: 20, backgroundColor: '#ffebee', borderRadius: 4 }}>
          Error: {error}
        </div>
      )}

      {loading && <p>載入中...</p>}

      {!loading && organizations.length === 0 && (
        <p style={{ color: '#999', textAlign: 'center', padding: 40 }}>尚無組織</p>
      )}

      {!loading && organizations.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', border: '2px solid #ccc', width: '100%' }}>
            <thead>
              <tr>
                <th style={th}>名稱</th>
                <th style={th}>網域</th>
                <th style={th}>方案</th>
                <th style={th}>狀態</th>
                <th style={th}>席次</th>
                <th style={th}>計費信箱</th>
                <th style={th}>建立時間</th>
                <th style={th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => {
                const seatPct = org.maxSeats > 0 ? Math.min(100, Math.round((org.usedSeats / org.maxSeats) * 100)) : 0;
                const seatWarn = seatPct >= 90;
                return (
                  <tr key={org.id}>
                    <td style={td}>
                      <Link href={`/admin/organizations/${org.id}`} style={{ color: '#1565c0', fontWeight: 'bold' }}>
                        {org.name}
                      </Link>
                    </td>
                    <td style={td}>{org.domain || '-'}</td>
                    <td style={td}>{PLAN_LABEL[org.planTier]}</td>
                    <td style={td}>
                      <span
                        style={{
                          padding: '4px 8px',
                          backgroundColor: STATUS_COLOR[org.status],
                          color: 'white',
                          borderRadius: 3,
                          fontSize: 12,
                          fontWeight: 'bold'
                        }}
                      >
                        {STATUS_LABEL[org.status]}
                      </span>
                    </td>
                    <td style={{ ...td, minWidth: 140 }}>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>
                        {org.usedSeats} / {org.maxSeats}
                      </div>
                      <div style={{ background: '#eee', borderRadius: 3, height: 6, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${seatPct}%`,
                            height: '100%',
                            backgroundColor: seatWarn ? '#f44336' : '#4caf50'
                          }}
                        />
                      </div>
                    </td>
                    <td style={td}>{org.billingEmail}</td>
                    <td style={{ ...td, fontSize: 12 }}>{new Date(org.createdAt).toLocaleDateString('zh-TW')}</td>
                    <td style={td}>
                      <Link
                        href={`/admin/organizations/${org.id}`}
                        style={{
                          padding: '4px 10px',
                          backgroundColor: '#2196f3',
                          color: 'white',
                          borderRadius: 4,
                          fontSize: 12,
                          textDecoration: 'none',
                          marginRight: 6,
                          display: 'inline-block'
                        }}
                      >
                        檢視詳情
                      </Link>
                      {org.status !== 'cancelled' && (
                        <button
                          onClick={() => handleStatusChange(org, 'cancelled')}
                          style={{
                            padding: '4px 10px',
                            backgroundColor: '#f44336',
                            color: 'white',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: 12
                          }}
                        >
                          停用
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { border: '2px solid #ccc', padding: 8, textAlign: 'left', backgroundColor: '#fafafa' };
const td: React.CSSProperties = { border: '2px solid #ccc', padding: 8 };
