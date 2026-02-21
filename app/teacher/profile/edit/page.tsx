"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser } from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';
import Link from 'next/link';

export default function DedicatedTeacherEditPage() {
    const router = useRouter();
    const t = useT();
    const [teacher, setTeacher] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    // Form fields
    const [name, setName] = useState('');
    const [intro, setIntro] = useState('');
    const [subjects, setSubjects] = useState('');
    const [languages, setLanguages] = useState('');
    const [teacherId, setTeacherId] = useState<string | null>(null);

    useEffect(() => {
        const currentUser = getStoredUser();
        if (!currentUser || currentUser.role !== 'teacher') {
            router.push('/login');
            return;
        }

        const tid = currentUser.teacherId || currentUser.roid_id;
        const fallbackName = `${currentUser.lastName}${currentUser.firstName}`.trim();

        if (!tid) {
            setMessage('無法識別您的老師身分');
            setLoading(false);
            return;
        }
        setTeacherId(tid);

        async function load() {
            try {
                const res = await fetch(`/api/teachers/${tid}`);
                const data = await res.json();

                // If not found, we still allow editing (creating)
                if (data.ok) {
                    const tData = data.teacher;
                    setTeacher(tData);
                    setName(tData.name || fallbackName || '');
                    setIntro(tData.intro || '');
                    setSubjects(tData.subjects?.join(', ') || '');
                    setLanguages(tData.languages?.join(', ') || '');
                } else if (res.status === 404) {
                    // Initialize name from session if profile doesn't exist yet
                    setName(fallbackName);
                    console.log('Profile not found, allowing creation');
                } else {
                    setMessage('找不到您的老師資料');
                }
            } catch (err) {
                setMessage('載入失敗');
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!teacherId) return;
        setSaving(true);
        setMessage(null);

        const payload = {
            name,
            intro,
            subjects: subjects.split(',').map(s => s.trim()).filter(Boolean),
            languages: languages.split(',').map(l => l.trim()).filter(Boolean),
        };

        try {
            const res = await fetch(`/api/teachers/${teacherId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.ok) {
                setMessage('✨ 更新成功！');
            } else {
                setMessage(data.message || '❌ 更新失敗');
            }
        } catch (err) {
            setMessage('❌ 連線失敗');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' }}>
            <div style={{ fontSize: '1.5rem', color: '#4f46e5', fontWeight: 'bold', animation: 'pulse 2s infinite' }}>載入中...</div>
        </div>
    );

    return (
        <main style={{
            minHeight: '100vh',
            padding: '40px 20px',
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
            fontFamily: "'Outfit', 'Inter', sans-serif"
        }}>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>

                <header style={{ marginTop: '32px', marginBottom: '40px', textAlign: 'center' }}>
                    <h1 style={{
                        fontSize: '2.5rem',
                        fontWeight: '800',
                        background: 'linear-gradient(to right, #4f46e5, #9333ea)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        marginBottom: '8px'
                    }}>
                        編輯教學資訊
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '1.1rem' }}>更新您的教學科目、語言與自我介紹</p>
                </header>

                <div style={{
                    background: 'rgba(255, 255, 255, 0.8)',
                    backdropFilter: 'blur(10px)',
                    padding: '40px',
                    borderRadius: '24px',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.5)'
                }}>
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ color: '#1e293b', fontWeight: '600', fontSize: '0.95rem' }}>顯示名稱</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                style={inputStyle}
                                placeholder="您的姓名或暱稱"
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ color: '#1e293b', fontWeight: '600', fontSize: '0.95rem' }}>教學科目 (以逗號隔開)</label>
                                <input
                                    type="text"
                                    value={subjects}
                                    onChange={(e) => setSubjects(e.target.value)}
                                    style={inputStyle}
                                    placeholder="e.g. 英文會話, 雅思寫作"
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ color: '#1e293b', fontWeight: '600', fontSize: '0.95rem' }}>教學語言 (以逗號隔開)</label>
                                <input
                                    type="text"
                                    value={languages}
                                    onChange={(e) => setLanguages(e.target.value)}
                                    style={inputStyle}
                                    placeholder="e.g. 中文, 英文, 日文"
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ color: '#1e293b', fontWeight: '600', fontSize: '0.95rem' }}>自我介紹</label>
                            <textarea
                                value={intro}
                                onChange={(e) => setIntro(e.target.value)}
                                style={{ ...inputStyle, minHeight: '350px', resize: 'none' }}
                                placeholder="詳細描述您的教學背景、獲得過的獎項，或是教學理念。"
                            />
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '16px' }}>
                            <button
                                type="submit"
                                disabled={saving}
                                style={{
                                    padding: '14px 40px',
                                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '16px',
                                    cursor: 'pointer',
                                    fontWeight: '700',
                                    fontSize: '1.1rem',
                                    boxShadow: '0 10px 15px -3px rgba(79, 70, 229, 0.4)',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    opacity: saving ? 0.7 : 1,
                                }}
                            >
                                {saving ? '處理中...' : '儲存變更'}
                            </button>
                            {teacherId && (
                                <Link
                                    href={`/teacher/profile`}
                                    style={{
                                        padding: '14px 40px',
                                        background: '#f1f5f9',
                                        color: '#475569',
                                        borderRadius: '16px',
                                        textDecoration: 'none',
                                        textAlign: 'center',
                                        fontWeight: '600',
                                        fontSize: '1.1rem',
                                        border: '1px solid #e2e8f0'
                                    }}
                                >
                                    取消
                                </Link>
                            )}
                        </div>

                        {message && (
                            <div style={{
                                padding: '16px',
                                borderRadius: '16px',
                                textAlign: 'center',
                                fontWeight: '600',
                                background: message.includes('成功') ? '#ecfdf5' : '#fff1f2',
                                color: message.includes('成功') ? '#059669' : '#e11d48',
                                border: message.includes('成功') ? '1px solid #10b981' : '1px solid #f43f5e',
                                animation: 'slideUp 0.4s ease-out'
                            }}>
                                {message}
                            </div>
                        )}
                    </form>
                </div>
            </div>

            <style jsx>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
        </main>
    );
}

const inputStyle: React.CSSProperties = {
    padding: '14px 18px',
    borderRadius: '14px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    fontSize: '1rem',
    color: '#1e293b',
    outline: 'none',
    boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
};
