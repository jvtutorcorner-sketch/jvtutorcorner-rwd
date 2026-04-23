"use client";

import { useEffect, useState } from "react";

type EscrowRecord = {
  escrowId: string;
  orderId: string;
  enrollmentId: string;
  studentId: string;
  teacherId: string;
  courseId: string;
  courseTitle: string;
  points: number;
  status: 'HOLDING' | 'RELEASED' | 'REFUNDED';
  createdAt: string;
  updatedAt: string;
  releasedAt?: string;
  refundedAt?: string;
};

interface TeacherEscrowManagerProps {
  teacherId?: string;
}

export default function TeacherEscrowManager({ teacherId }: TeacherEscrowManagerProps) {
  const [escrows, setEscrows] = useState<EscrowRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'RELEASED' | 'HOLDING' | 'REFUNDED' | 'ALL'>('RELEASED');
  const [totalPoints, setTotalPoints] = useState<number>(0);
  const [expandedEscrowId, setExpandedEscrowId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (teacherId) {
        q.set('teacherId', teacherId);
      }
      if (filterStatus !== 'ALL') {
        q.set('status', filterStatus);
      }

      const res = await fetch(`/api/points-escrow?${q.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load escrow records');
      
      const records = data.data || [];
      setEscrows(records);
      
      // Calculate total points for RELEASED records
      const total = records
        .filter((r: EscrowRecord) => r.status === 'RELEASED')
        .reduce((sum: number, r: EscrowRecord) => sum + r.points, 0);
      setTotalPoints(total);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [filterStatus, teacherId]);

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Taipei',
      });
    } catch {
      return dateString;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RELEASED':
        return '#4caf50'; // Green
      case 'HOLDING':
        return '#ff9800'; // Orange
      case 'REFUNDED':
        return '#f44336'; // Red
      default:
        return '#999';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'RELEASED':
        return '已釋放';
      case 'HOLDING':
        return '暫存中';
      case 'REFUNDED':
        return '已退款';
      default:
        return status;
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      {error && (
        <div style={{ color: '#d32f2f', padding: '10px', marginBottom: '20px', backgroundColor: '#ffebee', borderRadius: '4px' }}>
          ❌ {error}
        </div>
      )}

      {/* Filter Section */}
      <div style={{ marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '14px', fontWeight: 'bold' }}>狀態篩選</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '150px' }}
          >
            <option value="RELEASED">已釋放</option>
            <option value="HOLDING">暫存中</option>
            <option value="REFUNDED">已退款</option>
            <option value="ALL">全部</option>
          </select>
        </div>
      </div>

      {/* Summary Section */}
      {filterStatus === 'RELEASED' && !loading && (
        <div style={{
          padding: '15px',
          marginBottom: '20px',
          backgroundColor: '#c8e6c9',
          borderLeft: '4px solid #4caf50',
          borderRadius: '4px'
        }}>
          <strong>💰 老師已收到點數總計：</strong> <span style={{ fontSize: '20px', color: '#2e7d32', fontWeight: 'bold' }}>{totalPoints}</span> 點
        </div>
      )}

      {/* Loading State */}
      {loading && <p>加載中...</p>}

      {/* Empty State */}
      {!loading && escrows.length === 0 && (
        <p style={{ color: '#999', textAlign: 'center', padding: '40px' }}>
          {filterStatus === 'RELEASED' ? '尚無老師點數記錄' : '尚無該狀態的記錄'}
        </p>
      )}

      {/* Records Table - Simplified */}
      {!loading && escrows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', border: '2px solid #ccc', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>操作</th>
                <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'center' }}>點數</th>
                <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'center' }}>狀態</th>
                <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>釋放時間</th>
              </tr>
            </thead>
            <tbody>
              {escrows.map((record) => (
                <tr
                  key={record.escrowId}
                  style={{
                    borderBottom: '2px solid #ccc',
                    backgroundColor: expandedEscrowId === record.escrowId ? '#f9f9f9' : 'white',
                  }}
                >
                  <td style={{ border: '2px solid #ccc', padding: '8px' }}>
                    <button
                      onClick={() =>
                        setExpandedEscrowId(
                          expandedEscrowId === record.escrowId ? null : record.escrowId
                        )
                      }
                      style={{
                        padding: '5px 10px',
                        backgroundColor: '#2196f3',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      {expandedEscrowId === record.escrowId ? '收起' : '詳情'}
                    </button>
                  </td>
                  <td style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'center', fontWeight: 'bold', color: '#2e7d32' }}>
                    +{record.points}
                  </td>
                  <td style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'center' }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        backgroundColor: getStatusColor(record.status),
                        color: 'white',
                        borderRadius: '3px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}
                    >
                      {getStatusLabel(record.status)}
                    </span>
                  </td>
                  <td style={{ border: '2px solid #ccc', padding: '8px', fontSize: '12px' }}>
                    {record.releasedAt ? formatDate(record.releasedAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Expanded Details Section */}
      {expandedEscrowId && escrows.find((e) => e.escrowId === expandedEscrowId) && (
        <div
          style={{
            marginTop: '20px',
            padding: '15px',
            backgroundColor: '#f9f9f9',
            border: '1px solid #ddd',
            borderRadius: '4px',
          }}
        >
          <h3>詳細資訊</h3>
          {(() => {
            const record = escrows.find((e) => e.escrowId === expandedEscrowId)!;
            return (
              <table style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '8px', fontWeight: 'bold', width: '150px' }}>Escrow ID:</td>
                    <td style={{ padding: '8px', fontFamily: 'monospace' }}>{record.escrowId}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>訂單 ID:</td>
                    <td style={{ padding: '8px', fontFamily: 'monospace' }}>{record.orderId}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>課程 ID:</td>
                    <td style={{ padding: '8px', fontFamily: 'monospace' }}>{record.courseId}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>課程名稱:</td>
                    <td style={{ padding: '8px' }}>{record.courseTitle}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>點數:</td>
                    <td style={{ padding: '8px', fontWeight: 'bold', color: '#2e7d32' }}>+{record.points}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>狀態:</td>
                    <td style={{ padding: '8px' }}>
                      <span
                        style={{
                          padding: '4px 8px',
                          backgroundColor: getStatusColor(record.status),
                          color: 'white',
                          borderRadius: '3px',
                          fontWeight: 'bold',
                        }}
                      >
                        {getStatusLabel(record.status)}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>建立時間:</td>
                    <td style={{ padding: '8px' }}>{formatDate(record.createdAt)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>釋放時間:</td>
                    <td style={{ padding: '8px' }}>
                      {record.releasedAt ? formatDate(record.releasedAt) : '—'}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>退款時間:</td>
                    <td style={{ padding: '8px' }}>
                      {record.refundedAt ? formatDate(record.refundedAt) : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            );
          })()}
        </div>
      )}
    </div>
  );
}
