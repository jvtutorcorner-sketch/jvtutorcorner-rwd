// Classroom top-level route: redirect to /classroom/test
'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function ClassroomRedirect() {
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

export default function Page() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><p>Loading...</p></div>}>
      <ClassroomRedirect />
    </Suspense>
  );
}

export const dynamic = 'force-dynamic';
