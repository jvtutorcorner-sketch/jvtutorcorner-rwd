"use client";

import { useEffect, useState, Suspense } from 'react';
import { getStoredUser, type StoredUser } from '@/lib/mockAuth';
import TeacherEscrowManager from '@/components/TeacherEscrowManager';

function TeacherEarningsContent() {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    function onAuth() {
      setUser(getStoredUser());
    }

    if (typeof window !== 'undefined') {
      setMounted(true);
      setUser(getStoredUser());
      window.addEventListener('tutor:auth-changed', onAuth);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('tutor:auth-changed', onAuth);
      }
    };
  }, []);

  if (!mounted) {
    return (
      <main style={{ padding: 24 }}>
        <p>載入中...</p>
      </main>
    );
  }

  // Check if user is teacher
  if (user && user.role !== 'teacher' && user.role !== 'admin') {
    return (
      <main style={{ padding: 24 }}>
        <h1>存取被拒</h1>
        <p>只有教師和管理員可以訪問此頁面。</p>
      </main>
    );
  }

  const pageTitle = user?.role === 'admin' ? '老師點數暫存管理' : '我的點數收入';
  const pageDescription =
    user?.role === 'admin'
      ? '查看所有老師通過課程完成而收到的點數暫存（Escrow）記錄。'
      : '查看您通過課程完成而收到的點數暫存（Escrow）記錄。';

  // For teacher, pass their own ID; for admin, leave empty to see all
  const teacherId = user?.role === 'teacher' ? user?.teacherId : undefined;

  return (
    <main style={{ padding: 24 }}>
      <h1>{pageTitle}</h1>
      <p>{pageDescription}</p>
      <TeacherEscrowManager teacherId={teacherId} />
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div>載入中...</div>}>
      <TeacherEarningsContent />
    </Suspense>
  );
}
