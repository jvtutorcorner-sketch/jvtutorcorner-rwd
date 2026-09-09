'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser, type StoredUser } from '@/lib/mockAuth';
import AttendanceScanner from '@/components/AttendanceScanner';

export default function ScannerPage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null | undefined>(undefined);

  useEffect(() => {
    const stored = getStoredUser();
    setUser(stored);
    if (!stored || (stored.role !== 'teacher' && stored.role !== 'admin')) {
      router.replace('/login');
    }
  }, [router]);

  if (user === undefined) {
    return null;
  }
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 px-4 py-4 backdrop-blur">
        <h1 className="text-lg font-bold text-gray-900">學員報到掃描</h1>
        <p className="text-sm text-gray-500">請將學員的報到 QR Code 對準相機框內</p>
      </header>
      <AttendanceScanner />
    </div>
  );
}
