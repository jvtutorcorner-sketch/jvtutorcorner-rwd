"use client";

import { useEffect, useState } from 'react';
import { getStoredUser } from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';

export function CourseSessionDurationEditor({ courseId, teacherName, defaultMinutes }: { courseId: string; teacherName: string; defaultMinutes: number }) {
  const t = useT();
  const [minutes, setMinutes] = useState<number>(defaultMinutes);
  const [editing, setEditing] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);

  useEffect(() => {
    try {
      const u = getStoredUser();
      if (u) {
        const admin = u.role === 'admin';
        const teacher = Boolean(u.role === 'teacher' || (u.displayName && teacherName && u.displayName.includes(teacherName)));
        setIsTeacher(admin || teacher);
      }
    } catch (e) {}

    try {
      const raw = localStorage.getItem(`course_session_duration_${courseId}`);
      if (raw) setMinutes(Number(raw));
    } catch (e) {}
  }, [courseId, teacherName]);

  const save = () => {
    try {
      localStorage.setItem(`course_session_duration_${courseId}`, String(minutes));
      setEditing(false);
      alert(t('saved_duration'));
    } catch (e) {
      console.warn('save duration failed', e);
      alert(t('save_failed'));
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 8 }}>{minutes} 分鐘</div>
      {isTeacher ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="number" value={minutes} min={1} max={240} onChange={(e) => setMinutes(Number(e.target.value || 0))} style={{ width: 80 }} />
          <button onClick={save}>{t('save')}</button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#666' }}>{t('only_teacher_editable')}</div>
      )}
    </div>
  );
}