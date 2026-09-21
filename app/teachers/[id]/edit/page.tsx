"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getStoredUser } from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';
import Link from 'next/link';

export default function TeacherEditPage() {
    const { id } = useParams();
    const router = useRouter();
    const t = useT();
    const [teacher, setTeacher] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    // 明確的成功狀態：原本靠 messageOk 判斷樣式，訊息翻成英文後永遠不成立。
    const [message, setMessage] = useState<string | null>(null);
    const [messageOk, setMessageOk] = useState(false);
    const notify = (text: string, ok = false) => { setMessage(text); setMessageOk(ok); };

    // Form fields
    const [name, setName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [hourlyRate, setHourlyRate] = useState<number>(0);
    const [location, setLocation] = useState('');
    const [intro, setIntro] = useState('');
    const [subjects, setSubjects] = useState('');
    const [languages, setLanguages] = useState('');

    useEffect(() => {
        const user = getStoredUser();
        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            router.push('/login');
            return;
        }

        async function load() {
            try {
                const res = await fetch(`/api/teachers/${id}`);
                const data = await res.json();
                if (data.ok) {
                    const t = data.teacher;
                    setTeacher(t);
                    setName(t.name || '');
                    setAvatarUrl(t.avatarUrl || '');
                    setHourlyRate(t.hourlyRate || 0);
                    setLocation(t.location || '');
                    setIntro(t.intro || '');
                    setSubjects(t.subjects?.join(', ') || '');
                    setLanguages(t.languages?.join(', ') || '');
                } else {
                    notify(t('teacher_edit_msg_not_found'));
                }
            } catch (err) {
                notify(t('teacher_profile_edit_msg_load_failed'));
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
            name,
            avatarUrl,
            hourlyRate: Number(hourlyRate),
            location,
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
                notify(t('teacher_edit_msg_success'), true);
                setTimeout(() => router.push(`/teachers/${id}`), 1500);
            } else {
                notify(data.message || t('teacher_edit_msg_failed'));
            }
        } catch (err) {
            notify(t('teacher_profile_edit_msg_network_failed'));
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' }}>
            <div style={{ fontSize: '1.5rem', color: '#4f46e5', fontWeight: 'bold', animation: 'pulse 2s infinite' }}>{t('loading')}</div>
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

                <header style={{ marginTop: '32px', marginBottom: '40px', textAlign: 'center' }}>
                    <h1 style={{
                        fontSize: '2.5rem',
                        fontWeight: '800',
                        background: 'linear-gradient(to right, #4f46e5, #9333ea)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        marginBottom: '8px'
                    }}>
                        {t('teacher_edit_title')}
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '1.1rem' }}>{t('teacher_edit_subtitle')}</p>
                </header>

                <div style={{
                    background: 'rgba(255, 255, 255, 0.8)',
                    backdropFilter: 'blur(10px)',
                    padding: '40px',
                    borderRadius: '24px',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.5)'
                }}>
                    <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>

                        {/* Left Column: Basic Info */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ color: '#1e293b', fontWeight: '600', fontSize: '0.95rem' }}>{t('teacher_profile_edit_display_name')}</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    style={inputStyle}
                                    placeholder={t('teacher_profile_edit_display_name_placeholder')}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ color: '#1e293b', fontWeight: '600', fontSize: '0.95rem' }}>{t('teacher_edit_avatar_url')}</label>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <img
                                        src={avatarUrl || 'https://avatars.githubusercontent.com/u/1?v=4'}
                                        alt="Preview"
                                        style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0' }}
                                    />
                                    <input
                                        type="text"
                                        value={avatarUrl}
                                        onChange={(e) => setAvatarUrl(e.target.value)}
                                        style={{ ...inputStyle, flex: 1 }}
                                        placeholder="https://..."
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ color: '#1e293b', fontWeight: '600', fontSize: '0.95rem' }}>{t('teacher_edit_hourly_rate')}</label>
                                    <input
                                        type="number"
                                        value={hourlyRate}
                                        onChange={(e) => setHourlyRate(parseInt(e.target.value) || 0)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ color: '#1e293b', fontWeight: '600', fontSize: '0.95rem' }}>{t('teacher_edit_location')}</label>
                                    <input
                                        type="text"
                                        value={location}
                                        onChange={(e) => setLocation(e.target.value)}
                                        style={inputStyle}
                                        placeholder={t('teacher_edit_location_placeholder')}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ color: '#1e293b', fontWeight: '600', fontSize: '0.95rem' }}>{t('teacher_profile_edit_subjects')}</label>
                                <input
                                    type="text"
                                    value={subjects}
                                    onChange={(e) => setSubjects(e.target.value)}
                                    style={inputStyle}
                                    placeholder={t('teacher_profile_edit_subjects_placeholder')}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ color: '#1e293b', fontWeight: '600', fontSize: '0.95rem' }}>{t('teacher_profile_edit_languages')}</label>
                                <input
                                    type="text"
                                    value={languages}
                                    onChange={(e) => setLanguages(e.target.value)}
                                    style={inputStyle}
                                    placeholder={t('teacher_profile_edit_languages_placeholder')}
                                />
                            </div>
                        </div>

                        {/* Right Column: Intro */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                                <label style={{ color: '#1e293b', fontWeight: '600', fontSize: '0.95rem' }}>{t('teacher_profile_edit_intro')}</label>
                                <textarea
                                    value={intro}
                                    onChange={(e) => setIntro(e.target.value)}
                                    style={{ ...inputStyle, minHeight: '350px', resize: 'none' }}
                                    placeholder={t('teacher_edit_intro_placeholder_long')}
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '16px' }}>
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
                                    transform: saving ? 'scale(0.98)' : 'scale(1)',
                                }}
                                onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)'}
                                onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0) scale(1)'}
                            >
                                {saving ? t('teacher_edit_saving') : t('teacher_edit_save')}
                            </button>
                            <Link
                                href={`/teachers/${id}`}
                                style={{
                                    padding: '14px 40px',
                                    background: '#f1f5f9',
                                    color: '#475569',
                                    borderRadius: '16px',
                                    textDecoration: 'none',
                                    textAlign: 'center',
                                    fontWeight: '600',
                                    fontSize: '1.1rem',
                                    border: '1px solid #e2e8f0',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.background = '#e2e8f0'}
                                onMouseOut={(e) => e.currentTarget.style.background = '#f1f5f9'}
                            >
                                {t('teacher_profile_edit_cancel')}
                            </Link>
                        </div>

                        {message && (
                            <div style={{
                                gridColumn: 'span 2',
                                padding: '16px',
                                borderRadius: '16px',
                                textAlign: 'center',
                                fontWeight: '600',
                                background: messageOk ? '#ecfdf5' : '#fff1f2',
                                color: messageOk ? '#059669' : '#e11d48',
                                border: messageOk ? '1px solid #10b981' : '1px solid #f43f5e',
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
    transition: 'all 0.2s ease',
    outline: 'none',
    boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
};
