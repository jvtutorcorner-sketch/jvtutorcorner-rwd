"use client";

import { useEffect, useState } from "react";

type Invoice = {
  id: string;
  periodStart: string;
  periodEnd: string;
  seats: number;
  amount: number;
  currency: string;
  status: 'unpaid' | 'paid' | 'void';
  dueDate: string;
  paidAt?: string;
  notes?: string;
};

type BillingStatus = {
  contractStatus: 'no_contract' | 'active' | 'expiring_soon' | 'expired';
  contractEndDate: string | null;
  overdueInvoices: Invoice[];
  totalOutstanding: number;
  totalOutstandingCurrency: string | null;
};

interface Props {
  orgId: string;
  isSystemAdmin: boolean;
}

const CONTRACT_STATUS_LABEL: Record<BillingStatus['contractStatus'], string> = {
  no_contract: '尚未設定合約期間',
  active: '合約有效',
  expiring_soon: '合約即將到期',
  expired: '合約已到期'
};

const INVOICE_STATUS_LABEL: Record<Invoice['status'], string> = {
  unpaid: '未付款',
  paid: '已付款',
  void: '已作廢'
};

function fmtDate(iso?: string | null) {
  if (!iso) return '-';
  return iso.slice(0, 10);
}

export default function OrgBillingPanel({ orgId, isSystemAdmin }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    periodStart: '',
    periodEnd: '',
    seats: '',
    amount: '',
    currency: 'TWD',
    dueDate: '',
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [renewDate, setRenewDate] = useState('');
  const [renewing, setRenewing] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [invRes, statusRes] = await Promise.all([
        fetch(`/api/organizations/${orgId}/invoices`),
        fetch(`/api/organizations/${orgId}/billing-status`)
      ]);
      const invData = await invRes.json();
      const statusData = await statusRes.json();
      if (!invRes.ok || !invData.ok) throw new Error(invData?.error || '無法載入發票');
      if (!statusRes.ok || !statusData.ok) throw new Error(statusData?.error || '無法載入帳單狀態');
      setInvoices(invData.invoices || []);
      setStatus(statusData);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodStart: form.periodStart,
          periodEnd: form.periodEnd,
          seats: form.seats ? Number(form.seats) : undefined,
          amount: Number(form.amount),
          currency: form.currency,
          dueDate: form.dueDate,
          notes: form.notes || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '建立發票失敗');
      setForm({ periodStart: '', periodEnd: '', seats: '', amount: '', currency: form.currency, dueDate: '', notes: '' });
      await load();
    } catch (err: any) {
      setFormError(err?.message || String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetStatus(invoice: Invoice, next: 'paid' | 'void') {
    const confirmMsg = next === 'paid' ? '確定要把這筆發票標記為已付款嗎？' : '確定要作廢這筆發票嗎？';
    if (!confirm(confirmMsg)) return;
    try {
      const res = await fetch(`/api/organizations/${orgId}/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '更新發票失敗');
      await load();
    } catch (err: any) {
      alert(err?.message || String(err));
    }
  }

  async function handleRenew(e: React.FormEvent) {
    e.preventDefault();
    if (!renewDate) return;
    setRenewing(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newContractEndDate: renewDate })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '續約失敗');
      setRenewDate('');
      await load();
    } catch (err: any) {
      alert(err?.message || String(err));
    } finally {
      setRenewing(false);
    }
  }

  const bannerColor =
    status?.contractStatus === 'expired' || status?.overdueInvoices.length
      ? '#f44336'
      : status?.contractStatus === 'expiring_soon'
      ? '#ff9800'
      : null;

  return (
    <div>
      <h3>帳單</h3>

      {loading && <p>載入中...</p>}
      {error && <p style={{ color: '#d32f2f' }}>{error}</p>}

      {status && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            borderRadius: 4,
            backgroundColor: bannerColor ? `${bannerColor}1a` : '#f0f0f0',
            border: bannerColor ? `1px solid ${bannerColor}` : '1px solid #ddd'
          }}
        >
          <div>
            合約狀態：<strong>{CONTRACT_STATUS_LABEL[status.contractStatus]}</strong>
            {status.contractEndDate && <span>（到期日：{fmtDate(status.contractEndDate)}）</span>}
          </div>
          {status.overdueInvoices.length > 0 && (
            <div style={{ marginTop: 4, color: '#c62828', fontWeight: 'bold' }}>
              ⚠️ 有 {status.overdueInvoices.length} 筆逾期未繳發票，合計{' '}
              {status.totalOutstanding} {status.totalOutstandingCurrency || ''}
              <span style={{ fontWeight: 'normal', marginLeft: 8, color: '#555' }}>
                （僅供提示，不會影響組織成員的課程存取）
              </span>
            </div>
          )}
        </div>
      )}

      {isSystemAdmin && (
        <>
          <form
            onSubmit={handleRenew}
            style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}
          >
            <label style={{ fontSize: 13 }}>續約至：</label>
            <input
              type="date"
              value={renewDate}
              onChange={(e) => setRenewDate(e.target.value)}
              required
              style={{ padding: 6 }}
            />
            <button type="submit" disabled={renewing} style={btn('#2196f3')}>
              續約合約
            </button>
          </form>

          <form
            onSubmit={handleCreateInvoice}
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: 16,
              padding: 12,
              backgroundColor: '#f5f5f5',
              borderRadius: 4
            }}
          >
            <input
              type="date"
              required
              placeholder="計費起"
              value={form.periodStart}
              onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
              style={{ padding: 6 }}
            />
            <input
              type="date"
              required
              placeholder="計費迄"
              value={form.periodEnd}
              onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
              style={{ padding: 6 }}
            />
            <input
              type="number"
              min={1}
              placeholder="席次（預設用目前上限）"
              value={form.seats}
              onChange={(e) => setForm({ ...form, seats: e.target.value })}
              style={{ padding: 6, width: 160 }}
            />
            <input
              type="number"
              min={0}
              step="0.01"
              required
              placeholder="金額"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              style={{ padding: 6, width: 100 }}
            />
            <input
              type="text"
              required
              placeholder="幣別"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              style={{ padding: 6, width: 70 }}
            />
            <input
              type="date"
              required
              placeholder="繳款期限"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              style={{ padding: 6 }}
            />
            <input
              type="text"
              placeholder="備註（選填）"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              style={{ padding: 6, minWidth: 160 }}
            />
            <button type="submit" disabled={submitting} style={btn('#4caf50')}>
              + 建立發票
            </button>
            {formError && <span style={{ color: '#d32f2f' }}>{formError}</span>}
          </form>
        </>
      )}

      {!loading && invoices.length === 0 && <p style={{ color: '#999' }}>尚無發票紀錄</p>}

      {!loading && invoices.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', border: '2px solid #ccc', width: '100%' }}>
            <thead>
              <tr>
                <th style={th}>計費期間</th>
                <th style={th}>席次</th>
                <th style={th}>金額</th>
                <th style={th}>繳款期限</th>
                <th style={th}>狀態</th>
                <th style={th}>付款日</th>
                <th style={th}>備註</th>
                {isSystemAdmin && <th style={th}>操作</th>}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const isOverdue = inv.status === 'unpaid' && new Date(inv.dueDate).getTime() < Date.now();
                return (
                  <tr key={inv.id}>
                    <td style={td}>{fmtDate(inv.periodStart)} ~ {fmtDate(inv.periodEnd)}</td>
                    <td style={td}>{inv.seats}</td>
                    <td style={td}>{inv.amount} {inv.currency}</td>
                    <td style={td}>{fmtDate(inv.dueDate)}</td>
                    <td style={td}>
                      <span style={{ color: isOverdue ? '#c62828' : inv.status === 'paid' ? '#4caf50' : '#666', fontWeight: 'bold' }}>
                        {isOverdue ? '已逾期' : INVOICE_STATUS_LABEL[inv.status]}
                      </span>
                    </td>
                    <td style={td}>{fmtDate(inv.paidAt)}</td>
                    <td style={td}>{inv.notes || '-'}</td>
                    {isSystemAdmin && (
                      <td style={td}>
                        {inv.status === 'unpaid' && (
                          <>
                            <button onClick={() => handleSetStatus(inv, 'paid')} style={btn('#4caf50')}>
                              標記已付款
                            </button>{' '}
                            <button onClick={() => handleSetStatus(inv, 'void')} style={btn('#9e9e9e')}>
                              作廢
                            </button>
                          </>
                        )}
                      </td>
                    )}
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

function btn(color: string): React.CSSProperties {
  return {
    padding: '5px 12px',
    backgroundColor: color,
    color: 'white',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12
  };
}

const th: React.CSSProperties = { border: '2px solid #ccc', padding: 8, textAlign: 'left', backgroundColor: '#fafafa' };
const td: React.CSSProperties = { border: '2px solid #ccc', padding: 8 };
