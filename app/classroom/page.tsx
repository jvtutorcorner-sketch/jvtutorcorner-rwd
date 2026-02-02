// Classroom top-level route: redirect to /classroom/test
'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function Page() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = searchParams.toString();
    const target = `/classroom/test${params ? `?${params}` : ''}`;
    router.replace(target);
  }, [router, searchParams]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <p>Redirecting to classroom...</p>
    </div>
  );
}

export const dynamic = 'force-dynamic';
