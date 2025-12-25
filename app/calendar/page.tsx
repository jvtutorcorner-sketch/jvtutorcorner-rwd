'use client';

import React, { useMemo, useEffect, useState } from 'react';
import Calendar from '@/components/Calendar';
import { COURSE_ACTIVITIES } from '@/data/courseActivities';
import { COURSE_RECORDS } from '@/data/courseRecords';
import { COURSES } from '@/data/courses';
import { TEACHERS } from '@/data/teachers';
import { parseISO, format, addMinutes } from 'date-fns';
import { getStoredUser } from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';

export default function CalendarPage() {
  const t = useT();
  const [allowedCourseIds, setAllowedCourseIds] = useState<Set<string> | null>(null);

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

    // student/other: fetch enrollments and include only PAID / ACTIVE enrollments
    (async () => {
      try {
        const res = await fetch('/api/enroll');
        const data = await res.json();
        const rows = data?.data || [];
        const okStatuses = new Set(['PAID', 'ACTIVE']);
        const ids = new Set<string>();
        for (const r of rows) {
          if (!r) continue;
          if (String(r.email).trim().toLowerCase() === String(user.email).trim().toLowerCase() && okStatuses.has(r.status)) {
            if (r.courseId) ids.add(String(r.courseId));
          }
        }
        setAllowedCourseIds(ids);
      } catch (e) {
        console.error('[calendar] failed to load enrollments', e);
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
        title: `${record.courseName} (${
          record.status === 'attended'
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
  }, [allowedCourseIds]);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{t('calendar_title')}</h1>
          <p className="mt-2 text-sm text-gray-600">{t('calendar_description')}</p>
        </div>

        <div className="h-[800px]">
          <Calendar events={events} />
        </div>
      </main>
    </div>
  );
}
