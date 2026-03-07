"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser } from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';
import Link from 'next/link';

export default function TeacherProfilePage() {
    const router = useRouter();
    const t = useT();
    const [teacher, setTeacher] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const storedUser = getStoredUser();
        if (!storedUser || storedUser.role !== 'teacher') {
            router.push('/login');
            return;
        }

        const userEmail = storedUser.email;

        async function load() {
            try {
                // Fetch latest profile from server to ensure teacherId is up-to-date
                const pRes = await fetch(`/api/profile?email=${encodeURIComponent(userEmail)}`);
                const pData = await pRes.json();

                const effectiveProfile = pData.ok ? pData.profile : storedUser;
                const tid = effectiveProfile.teacherId || effectiveProfile.roid_id;

                if (!tid) {
                    setError('無法識別您的老師身分');
                    setLoading(false);
                    return;
                }

                const res = await fetch(`/api/teachers/${tid}`);
                const data = await res.json();
                if (data.ok) {
                    setTeacher(data.teacher);
                } else {
                    setError('找不到您的老師資料');
                }
            } catch (err) {
                setError('載入失敗');
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [router]);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' }}>
            <div style={{ fontSize: '1.5rem', color: '#4f46e5', fontWeight: 'bold', animation: 'pulse 2s infinite' }}>載入中...</div>
        </div>
    );

    if (error) return (
        <div style={{ padding: '48px', textAlign: 'center' }}>
            <h2 style={{ color: '#ef4444' }}>{error}</h2>
            <Link href="/" style={{ color: '#4f46e5', marginTop: '16px', display: 'inline-block' }}>回到首頁</Link>
        </div>
    );

    return (
        <main style={{
            minHeight: '100vh',
            padding: '40px 20px',
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
            fontFamily: "'Outfit', 'Inter', sans-serif"
        }}>
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>

                <header style={{ marginTop: '32px', marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                        <h1 style={{
                            fontSize: '2.5rem',
                            fontWeight: '800',
                            background: 'linear-gradient(to right, #4f46e5, #9333ea)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            marginBottom: '8px'
                        }}>
                            個人檔案
                        </h1>
                        <p style={{ color: '#64748b', fontSize: '1.1rem' }}>這是您的公開教學資訊，您可以隨時進行修改。</p>
                    </div>
                    <Link
                        href="/teacher/profile/edit"
                        style={{
                            padding: '12px 32px',
                            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                            color: '#fff',
                            borderRadius: '16px',
                            textDecoration: 'none',
                            fontWeight: '700',
                            boxShadow: '0 10px 15px -3px rgba(79, 70, 229, 0.4)',
                            transition: 'transform 0.2s ease'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                        onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                        編輯個人檔案
                    </Link>
                </header>

                <div style={{
                    background: 'rgba(255, 255, 255, 0.8)',
                    backdropFilter: 'blur(10px)',
                    padding: '40px',
                    borderRadius: '24px',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.5)',
                    display: 'grid',
                    gridTemplateColumns: '250px 1fr',
                    gap: '40px'
                }}>
                    {/* Sidebar: Avatar & Basic Stats */}
                    <aside style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
                        <img
                            src={teacher.avatarUrl || 'https://avatars.githubusercontent.com/u/1?v=4'}
                            alt={teacher.name}
                            style={{ width: '200px', height: '200px', borderRadius: '50%', objectFit: 'cover', border: '4px solid #fff', boxShadow: '0 8px 16px rgba(0,0,0,0.1)' }}
                        />
                        <div style={{ textAlign: 'center' }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b' }}>{teacher.name}</h2>
                            <p style={{ color: '#64748b', marginTop: '4px' }}>📍 {teacher.location || '線上'}</p>
                        </div>

                        <div style={{ width: '100%', background: '#f8fafc', padding: '16px', borderRadius: '16px' }}>
                            <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '4px' }}>預期時薪</p>
                            <p style={{ fontSize: '1.25rem', fontWeight: '700', color: '#10b981' }}>NT$ {teacher.hourlyRate || 0} / hr</p>
                        </div>
                    </aside>

                    {/* Main Content */}
                    <section style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                        <div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>教學科目</h3>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {(teacher.subjects || []).map((s: string) => (
                                    <span key={s} style={{ background: '#eef2ff', color: '#4f46e5', padding: '6px 16px', borderRadius: '12px', fontWeight: '600', fontSize: '0.9rem' }}>{s}</span>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>教學語言</h3>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {(teacher.languages || []).map((l: string) => (
                                    <span key={l} style={{ background: '#f0fdf4', color: '#16a34a', padding: '6px 16px', borderRadius: '12px', fontWeight: '600', fontSize: '0.9rem' }}>{l}</span>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>自我介紹</h3>
                            <p style={{ color: '#475569', lineHeight: '1.8', whiteSpace: 'pre-line' }}>{teacher.intro || '暫無介紹'}</p>
                        </div>
                    </section>
                </div>
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
