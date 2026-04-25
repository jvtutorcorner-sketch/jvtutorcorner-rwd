'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type PaymentRecord = {
  orderId?: string;
  userId?: string;
  amount?: number;
  currency?: string;
  status?: string;
  paymentMethod?: string;
  method?: string;
  createdAt?: string;
  updatedAt?: string;
  courseId?: string;
  courseTitle?: string;
  [key: string]: any;
};

type Summary = {
  totalAmount: number;
  totalCount: number;
  statusBreakdown: Record<string, { count: number; amount: number }>;
  methodBreakdown: Record<string, { count: number; amount: number }>;
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#FFA500',
  PAID: '#4CAF50',
  COMPLETED: '#2196F3',
  REFUNDED: '#FF9800',
  FAILED: '#F44336',
  CANCELLED: '#9E9E9E',
};

const METHOD_COLORS: Record<string, string> = {
  STRIPE: '#635BFF',
  PAYPAL: '#0070BA',
  LINEPAY: '#00B900',
  ECPAY: '#FFD000',
  POINTS: '#9C27B0',
};

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [status, setStatus] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [offset, setOffset] = useState(0);

  const limit = 50;

  async function fetchPayments() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      if (paymentMethod) params.append('paymentMethod', paymentMethod);
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);
      params.append('limit', String(limit));
      params.append('offset', String(offset));

      const res = await fetch(`/api/admin/payments?${params.toString()}`);
      const data = await res.json();

      if (data.ok && data.data) {
        setPayments(data.data.payments);
        setSummary(data.data.summary);
      } else {
        setError(data.message || 'Failed to load payments');
      }
    } catch (err: any) {
      setError(err?.message || 'Error fetching payments');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPayments();
  }, [status, paymentMethod, dateFrom, dateTo, offset]);

  function handleReset() {
    setStatus('');
    setPaymentMethod('');
    setDateFrom('');
    setDateTo('');
    setOffset(0);
  }

  function handleExportCSV() {
    if (!payments || payments.length === 0) {
      alert('No data to export');
      return;
    }

    const headers = ['Order ID', 'User ID', 'Amount', 'Currency', 'Status', 'Payment Method', 'Course Title', 'Created At', 'Updated At'];
    const rows = payments.map(p => [
      p.orderId || '',
      p.userId || '',
      String(p.amount || 0),
      p.currency || 'TWD',
      p.status || '',
      p.paymentMethod || p.method || '',
      p.courseTitle || '',
      p.createdAt || '',
      p.updatedAt || '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `payments_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  }

  return (
    <main style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <button onClick={() => window.history.back()} style={{ marginBottom: 12, padding: '8px 14px', cursor: 'pointer' }}>
          ← 返回
        </button>
        <h1>💳 收款管理 (Payment Management)</h1>
        <p style={{ color: '#666', fontSize: 14 }}>查看所有支付記錄、驗證款項收入、按支付方式分類統計。</p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div style={{ background: '#f0f4ff', padding: 16, borderRadius: 8, border: '1px solid #d0d9f7' }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>總收入</div>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1976d2' }}>
              NT$ {(summary.totalAmount || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
              共 {summary.totalCount} 筆記錄
            </div>
          </div>

          {Object.entries(summary.statusBreakdown || {}).map(([s, data]) => (
            <div key={s} style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, border: '2px solid', borderColor: STATUS_COLORS[s] || '#ddd' }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: STATUS_COLORS[s] || '#ccc', marginRight: 6 }}></span>
                {s}
              </div>
              <div style={{ fontSize: 18, fontWeight: 'bold' }}>{data.count}</div>
              <div style={{ fontSize: 12, color: '#999' }}>NT$ {(data.amount || 0).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ background: '#f9f9f9', padding: 16, borderRadius: 8, marginBottom: 24, border: '1px solid #e0e0e0' }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>篩選條件</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4, fontWeight: 500 }}>狀態</label>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} style={{ width: '100%', padding: '8px', borderRadius: 4, border: '1px solid #ddd' }}>
              <option value="">全部</option>
              <option value="PENDING">待確認 (PENDING)</option>
              <option value="PAID">已付款 (PAID)</option>
              <option value="COMPLETED">已完成 (COMPLETED)</option>
              <option value="REFUNDED">已退款 (REFUNDED)</option>
              <option value="FAILED">失敗 (FAILED)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4, fontWeight: 500 }}>支付方式</label>
            <select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setOffset(0); }} style={{ width: '100%', padding: '8px', borderRadius: 4, border: '1px solid #ddd' }}>
              <option value="">全部</option>
              <option value="stripe">Stripe</option>
              <option value="paypal">PayPal</option>
              <option value="linepay">LINE Pay</option>
              <option value="ecpay">ECPay (綠界)</option>
              <option value="points">點數</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4, fontWeight: 500 }}>起始日期</label>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }} style={{ width: '100%', padding: '8px', borderRadius: 4, border: '1px solid #ddd' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4, fontWeight: 500 }}>結束日期</label>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setOffset(0); }} style={{ width: '100%', padding: '8px', borderRadius: 4, border: '1px solid #ddd' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleReset} style={{ padding: '8px 14px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>
            清除篩選
          </button>
          <button onClick={handleExportCSV} style={{ padding: '8px 14px', background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            📥 匯出 CSV
          </button>
        </div>
      </div>

      {/* Payments Table */}
      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #ddd', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>讀取中…</div>
        ) : error ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#f44336' }}>讀取失敗：{error}</div>
        ) : payments.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>未找到相符的記錄。</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #e0e0e0' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, fontSize: 12 }}>Order ID</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, fontSize: 12 }}>User ID</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, fontSize: 12 }}>金額</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, fontSize: 12 }}>狀態</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, fontSize: 12 }}>支付方式</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, fontSize: 12 }}>課程</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, fontSize: 12 }}>建立時間</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, fontSize: 12 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.orderId} style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer', transition: 'background 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.background = '#fafafa')} onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: 12 }}>
                        {p.orderId?.substring(0, 8)}...
                      </td>
                      <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: 12 }}>
                        {p.userId?.substring(0, 8)}...
                      </td>
                      <td style={{ padding: '12px', fontWeight: 600, color: '#1976d2' }}>
                        NT$ {(p.amount || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            borderRadius: 4,
                            background: STATUS_COLORS[p.status || 'UNKNOWN'],
                            color: '#fff',
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {p.status || 'UNKNOWN'}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            borderRadius: 4,
                            background: METHOD_COLORS[(p.paymentMethod || p.method || 'UNKNOWN').toUpperCase()] || '#ccc',
                            color: '#fff',
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {(p.paymentMethod || p.method || 'UNKNOWN').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '12px', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.courseTitle || '-'}
                      </td>
                      <td style={{ padding: '12px', fontSize: 12, color: '#999' }}>
                        {p.createdAt ? new Date(p.createdAt).toLocaleString() : '-'}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <Link href={`/admin/orders/${p.orderId}`}>
                          <button style={{ padding: '4px 8px', fontSize: 12, background: '#2196F3', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                            查看詳情
                          </button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{ padding: '12px', background: '#f9f9f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e0e0e0' }}>
              <div style={{ fontSize: 12, color: '#666' }}>
                顯示 {offset + 1} 至 {offset + payments.length} 條記錄
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    background: offset === 0 ? '#f0f0f0' : '#2196F3',
                    color: offset === 0 ? '#999' : '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: offset === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  上一頁
                </button>
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={!summary || offset + limit >= summary.totalCount}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    background: !summary || offset + limit >= summary.totalCount ? '#f0f0f0' : '#2196F3',
                    color: !summary || offset + limit >= summary.totalCount ? '#999' : '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: !summary || offset + limit >= summary.totalCount ? 'not-allowed' : 'pointer',
                  }}
                >
                  下一頁
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
