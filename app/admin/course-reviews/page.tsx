"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser } from '@/lib/mockAuth';
import Button from '@/components/UI/Button';

export default function CourseReviewsPage() {
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
            const res = await fetch('/api/admin/course-reviews');
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
        if (!confirm(`確定要 ${action === 'approve' ? '核准' : '退回'} 此課程申請嗎？`)) return;

        setProcessingId(id);
        setError(null);
        try {
            const res = await fetch(`/api/admin/course-reviews/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });
            const data = await res.json();

            if (data.ok) {
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
                <div style={{ fontSize: '1.5rem', color: '#4f46e5', fontWeight: 'bold' }}>載入中...</div>
            </div>
        );
    }

    return (
        <main style={{ minHeight: '100vh', padding: '40px 20px', background: '#f8fafc', fontFamily: "'Outfit', 'Inter', sans-serif" }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                <header style={{ marginBottom: '40px' }}>
                    <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#1e293b' }}>
                        課程上架/下架審核
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '1.1rem', marginTop: '8px' }}>
                        查看並核准教師提交的課程狀態變更申請
                    </p>
                </header>

                {error && (
                    <div style={{ padding: '16px', background: '#fef2f2', color: '#991b1b', borderRadius: '8px', marginBottom: '24px', border: '1px solid #f87171' }}>
                        {error}
                    </div>
                )}

                {reviews.length === 0 ? (
                    <div style={{ background: '#fff', padding: '48px', borderRadius: '16px', textAlign: 'center', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                        <p style={{ fontSize: '1.2rem', color: '#64748b' }}>目前沒有待審核的課程申請 🙌</p>
                        <button
                            onClick={fetchReviews}
                            style={{ marginTop: '16px', color: '#4f46e5', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                            重新整理
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {reviews.map(course => (
                            <div key={course.id} style={{
                                background: '#fff',
                                padding: '32px',
                                borderRadius: '16px',
                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                border: '1px solid #e2e8f0'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                    <div>
                                        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>
                                            {course.title}
                                        </h2>
                                        <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px' }}>
                                            教師: {course.teacherName || '未知'} | ID: {course.id}
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <Button
                                            variant="outline"
                                            onClick={() => handleAction(course.id, 'reject')}
                                            disabled={processingId === course.id}
                                            style={{ borderColor: '#ef4444', color: '#ef4444' }}
                                        >
                                            {processingId === course.id ? '處理中' : '退回'}
                                        </Button>
                                        <Button
                                            variant="primary"
                                            onClick={() => handleAction(course.id, 'approve')}
                                            disabled={processingId === course.id}
                                            style={{ background: '#10b981' }}
                                        >
                                            {processingId === course.id ? '處理中' : '核准'}
                                        </Button>
                                    </div>
                                </div>

                                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', gap: '20px' }}>
                                    <div>
                                        <span style={labelStyle}>目前狀態</span>
                                        <div style={{ ...statusBadgeStyle, background: course.status === '待審核' ? '#f1f5f9' : (course.status === '上架' ? '#dcfce7' : '#fee2e2'), color: course.status === '待審核' ? '#64748b' : (course.status === '上架' ? '#166534' : '#991b1b') }}>
                                            {course.status}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '1.5rem', color: '#94a3b8' }}>→</div>
                                    <div>
                                        <span style={labelStyle}>申請變更為</span>
                                        <div style={{ ...statusBadgeStyle, background: course.reviewRequestedStatus === '上架' ? '#dcfce7' : '#fee2e2', color: course.reviewRequestedStatus === '上架' ? '#166534' : '#991b1b', fontWeight: '700', border: '2px solid' }}>
                                            {course.reviewRequestedStatus}
                                        </div>
                                    </div>
                                </div>

                                {course.description && (
                                    <div style={{ marginTop: '16px' }}>
                                        <span style={labelStyle}>課程描述</span>
                                        <p style={{ fontSize: '0.9rem', color: '#475569', margin: '4px 0 0 0', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                            {course.description}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
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

const statusBadgeStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '6px 16px',
    borderRadius: '20px',
    fontSize: '0.9rem',
    textAlign: 'center'
};
