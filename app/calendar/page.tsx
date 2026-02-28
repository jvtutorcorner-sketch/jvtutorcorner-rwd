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
  // 存放從 /api/orders 取得的訂單資料（包含 startTime / endTime）
  const [orderEvents, setOrderEvents] = useState<any[]>([]);

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
    } else if (user.role === 'teacher') {
      (async () => {
        try {
          const teacherId = (user as any).teacherId || '';
          const teacherName = user.displayName || (user.lastName ? `${user.lastName}老師` : user.email || '');

          let teacherCourses: any[] = [];
          const res = await fetch(`/api/courses?teacherId=${encodeURIComponent(teacherId)}`);
          const courseData = await res.json();
          if (courseData?.ok && Array.isArray(courseData.data)) {
            teacherCourses = courseData.data;
          }
          if (teacherCourses.length === 0 && teacherName) {
            const res2 = await fetch(`/api/courses?teacher=${encodeURIComponent(teacherName)}`);
            const courseData2 = await res2.json();
            if (courseData2?.data && courseData2.data.length > 0) {
              teacherCourses = courseData2.data;
            } else if (user.lastName) {
              const res3 = await fetch(`/api/courses?teacher=${encodeURIComponent(user.lastName)}`);
              const courseData3 = await res3.json();
              if (courseData3?.data && courseData3.data.length > 0) {
                teacherCourses = courseData3.data;
              } else if (user.firstName) {
                const res4 = await fetch(`/api/courses?teacher=${encodeURIComponent(user.firstName)}`);
                const courseData4 = await res4.json();
                teacherCourses = courseData4?.data || [];
              }
            }
          }

          const cIds = teacherCourses.map((c) => c.id).filter(Boolean);
          setAllowedCourseIds(new Set(cIds));

          if (cIds.length > 0) {
            const orderPromises = cIds.map((courseId: string) =>
              fetch(`/api/orders?courseId=${encodeURIComponent(courseId)}&limit=50`)
                .then((r) => r.json())
                .then((data) => (data && data.ok ? data.data || [] : data?.data || []))
                .catch(() => [])
            );
            const orderArrays = await Promise.all(orderPromises);
            const rows = orderArrays.flat();

            const eventsFromOrders: any[] = [];
            for (const r of rows) {
              if (!r || !r.courseId) continue;
              const status = String(r.status || '').toUpperCase();
              if (status === 'FAILED' || status === 'CANCELLED' || status === 'CANCELED') continue;

              try {
                let startStr = r.startTime;
                if (!startStr) {
                  const c = COURSES.find(x => x.id === r.courseId);
                  if (c) {
                    const datePart = c.nextStartDate || (c as any).startDate;
                    let timePart = (c as any).startTime;
                    if (timePart) {
                      timePart = timePart.replace(/[上下]午/g, '').trim();
                      if (timePart.split(':').length === 2) timePart += ':00';
                    } else {
                      timePart = '00:00:00';
                    }
                    if (datePart) startStr = `${datePart}T${timePart}`;
                  }
                }
                if (!startStr) startStr = r.createdAt;
                if (!startStr) continue;

                // handle ISO formats that might miss T
                const isoDate = startStr.includes('T') ? startStr : `${startStr.split(' ')[0]}T${startStr.split(' ')[1] || '00:00:00'}`;
                const start = new Date(isoDate);
                if (isNaN(start.getTime())) continue;

                let end: Date;
                if (r.endTime) {
                  const endIso = r.endTime.includes('T') ? r.endTime : `${r.endTime.split(' ')[0]}T${r.endTime.split(' ')[1] || '00:00:00'}`;
                  end = new Date(endIso);
                } else if (r.durationMinutes) {
                  end = addMinutes(start, r.durationMinutes);
                } else {
                  const c = COURSES.find(x => x.id === r.courseId);
                  end = addMinutes(start, c?.durationMinutes || 60);
                }

                const now = new Date();
                let statusStr: 'upcoming' | 'ongoing' | 'finished' | 'interrupted' | 'absent' =
                  now < start ? 'upcoming' : 'ongoing';

                // Only show ongoing if the DB status is ONGOING
                if (statusStr === 'ongoing' && status !== 'ONGOING') {
                  statusStr = 'upcoming';
                }

                if (status === 'INTERRUPTED') statusStr = 'interrupted';
                else if (status === 'FINISHED') statusStr = 'finished';
                else if (now > end && status !== 'FINISHED' && status !== 'INTERRUPTED') statusStr = 'absent';

                if (status === 'ABSENT') statusStr = 'absent';

                const courseTitle = r.courseTitle || COURSES.find(x => x.id === r.courseId)?.title || '課程';
                // userName is already resolved to firstName+lastName by the API, never use raw userId
                const studentName = r.userName || '學生';

                eventsFromOrders.push({
                  id: `order-${r.orderId}`,
                  title: courseTitle,
                  teacherName: '老師', // Assuming current user is teacher
                  studentName: studentName,
                  start,
                  end,
                  description: `課程時間：${start.toLocaleString()} ~ ${end.toLocaleString()}`,
                  type: 'activity' as const,
                  ownerType: 'teacher' as const,
                  courseId: r.courseId,
                  orderId: r.orderId,
                  status: statusStr,
                });
              } catch (e) {
                console.warn('[calendar] 解析訂單時間失敗', r.orderId, e);
              }
            }

            const uniqueEvents = eventsFromOrders.filter((ev, index, self) => index === self.findIndex((e) => e.id === ev.id));
            setOrderEvents(uniqueEvents);
          }
        } catch (e) {
          console.error('[calendar] failed to load teacher courses/orders', e);
          setAllowedCourseIds(new Set());
        }
      })();
    } else {
      // student/other: fetch orders
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
            if (status !== 'FAILED' && status !== 'CANCELLED' && status !== 'CANCELED') {
              if (r.courseId) ids.add(String(r.courseId));
            }
          }
          setAllowedCourseIds(ids);

          // 從 order 的 startTime / endTime 建立行事曆事件
          const eventsFromOrders: any[] = [];
          for (const r of rows) {
            if (!r || !r.courseId) continue;
            const status = String(r.status || '').toUpperCase();
            if (status === 'FAILED' || status === 'CANCELLED' || status === 'CANCELED') continue;

            try {
              let startStr = r.startTime;
              if (!startStr) {
                const c = COURSES.find(x => x.id === r.courseId);
                if (c) {
                  const datePart = c.nextStartDate || (c as any).startDate;
                  let timePart = (c as any).startTime;
                  if (timePart) {
                    timePart = timePart.replace(/[上下]午/g, '').trim();
                    if (timePart.split(':').length === 2) timePart += ':00';
                  } else {
                    timePart = '00:00:00';
                  }
                  if (datePart) startStr = `${datePart}T${timePart}`;
                }
              }
              if (!startStr) startStr = r.createdAt;
              if (!startStr) continue;

              const isoDate = startStr.includes('T') ? startStr : `${startStr.split(' ')[0]}T${startStr.split(' ')[1] || '00:00:00'}`;
              const start = new Date(isoDate);
              if (isNaN(start.getTime())) continue;

              // 決定結束時間 (使用 endTime 或 durationMinutes)
              let end: Date;
              if (r.endTime) {
                const endIso = r.endTime.includes('T') ? r.endTime : `${r.endTime.split(' ')[0]}T${r.endTime.split(' ')[1] || '00:00:00'}`;
                end = new Date(endIso);
              } else if (r.durationMinutes) {
                end = addMinutes(start, r.durationMinutes);
              } else {
                const c = COURSES.find(x => x.id === r.courseId);
                end = addMinutes(start, c?.durationMinutes || 60);
              }

              const now = new Date();
              let statusStr: 'upcoming' | 'ongoing' | 'finished' | 'interrupted' | 'absent' =
                now < start ? 'upcoming' : 'ongoing';

              // Only show ongoing if the DB status is ONGOING
              if (statusStr === 'ongoing' && status !== 'ONGOING') {
                statusStr = 'upcoming';
              }

              if (status === 'INTERRUPTED') statusStr = 'interrupted';
              else if (status === 'FINISHED') statusStr = 'finished';
              else if (now > end && status !== 'FINISHED' && status !== 'INTERRUPTED') statusStr = 'absent';

              if (status === 'ABSENT') statusStr = 'absent';

              // 取得課程名稱
              const courseTitle = r.courseTitle || COURSES.find(x => x.id === r.courseId)?.title || '課程';
              // teacherName is resolved by the API from the course record — never use raw email
              const teacherName = r.teacherName || COURSES.find(x => x.id === r.courseId)?.teacherName || '老師';

              eventsFromOrders.push({
                id: `order-${r.orderId}`,
                title: courseTitle,
                teacherName: teacherName,
                studentName: '學生', // Assuming current user is student
                start,
                end,
                description: `課程時間：${start.toLocaleString()} ~ ${end.toLocaleString()}`,
                type: 'activity' as const,
                ownerType: 'student' as const,
                courseId: r.courseId,
                orderId: r.orderId,
                status: statusStr,
              });
            } catch (e) {
              console.warn('[calendar] 解析訂單時間失敗', r.orderId, e);
            }
          }
          setOrderEvents(eventsFromOrders);
        } catch (e) {
          console.error('[calendar] failed to load enrollments/orders', e);
          setAllowedCourseIds(new Set());
        }
      })();
    }
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

    // Filter all static events by allowedCourseIds
    const filteredActivity = activityEvents.filter((e) => allowedCourseIds.has(e.courseId || ''));
    const filteredRecords = recordEvents.filter((e) => allowedCourseIds.has(e.courseId || ''));
    const filteredTeacher = teacherEvents.filter((e) => allowedCourseIds.has(e.courseId || ''));

    // Deduplicate order events (avoid duplicating with static events from same courseId)
    const existingIds = new Set([...filteredActivity, ...filteredRecords, ...filteredTeacher].map(e => e.id));
    const filteredOrderEvents = orderEvents.filter(e => !existingIds.has(e.id));

    return [...filteredActivity, ...filteredRecords, ...filteredTeacher, ...filteredOrderEvents];
  }, [allowedCourseIds, orderEvents, t]);

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
        {/* 操作按鈕 */}
        <div className="flex gap-3 mb-6">
          <Link
            href="/calendar/reminders"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors font-medium text-sm"
          >
            <span>🔔</span>
            <span>提醒設定</span>
          </Link>
        </div>

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

