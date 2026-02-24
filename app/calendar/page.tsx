'use client';

import React, { useMemo, useEffect, useState } from 'react';
import Calendar from '@/components/Calendar';
import { COURSE_ACTIVITIES } from '@/data/courseActivities';
import { COURSE_RECORDS } from '@/data/courseRecords';
import { COURSES } from '@/data/courses';
import { TEACHERS } from '@/data/teachers';
import { parseISO, format, addMinutes, isSameYear, isSameMonth, isSameWeek, isSameDay } from 'date-fns';
import { getStoredUser } from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';
import Link from 'next/link';

export default function CalendarPage() {
  const t = useT();
  const [allowedCourseIds, setAllowedCourseIds] = useState<Set<string> | null>(null);
  const [view, setView] = useState<'year' | 'month' | 'week' | 'day'>('month');

  useEffect(() => {
    // determine allowed courses for current user
    const user = getStoredUser();
    if (!user) {
      setAllowedCourseIds(new Set());
      return;
    }

    // admin: allow all
    if (user.role === 'admin') {
      setAllowedCourseIds(new Set(COURSES.map((c) => c.id)));
      return;
    }

    // teacher: allow courses taught by this teacher
    if (user.role === 'teacher' && (user as any).teacherId) {
      const teacher = TEACHERS.find((t) => String(t.id) === String((user as any).teacherId));
      const name = teacher?.name;
      const ids = COURSES.filter((c) => String(c.teacherName || '').trim() === String(name || '').trim()).map((c) => c.id);
      setAllowedCourseIds(new Set(ids));
      return;
    }

    // student/other: fetch orders and include ACTIVE/PAID orders
    (async () => {
      try {
        const url = `/api/orders?limit=50&userId=${encodeURIComponent(user.email || '')}`;
        const res = await fetch(url);
        const data = await res.json();
        let rows: any[] = [];
        if (data && Array.isArray(data)) rows = data;
        else if (data && Array.isArray(data.data)) rows = data.data;

        const ids = new Set<string>();
        for (const r of rows) {
          if (!r) continue;
          const status = String(r.status || '').toUpperCase();
          // Assume if order exists and isn't failed/cancelled, the student is allowed in the course.
          if (status !== 'FAILED' && status !== 'CANCELLED' && status !== 'CANCELED') {
            if (r.courseId) ids.add(String(r.courseId));
          }
        }
        setAllowedCourseIds(ids);
      } catch (e) {
        console.error('[calendar] failed to load enrollments/orders', e);
        setAllowedCourseIds(new Set());
      }
    })();
  }, []);

  const events = useMemo(() => {
    // if still loading enrollments, show nothing
    if (allowedCourseIds === null) return [];

    const activityEvents = COURSE_ACTIVITIES.map((activity) => {
      const start = parseISO(activity.timestamp);
      const course = COURSES.find((c) => c.id === activity.courseId);
      const duration = (course && (course.sessionDurationMinutes || course.durationMinutes)) || 60;
      const end = addMinutes(start, duration);
      const now = new Date();
      const statusStr: 'upcoming' | 'ongoing' | 'finished' = now < start ? 'upcoming' : now >= start && now < end ? 'ongoing' : 'finished';
      return {
        id: activity.id,
        title: activity.courseName,
        start,
        description: activity.description,
        type: 'activity' as const,
        ownerType: 'student' as const,
        courseId: activity.courseId,
        status: statusStr,
      };
    });

    const recordEvents = COURSE_RECORDS.map((record) => {
      const matchingActivity = COURSE_ACTIVITIES.find(
        (a) => a.courseId === record.courseId && format(parseISO(a.timestamp), 'yyyy-MM-dd') === record.date
      );
      const start = matchingActivity
        ? parseISO(matchingActivity.timestamp)
        : (() => {
          const dateStr = record.date + 'T19:00:00Z';
          return parseISO(dateStr);
        })();

      const course = COURSES.find((c) => c.id === record.courseId);
      const duration = (course && (course.sessionDurationMinutes || course.durationMinutes)) || 60;
      const end = addMinutes(start, duration);
      const now = new Date();
      const statusStr: 'upcoming' | 'ongoing' | 'interrupted' | 'finished' = record.status === 'missed'
        ? 'interrupted'
        : now < start
          ? 'upcoming'
          : now >= start && now < end
            ? 'ongoing'
            : 'finished';

      return {
        id: record.id,
        title: `${record.courseName} (${record.status === 'attended'
          ? t('calendar_status_attended')
          : record.status === 'missed'
            ? t('calendar_status_missed')
            : t('calendar_status_pending')
          })`,
        start,
        description: record.notes,
        type: 'record' as const,
        ownerType: 'student' as const,
        courseId: record.courseId,
        status: statusStr,
      };
    });

    const teacherEvents = COURSES.filter((c) => c.nextStartDate).map((course) => {
      const matchingActivity = COURSE_ACTIVITIES.find(
        (a) => a.courseId === course.id && format(parseISO(a.timestamp), 'yyyy-MM-dd') === course.nextStartDate
      );
      const dateStr = course.nextStartDate + 'T19:00:00Z';
      const start = matchingActivity ? parseISO(matchingActivity.timestamp) : parseISO(dateStr);
      const duration = (course && (course.sessionDurationMinutes || course.durationMinutes)) || 60;
      const end = addMinutes(start, duration);
      const now = new Date();
      const statusStr: 'upcoming' | 'ongoing' | 'finished' = now < start ? 'upcoming' : now >= start && now < end ? 'ongoing' : 'finished';
      return {
        id: 'course-' + course.id + '-start',
        title: course.title + ' ' + t('calendar_course_start'),
        start,
        description: course.description || '',
        type: 'activity' as const,
        ownerType: 'teacher' as const,
        courseId: course.id,
        status: statusStr,
      };
    });

    // Filter all events by allowedCourseIds (only include events for allowed courses)
    const filteredActivity = activityEvents.filter((e) => allowedCourseIds.has(e.courseId || ''));
    const filteredRecords = recordEvents.filter((e) => allowedCourseIds.has(e.courseId || ''));
    const filteredTeacher = teacherEvents.filter((e) => allowedCourseIds.has(e.courseId || ''));

    return [...filteredActivity, ...filteredRecords, ...filteredTeacher];
  }, [allowedCourseIds, t]);

  const stats = useMemo(() => {
    if (!allowedCourseIds) return { current: 0, ex: 0 };

    const now = new Date();

    // Filter records by allowed courses AND current view date range
    const myRecords = COURSE_RECORDS.filter((r) => {
      if (!allowedCourseIds.has(r.courseId)) return false;

      const recordDate = parseISO(r.date + 'T00:00:00Z');
      if (view === 'year') return isSameYear(recordDate, now);
      if (view === 'month') return isSameMonth(recordDate, now);
      if (view === 'week') return isSameWeek(recordDate, now);
      if (view === 'day') return isSameDay(recordDate, now);
      return true;
    });

    const studentsWithPending = new Set(
      myRecords.filter((r) => r.status === 'pending').map((r) => r.studentId)
    );

    const studentsWithOnlyPast = new Set(
      myRecords
        .filter((r) => r.status === 'attended' || r.status === 'missed')
        .map((r) => r.studentId)
    );

    // Remove those who still have pending in this period
    studentsWithPending.forEach((id) => studentsWithOnlyPast.delete(id));

    return {
      current: studentsWithPending.size,
      ex: studentsWithOnlyPast.size,
    };
  }, [allowedCourseIds, view]);

  // 設定今天的日期格式提供給 Banner 使用
  const todayDateStr = format(new Date(), 'EEEE, d MMMM yyyy');

  return (
    <div className="min-h-screen bg-white text-gray-800 font-sans">
      {/* 主要內容區 (Main Content) */}
      <main className="p-4 md:p-8 bg-[#fdfdfd] min-h-screen overflow-y-auto">
        {/* 行事曆區塊 */}
        <div className="bg-white shadow-sm hover:shadow-md transition-shadow min-h-[500px] md:min-h-[700px] p-4 md:p-6 rounded-xl border border-gray-100 overflow-x-auto">
          <div className="min-w-[700px] md:min-w-0">
            <Calendar events={events} view={view} onViewChange={setView} />
          </div>
        </div>
      </main>
    </div>
  );
}
