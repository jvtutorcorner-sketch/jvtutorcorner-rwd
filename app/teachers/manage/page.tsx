"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser } from '@/lib/mockAuth';
import Link from 'next/link';

export default function TeacherManagementPage() {
    const router = useRouter();
    const [teachers, setTeachers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Track which rows are in edit mode (showing dropdown)
    const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
    // Track modifications: { [id]: { status: string } }
    const [modifications, setModifications] = useState<Record<string, { status: string }>>({});

    useEffect(() => {
        const user = getStoredUser();
        // Allow admin or maybe teachers themselves if they have permission, 
        // but typically management is for admins.
        if (!user || user.role !== 'admin') {
            router.push('/login');
            return;
        }
        fetchTeachers();
    }, [router]);

    const fetchTeachers = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/teachers');
            if (response.ok) {
                const data = await response.json();
                setTeachers(data.teachers || []);
            } else {
                setError('無法獲取老師列表');
            }
        } catch (err) {
            setError('連線失敗');
        } finally {
            setLoading(false);
        }
    };

    const toggleEditMode = (id: string) => {
        setEditingIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleStatusChange = (id: string, newStatus: string) => {
        const originalTeacher = teachers.find(t => t.id === id);
        if (!originalTeacher) return;

        setModifications(prev => {
            const next = { ...prev };
            // Check against original baseline
            if ((originalTeacher.status || 'active') === newStatus) {
                delete next[id];
            } else {
                next[id] = { status: newStatus };
            }
            return next;
        });
    };

    const saveChanges = async () => {
        setSaving(true);
        setError(null);
        try {
            const promises = Object.entries(modifications).map(([id, data]) =>
                fetch(`/api/teachers/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                }).then(res => res.json())
            );

            const results = await Promise.all(promises);
            const failed = results.filter(r => !r.ok);

            if (failed.length > 0) {
                setError(`有 ${failed.length} 筆資料更新失敗`);
            } else {
                // Success: update local state and clear modifications
                setTeachers(prev => prev.map(t => {
                    if (modifications[t.id]) {
                        return { ...t, ...modifications[t.id] };
                    }
                    return t;
                }));
                setModifications({});
                setEditingIds(new Set()); // Exit all edit modes
                alert('✨ 所有變更已儲存！');
            }
        } catch (err) {
            setError('儲存失敗，請檢查網路連線');
        } finally {
            setSaving(false);
        }
    };

    const hasChanges = Object.keys(modifications).length > 0;

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
                <div style={{ fontSize: '1.5rem', color: '#4f46e5', fontWeight: 'bold' }}>載入中...</div>
            </div>
        );
    }

    return (
        <main style={{
            minHeight: '100vh',
            padding: '40px 20px',
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
            fontFamily: "'Outfit', 'Inter', sans-serif"
        }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <header style={{
                    marginBottom: '40px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end'
                }}>
                    <div>
                        <h1 style={{
                            fontSize: '2.5rem',
                            fontWeight: '800',
                            background: 'linear-gradient(to right, #4f46e5, #9333ea)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            margin: 0
                        }}>
                            教師在職狀態管理
                        </h1>
                        <p style={{ color: '#64748b', fontSize: '1.1rem', marginTop: '8px' }}>
                            管理平台所有老師的在職與離職狀態
                        </p>
                    </div>

                    <button
                        onClick={saveChanges}
                        disabled={!hasChanges || saving}
                        style={{
                            padding: '12px 32px',
                            borderRadius: '16px',
                            background: hasChanges ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' : '#e2e8f0',
                            color: hasChanges ? '#fff' : '#94a3b8',
                            border: 'none',
                            fontWeight: '700',
                            fontSize: '1rem',
                            cursor: hasChanges ? 'pointer' : 'not-allowed',
                            boxShadow: hasChanges ? '0 10px 15px -3px rgba(79, 70, 229, 0.4)' : 'none',
                            transition: 'all 0.3s ease',
                            opacity: saving ? 0.7 : 1
                        }}
                    >
                        {saving ? '儲存中...' : '儲存變更'}
                    </button>
                </header>

                {error && (
                    <div style={{
                        padding: '16px',
                        background: '#fef2f2',
                        color: '#991b1b',
                        borderRadius: '12px',
                        marginBottom: '24px',
                        border: '1px solid #f87171'
                    }}>
                        {error}
                    </div>
                )}

                <div style={{
                    background: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: '24px',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.5)',
                    overflow: 'hidden'
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #e2e8f0', background: 'rgba(248, 250, 252, 0.5)' }}>
                                <th style={{ padding: '20px', color: '#475569', fontWeight: '600' }}>老師</th>
                                <th style={{ padding: '20px', color: '#475569', fontWeight: '600' }}>科目</th>
                                <th style={{ padding: '20px', color: '#475569', fontWeight: '600' }}>當前狀態</th>
                                <th style={{ padding: '20px', color: '#475569', fontWeight: '600', textAlign: 'center' }}>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {teachers.map((teacher) => {
                                const currentStatus = modifications[teacher.id]?.status || teacher.status || 'active';
                                const isModified = !!modifications[teacher.id];
                                const isEditing = editingIds.has(teacher.id);

                                return (
                                    <tr key={teacher.id} style={{
                                        borderBottom: '1px solid #f1f5f9',
                                        transition: 'background 0.2s ease',
                                        background: isModified ? 'rgba(79, 70, 229, 0.05)' : 'transparent'
                                    }} onMouseOver={(e) => !isModified && (e.currentTarget.style.background = 'rgba(241, 245, 249, 0.5)')}
                                        onMouseOut={(e) => !isModified && (e.currentTarget.style.background = 'transparent')}>
                                        <td style={{ padding: '20px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <img
                                                    src={teacher.avatarUrl || 'https://avatars.githubusercontent.com/u/1?v=4'}
                                                    alt={teacher.name}
                                                    style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                                                />
                                                <div>
                                                    <div style={{ fontWeight: '700', color: '#1e293b' }}>{teacher.name}</div>
                                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>ID: {teacher.id}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '20px' }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {teacher.subjects?.map((s: string) => (
                                                    <span key={s} style={{ fontSize: '0.75rem', padding: '2px 8px', background: '#f1f5f9', borderRadius: '12px', color: '#475569' }}>
                                                        {s}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td style={{ padding: '20px' }}>
                                            {isEditing ? (
                                                <select
                                                    value={currentStatus}
                                                    onChange={(e) => handleStatusChange(teacher.id, e.target.value)}
                                                    style={{
                                                        padding: '8px 12px',
                                                        borderRadius: '12px',
                                                        border: '1px solid #e2e8f0',
                                                        background: currentStatus === 'resigned' ? '#fee2e2' : '#dcfce7',
                                                        color: currentStatus === 'resigned' ? '#991b1b' : '#166534',
                                                        fontWeight: '600',
                                                        fontSize: '0.9rem',
                                                        cursor: 'pointer',
                                                        outline: 'none',
                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                                    }}
                                                >
                                                    <option value="active">在職</option>
                                                    <option value="resigned">離職</option>
                                                </select>
                                            ) : (
                                                <div style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    padding: '6px 12px',
                                                    borderRadius: '20px',
                                                    fontSize: '0.85rem',
                                                    fontWeight: '600',
                                                    background: currentStatus === 'resigned' ? '#fee2e2' : '#dcfce7',
                                                    color: currentStatus === 'resigned' ? '#991b1b' : '#166534',
                                                    border: isModified ? '1px dashed #4f46e5' : 'none'
                                                }}>
                                                    <span style={{
                                                        width: '8px',
                                                        height: '8px',
                                                        borderRadius: '50%',
                                                        background: currentStatus === 'resigned' ? '#ef4444' : '#10b981'
                                                    }}></span>
                                                    {currentStatus === 'resigned' ? '離職' : '在職'}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '20px', textAlign: 'center' }}>
                                            <button
                                                onClick={() => toggleEditMode(teacher.id)}
                                                style={{
                                                    padding: '8px 24px',
                                                    borderRadius: '12px',
                                                    border: '1px solid #e2e8f0',
                                                    background: isEditing ? '#4f46e5' : '#fff',
                                                    color: isEditing ? '#fff' : '#475569',
                                                    fontWeight: '600',
                                                    fontSize: '0.9rem',
                                                    transition: 'all 0.2s ease',
                                                    cursor: 'pointer',
                                                    boxShadow: isEditing ? '0 4px 6px rgba(79, 70, 229, 0.2)' : 'none'
                                                }}
                                                onMouseOver={(e) => {
                                                    if (!isEditing) e.currentTarget.style.background = '#f8fafc';
                                                }}
                                                onMouseOut={(e) => {
                                                    if (!isEditing) e.currentTarget.style.background = '#fff';
                                                }}
                                            >
                                                {isEditing ? '取消編輯' : '編輯'}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {teachers.length === 0 && !loading && (
                        <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                            目前沒有老師資料。
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
