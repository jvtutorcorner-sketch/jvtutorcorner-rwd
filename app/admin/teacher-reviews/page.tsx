"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser } from '@/lib/mockAuth';
import Button from '@/components/UI/Button';

export default function TeacherReviewsPage() {
    const router = useRouter();
    const [reviews, setReviews] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const user = getStoredUser();
        if (!user || user.role !== 'admin') {
            router.push('/login');
            return;
        }
        fetchReviews();
    }, [router]);

    const fetchReviews = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/teacher-reviews');
            const data = await res.json();
            if (data.ok) {
                setReviews(data.reviews);
            } else {
                setError(data.message || 'Failed to fetch reviews');
            }
        } catch (err) {
            setError('Failed to connect to server');
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (id: string, action: 'approve' | 'reject') => {
        if (!confirm(`Are you sure you want to ${action === 'approve' ? '核准 (Approve)' : '退回 (Reject)'} this request?`)) return;

        setProcessingId(id);
        setError(null);
        try {
            const res = await fetch(`/api/admin/teacher-reviews/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });
            const data = await res.json();

            if (data.ok) {
                // Remove the processed review from the list
                setReviews(prev => prev.filter(r => r.id !== id));
            } else {
                setError(data.message || `Failed to ${action} request`);
            }
        } catch (err) {
            setError(`Failed to connect to server`);
        } finally {
            setProcessingId(null);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
                <div style={{ fontSize: '1.5rem', color: '#4f46e5', fontWeight: 'bold', animation: 'pulse 2s infinite' }}>載入中...</div>
            </div>
        );
    }

    return (
        <main style={{ minHeight: '100vh', padding: '40px 20px', background: '#f8fafc', fontFamily: "'Outfit', 'Inter', sans-serif" }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                <header style={{ marginTop: '32px', marginBottom: '40px' }}>
                    <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#1e293b' }}>
                        老師教學資訊變更審核
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '1.1rem', marginTop: '8px' }}>
                        查看並核准老師提交的個人檔案修改申請
                    </p>
                </header>

                {error && (
                    <div style={{ padding: '16px', background: '#fef2f2', color: '#991b1b', borderRadius: '8px', marginBottom: '24px', border: '1px solid #f87171' }}>
                        {error}
                    </div>
                )}

                {reviews.length === 0 ? (
                    <div style={{ background: '#fff', padding: '48px', borderRadius: '16px', textAlign: 'center', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                        <p style={{ fontSize: '1.2rem', color: '#64748b' }}>目前沒有待審核的變更申請 🙌</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {reviews.map(teacher => {
                            const changes = teacher.pendingProfileChanges || {};
                            const requestDate = changes.requestedAt ? new Date(changes.requestedAt).toLocaleString() : '未知時間';

                            return (
                                <div key={teacher.id} style={{
                                    background: '#fff',
                                    padding: '32px',
                                    borderRadius: '16px',
                                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                                    border: '1px solid #e2e8f0'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
                                        <div>
                                            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>
                                                {teacher.name || teacher.id} 的修改申請
                                            </h2>
                                            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '4px' }}>
                                                申請時間: {requestDate}
                                            </p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            <Button
                                                variant="outline"
                                                onClick={() => handleAction(teacher.id, 'reject')}
                                                disabled={processingId === teacher.id}
                                                style={{ borderColor: '#ef4444', color: '#ef4444' }}
                                            >
                                                {processingId === teacher.id ? '處理中...' : '退回 (Reject)'}
                                            </Button>
                                            <Button
                                                variant="primary"
                                                onClick={() => handleAction(teacher.id, 'approve')}
                                                disabled={processingId === teacher.id}
                                                style={{ background: '#10b981' }}
                                            >
                                                {processingId === teacher.id ? '處理中...' : '核准 (Approve)'}
                                            </Button>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '32px' }}>
                                        {/* Original */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                原始資料
                                            </h3>

                                            {changes.name !== undefined && (
                                                <div>
                                                    <span style={labelStyle}>名稱:</span>
                                                    <div style={valueStyle}>{teacher.name || '-'}</div>
                                                </div>
                                            )}

                                            {changes.subjects !== undefined && (
                                                <div>
                                                    <span style={labelStyle}>科目:</span>
                                                    <div style={valueStyle}>{teacher.subjects?.join(', ') || '-'}</div>
                                                </div>
                                            )}

                                            {changes.languages !== undefined && (
                                                <div>
                                                    <span style={labelStyle}>語言:</span>
                                                    <div style={valueStyle}>{teacher.languages?.join(', ') || '-'}</div>
                                                </div>
                                            )}

                                            {changes.intro !== undefined && (
                                                <div>
                                                    <span style={labelStyle}>自我介紹:</span>
                                                    <div style={{ ...valueStyle, whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto' }}>{teacher.intro || '-'}</div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Requested Changes */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingLeft: '32px', borderLeft: '1px solid #e2e8f0' }}>
                                            <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                申請修改為
                                            </h3>

                                            {changes.name !== undefined && (
                                                <div>
                                                    <span style={labelStyle}>名稱:</span>
                                                    <div style={newValueStyle}>{changes.name}</div>
                                                </div>
                                            )}

                                            {changes.subjects !== undefined && (
                                                <div>
                                                    <span style={labelStyle}>科目:</span>
                                                    <div style={newValueStyle}>{changes.subjects.join(', ')}</div>
                                                </div>
                                            )}

                                            {changes.languages !== undefined && (
                                                <div>
                                                    <span style={labelStyle}>語言:</span>
                                                    <div style={newValueStyle}>{changes.languages.join(', ')}</div>
                                                </div>
                                            )}

                                            {changes.intro !== undefined && (
                                                <div>
                                                    <span style={labelStyle}>自我介紹:</span>
                                                    <div style={{ ...newValueStyle, whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto' }}>{changes.intro}</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            <style jsx>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
        </main>
    );
}

const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: '4px'
};

const valueStyle: React.CSSProperties = {
    fontSize: '0.95rem',
    color: '#475569',
    background: '#f8fafc',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #e2e8f0'
};

const newValueStyle: React.CSSProperties = {
    fontSize: '0.95rem',
    color: '#1e40af',
    background: '#eff6ff',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #bfdbfe'
};
