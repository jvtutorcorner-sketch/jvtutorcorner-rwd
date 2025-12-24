// Classroom top-level route disabled — return 404 to remove /classroom
import { notFound } from 'next/navigation';

export default function Page() {
  notFound();
}

export const dynamic = 'force-dynamic';
