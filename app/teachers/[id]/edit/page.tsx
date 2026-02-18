"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getStoredUser } from '@/lib/mockAuth';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { useT } from '@/components/IntlProvider';
import Link from 'next/link';

export default function TeacherEditPage() {
    const { id } = useParams();
    const router = useRouter();
    const t = useT();
    const [teacher, setTeacher] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    // Form fields
    const [intro, setIntro] = useState('');
    const [subjects, setSubjects] = useState('');
    const [languages, setLanguages] = useState('');

    useEffect(() => {
        const user = getStoredUser();
        // In a real app, we'd verify the user ID matches the teacher ID via auth session
        if (!user || user.role !== 'teacher') {
            router.push('/login');
            return;
        }

        async function load() {
            try {
                const res = await fetch(`/api/teachers/${id}`);
                const data = await res.json();
                if (data.ok) {
                    setTeacher(data.teacher);
                    setIntro(data.teacher.intro || '');
                    setSubjects(data.teacher.subjects?.join(', ') || '');
                    setLanguages(data.teacher.languages?.join(', ') || '');
                } else {
                    setMessage('找不到老師資料');
                }
            } catch (err) {
                setMessage('載入失敗');
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [id, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);

        const payload = {
            intro,
            subjects: subjects.split(',').map(s => s.trim()).filter(Boolean),
            languages: languages.split(',').map(l => l.trim()).filter(Boolean),
        };

        try {
            const res = await fetch(`/api/teachers/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.ok) {
                setMessage('更新成功！');
                router.push(`/teachers/${id}`);
            } else {
                setMessage(data.message || '更新失敗');
            }
        } catch (err) {
            setMessage('連線失敗');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div style={{ padding: 48, textAlign: 'center' }}>載入中...</div>;

    return (
        <main style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
            <PageBreadcrumb />
            <h1 style={{ marginTop: '24px', marginBottom: '24px' }}>編輯老師個人檔案</h1>

            <div className="card" style={{ background: '#fff', padding: '24px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontWeight: 'bold' }}>自我介紹 (Intro)</label>
                        <textarea
                            value={intro}
                            onChange={(e) => setIntro(e.target.value)}
                            style={{ minHeight: '200px', padding: '12px', borderRadius: '4px', border: '1px solid #ccc' }}
                            placeholder="介紹您的教學經驗、專長與特色..."
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontWeight: 'bold' }}>教學科目 (Subjects, 以逗號隔開)</label>
                        <input
                            type="text"
                            value={subjects}
                            onChange={(e) => setSubjects(e.target.value)}
                            style={{ padding: '12px', borderRadius: '4px', border: '1px solid #ccc' }}
                            placeholder="e.g. 英文, 雅思, 口說"
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontWeight: 'bold' }}>教學語言 (Languages, 以逗號隔開)</label>
                        <input
                            type="text"
                            value={languages}
                            onChange={(e) => setLanguages(e.target.value)}
                            style={{ padding: '12px', borderRadius: '4px', border: '1px solid #ccc' }}
                            placeholder="e.g. 中文, 英文, 日文"
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
                        <button
                            type="submit"
                            disabled={saving}
                            style={{
                                padding: '12px 24px',
                                background: '#4f46e5',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: 'bold'
                            }}
                        >
                            {saving ? '儲存中...' : '儲存變更'}
                        </button>
                        <Link
                            href={`/teachers/${id}`}
                            style={{
                                padding: '12px 24px',
                                background: '#f3f4f6',
                                color: '#374151',
                                borderRadius: '6px',
                                textDecoration: 'none',
                                textAlign: 'center'
                            }}
                        >
                            取消
                        </Link>
                    </div>

                    {message && (
                        <p style={{
                            marginTop: '16px',
                            padding: '12px',
                            borderRadius: '4px',
                            background: message.includes('成功') ? '#d1fae5' : '#fee2e2',
                            color: message.includes('成功') ? '#065f46' : '#991b1b'
                        }}>
                            {message}
                        </p>
                    )}
                </form>
            </div>
        </main>
    );
}
