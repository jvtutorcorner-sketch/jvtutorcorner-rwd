// Classroom top-level route: redirect to /classroom/test
import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/classroom/test');
}

export const dynamic = 'force-dynamic';
