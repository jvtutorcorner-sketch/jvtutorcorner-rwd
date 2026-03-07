import TeacherDashboard from './TeacherDashboard';
import { Suspense } from 'react';

export default function TeacherDashboardClient(props: any) {
  return (
    <Suspense fallback={<div>Loading dashboard...</div>}>
      <TeacherDashboard {...props} />
    </Suspense>
  );
}
