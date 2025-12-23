"use client";
// components/TeacherCard.tsx
import { Teacher } from '@/data/teachers';
import Link from 'next/link';
import { useT } from './IntlProvider';
import { useEffect, useState } from 'react';

interface TeacherCardProps {
  teacher: Teacher;
}

export const TeacherCard: React.FC<TeacherCardProps> = ({ teacher }) => {
  const href = teacher.id
    ? `/teachers/${encodeURIComponent(String(teacher.id))}`
    : `/teachers?teacher=${encodeURIComponent(String(teacher.name))}`;
  const t = useT();
  const tt = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  const [orderCount, setOrderCount] = useState<number | null>(null);

  useEffect(() => {
    // Fetch teacher's courses and orders count
    const teacherName = teacher.name;
    const teacherId = teacher.id;

    Promise.all([
      fetch(`/api/courses?teacherId=${encodeURIComponent(String(teacherId))}`)
        .then(r => r.json())
        .catch(() => ({ data: [] })),
      fetch(`/api/courses?teacher=${encodeURIComponent(String(teacherName))}`)
        .then(r => r.json())
        .catch(() => ({ data: [] }))
    ]).then(([byIdResult, byNameResult]) => {
      let teacherCourses = [];
      if (byIdResult?.ok && Array.isArray(byIdResult.data)) {
        teacherCourses = byIdResult.data;
      } else if (byNameResult?.ok && Array.isArray(byNameResult.data)) {
        teacherCourses = byNameResult.data;
      } else if (Array.isArray(byIdResult?.data) && byIdResult.data.length > 0) {
        teacherCourses = byIdResult.data;
      } else if (Array.isArray(byNameResult?.data)) {
        teacherCourses = byNameResult.data;
      }

      const courseIds = teacherCourses.map((c: any) => c.id).filter(Boolean);
      if (courseIds.length === 0) {
        setOrderCount(0);
        return;
      }

      const orderPromises = courseIds.map((courseId: string) =>
        fetch(`/api/orders?courseId=${encodeURIComponent(courseId)}&limit=100`)
          .then(r => r.json())
          .then(data => (data?.ok ? data.data || [] : data?.data || []))
          .catch(() => [])
      );

      Promise.all(orderPromises).then((orderArrays) => {
        const allOrders = orderArrays.flat();
        const uniqueOrders = allOrders.filter((order, index, self) => 
          index === self.findIndex((o) => o.orderId === order.orderId)
        );
        setOrderCount(uniqueOrders.length);
      });
    });
  }, [teacher.id, teacher.name]);

  return (
    <Link href={href} className="card card-link">
      <div className="card-header">
        <img
          src={teacher.avatarUrl}
          alt={teacher.name}
          className="card-avatar"
        />
        <div>
          <h3 className="card-title">{tt(`teachers.${teacher.id}.name`, teacher.name)}</h3>
          <p className="card-subtitle">
            {tt(`teachers.${teacher.id}.subjects`, teacher.subjects.join(' · '))}｜{tt(`teachers.${teacher.id}.location`, teacher.location)}
          </p>
        </div>
      </div>
      <p className="card-intro">{tt(`teachers.${teacher.id}.intro`, teacher.intro)}</p>
      <div className="card-meta">
        <span>⭐ {teacher.rating.toFixed(1)}</span>
        <span>{t('currency')} {teacher.hourlyRate}/{t('per_session')}</span>
        {orderCount !== null && (
          <span style={{ color: '#666' }}>📊 {orderCount} 個訂單</span>
        )}
      </div>
      <div className="card-tags">
        {teacher.languages.map((lang) => (
          <span key={lang} className="tag">
            {lang}
          </span>
        ))}
      </div>
    </Link>
  );
};

