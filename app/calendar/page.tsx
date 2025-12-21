'use client';

import React, { useMemo } from 'react';
import Calendar from '@/components/Calendar';
import { COURSE_ACTIVITIES } from '@/data/courseActivities';
import { COURSE_RECORDS } from '@/data/courseRecords';
import { COURSES } from '@/data/courses';
import { parseISO, format, addMinutes } from 'date-fns';

export default function CalendarPage() {
  const events = useMemo(() => {
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
            ? '已出席'
            : record.status === 'missed'
              ? '缺席'
              : '待處理'
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
        title: course.title + ' 開課',
        start,
        description: course.description || '',
        type: 'activity' as const,
        ownerType: 'teacher' as const,
        courseId: course.id,
        status: statusStr,
      };
    });

    return [...activityEvents, ...recordEvents, ...teacherEvents];
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">課程行事曆</h1>
          <p className="mt-2 text-sm text-gray-600">查看您的預約課程時段，並設定 Email 提醒。</p>
        </div>

        <div className="h-[800px]">
          <Calendar events={events} />
        </div>
      </main>
    </div>
  );
}
