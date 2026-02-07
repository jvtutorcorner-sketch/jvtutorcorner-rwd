"use client";

import { useState } from 'react';
import TeacherDashboardClient from '@/components/TeacherDashboardClient';
import Modal from '@/components/Modal';
import NewCourseForm from '@/components/NewCourseForm';

export default function Page() {
  const [open, setOpen] = useState(false);

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>教師課程管理</h1>
        <div>
          <button onClick={() => setOpen(true)} className="py-2 px-4 bg-blue-600 text-white rounded">新增課程</button>
        </div>
      </div>

      {open && (
        <Modal onClose={() => setOpen(false)}>
          <NewCourseForm onSuccess={() => setOpen(false)} />
        </Modal>
      )}

      <section style={{ marginTop: 24 }}>
        <TeacherDashboardClient />
      </section>
    </main>
  );
}
