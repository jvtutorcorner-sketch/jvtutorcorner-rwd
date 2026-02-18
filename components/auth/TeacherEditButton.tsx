"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { getStoredUser } from '@/lib/mockAuth';

interface TeacherEditButtonProps {
    teacherId: string;
}

export default function TeacherEditButton({ teacherId }: TeacherEditButtonProps) {
    const [show, setShow] = useState(false);

    useEffect(() => {
        const user = getStoredUser();
        // Show only if logged in user is the teacher viewing their own page
        if (user && user.role === 'teacher' && (user.teacherId === teacherId || user.roid_id === teacherId)) {
            setShow(true);
        }
    }, [teacherId]);

    if (!show) return null;

    return (
        <div style={{ marginTop: '16px' }}>
            <Link
                href={`/teachers/${teacherId}/edit`}
                style={{
                    display: 'inline-block',
                    padding: '8px 16px',
                    background: '#4f46e5',
                    color: '#fff',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    fontSize: '14px',
                    fontWeight: 'bold'
                }}
            >
                編輯個人檔案
            </Link>
        </div>
    );
}
