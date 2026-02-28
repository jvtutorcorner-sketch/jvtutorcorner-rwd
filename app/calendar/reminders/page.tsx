'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { format, differenceInMinutes, isSameDay, parseISO } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { getStoredUser } from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';
import Button from '@/components/UI/Button';
import { COURSES } from '@/data/courses';

// DB 儲存的精簡結構（無名稱欄位）
interface CalendarReminder {
  id: string;
  userId: string;
  orderId?: string;
  eventId: string;
  courseId?: string;
  eventStartTime: string;
  reminderMinutes: string;
  emailStatus?: 'pending' | 'sent' | 'failed' | 'not_sent';
  emailSentAt?: string;
  emailError?: string;
  createdAt: string;
  updatedAt: string;
}

// 前端 enrichment 後的展示型別
interface EnrichedReminder extends CalendarReminder {
  courseName: string;
  teacherName: string;
  studentLabel: string;
}

export default function RemindersPage() {
  const t = useT();
  const router = useRouter();
  const [reminders, setReminders] = useState<EnrichedReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  
  // Filter states
  const [orderIdFilter, setOrderIdFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState(''); // 比對 courseName
  const [teacherFilter, setTeacherFilter] = useState(''); // 比對 teacherName
  const [studentFilter, setStudentFilter] = useState(''); // 比對 userId
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [limitFilter, setLimitFilter] = useState('50');

  // Load user
  useEffect(() => {
    const storedUser = getStoredUser();
    setUser(storedUser);
  }, []);

  // Fetch reminders
  const fetchReminders = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('userId', user.email || '');
      params.set('isAdmin', String(user.role === 'admin'));
      params.set('limit', limitFilter);
      
      if (orderIdFilter) params.set('orderId', orderIdFilter);
      // courseFilter 和 teacherFilter 在前端 enrichment 後過濾，不在 API 層除濾
      if (startDateFilter) params.set('startDate', startDateFilter);
      if (endDateFilter) params.set('endDate', endDateFilter);

      const res = await fetch(`/api/calendar/reminders?${params.toString()}`);
      const data = await res.json();
      
      if (data.ok) {
        // Enrich ：透過 courseId join COURSES 静態資料
        const enriched: EnrichedReminder[] = (data.data || []).map((r: CalendarReminder) => {
          const course = COURSES.find(c => c.id === r.courseId);
          return {
            ...r,
            courseName: course?.title || (r.courseId ? `課程 ${r.courseId}` : '未知課程'),
            teacherName: (course as any)?.teacherName || '',
            studentLabel: r.userId,
          };
        });
        setReminders(enriched);
      } else {
        console.error('Failed to fetch reminders:', data.error);
      }
    } catch (error) {
      console.error('Error fetching reminders:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchReminders();
    }
  }, [user, limitFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除此提醒嗎？')) return;
    
    try {
      const params = new URLSearchParams();
      params.set('id', id);
      params.set('userId', user?.email || '');
      params.set('isAdmin', String(user?.role === 'admin'));
      
      const res = await fetch(`/api/calendar/reminders?${params.toString()}`, {
        method: 'DELETE'
      });
      
      const data = await res.json();
      if (data.ok) {
        // Refresh list
        fetchReminders();
      } else {
        alert('刪除失敗：' + data.error);
      }
    } catch (error) {
      console.error('Error deleting reminder:', error);
      alert('刪除失敗');
    }
  };

  const handleSearch = () => {
    fetchReminders();
  };

  const handleReset = () => {
    setOrderIdFilter('');
    setCourseFilter('');
    setTeacherFilter('');
    setStudentFilter('');
    setStartDateFilter('');
    setEndDateFilter('');
    setLimitFilter('50');
  };

  // 前端過濾（基於 enriched 資料）
  const filteredReminders = useMemo(() => {
    let list = reminders;
    if (courseFilter) {
      const q = courseFilter.toLowerCase();
      list = list.filter(r => r.courseName.toLowerCase().includes(q));
    }
    if (teacherFilter) {
      const q = teacherFilter.toLowerCase();
      list = list.filter(r => r.teacherName.toLowerCase().includes(q));
    }
    if (studentFilter) {
      const q = studentFilter.toLowerCase();
      list = list.filter(r => r.userId.toLowerCase().includes(q));
    }
    return list;
  }, [reminders, courseFilter, teacherFilter, studentFilter]);

  // 下拉選單選項（來自 enriched 資料）
  const uniqueCourses = useMemo(() => {
    return Array.from(new Set(reminders.map(r => r.courseName).filter(Boolean))).sort();
  }, [reminders]);

  const uniqueTeachers = useMemo(() => {
    return Array.from(new Set(reminders.map(r => r.teacherName).filter(Boolean))).sort();
  }, [reminders]);

  const uniqueStudents = useMemo(() => {
    return Array.from(new Set(reminders.map(r => r.userId).filter(Boolean))).sort();
  }, [reminders]);

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-700">請先登入...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/calendar')}
                className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium text-sm"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>返回</span>
              </button>
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-indigo-100 rounded-xl">
                  <svg className="w-8 h-8 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">課程提醒管理</h1>
                  <p className="text-sm text-gray-700 mt-1">
                    {user.role === 'admin' ? '管理所有課程提醒' : '管理您的課程提醒通知'}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="px-4 py-2 bg-indigo-100 rounded-lg">
                <span className="text-2xl font-bold text-indigo-600">{reminders.length}</span>
                <span className="text-sm text-indigo-600 ml-2">個提醒</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filter Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            搜尋與篩選
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {/* Order ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">訂單編號</label>
              <input
                type="text"
                value={orderIdFilter}
                onChange={(e) => setOrderIdFilter(e.target.value)}
                placeholder="輸入訂單編號"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>

            {/* Course */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">課程</label>
              <input
                type="text"
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                placeholder="輸入課程名稱"
                list="courses-list"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
              <datalist id="courses-list">
                {uniqueCourses.map(course => (
                  <option key={course} value={course} />
                ))}
              </datalist>
            </div>

            {/* Teacher */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">老師</label>
              <input
                type="text"
                value={teacherFilter}
                onChange={(e) => setTeacherFilter(e.target.value)}
                placeholder="輸入老師姓名"
                list="teachers-list"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
              <datalist id="teachers-list">
                {uniqueTeachers.map(teacher => (
                  <option key={teacher} value={teacher} />
                ))}
              </datalist>
            </div>

            {/* Student */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">學生</label>
              <input
                type="text"
                value={studentFilter}
                onChange={(e) => setStudentFilter(e.target.value)}
                placeholder="輸入學生姓名"
                list="students-list"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
              <datalist id="students-list">
                {uniqueStudents.map(student => (
                  <option key={student} value={student} />
                ))}
              </datalist>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">開始日期</label>
              <input
                type="date"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
              <input
                type="date"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>

          {/* Limit & Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">顯示筆數：</label>
              <select
                value={limitFilter}
                onChange={(e) => setLimitFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="10">10 筆</option>
                <option value="25">25 筆</option>
                <option value="50">50 筆</option>
                <option value="100">100 筆</option>
                <option value="200">200 筆</option>
              </select>
            </div>

            <div className="flex space-x-3">
              <Button
                onClick={handleReset}
                variant="outline"
                className="px-6"
              >
                重置
              </Button>
              <Button
                onClick={handleSearch}
                variant="primary"
                className="px-6"
              >
                <svg className="w-5 h-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                搜尋
              </Button>
            </div>
          </div>
        </div>

        {/* Reminders List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          </div>
        ) : reminders.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
            <div className="w-24 h-24 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">沒有符合條件的提醒</h2>
            <p className="text-gray-700 mb-8">請調整搜尋條件或前往行事曆設定新提醒</p>
            <Button
              onClick={() => router.push('/calendar')}
              variant="primary"
              className="inline-flex items-center px-6 py-3 text-lg"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              前往行事曆
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredReminders.map((reminder) => {
              const eventTime = parseISO(reminder.eventStartTime);
              const now = new Date();
              const isPast = eventTime < now;
              const isToday = isSameDay(eventTime, now);
              const minutesUntilEvent = differenceInMinutes(eventTime, now);
              const isImminent = minutesUntilEvent <= 60 && minutesUntilEvent > 0;

              return (
                <div
                  key={reminder.id}
                  className="bg-white rounded-xl shadow-md border border-gray-200 p-6 hover:shadow-lg transition-all duration-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-xl font-bold text-gray-900">{reminder.courseName}</h3>
                        {isPast && (
                          <span className="px-3 py-1 bg-gray-100 text-gray-800 text-xs font-semibold rounded-full">
                            已過期
                          </span>
                        )}
                        {isToday && !isPast && (
                          <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full animate-pulse">
                            今天
                          </span>
                        )}
                        {isImminent && !isPast && (
                          <span className="px-3 py-1 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full animate-pulse">
                            即將開始
                          </span>
                        )}
                        {!isPast && !isToday && !isImminent && (
                          <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                            即將到來
                          </span>
                        )}
                        {/* Email 發送狀態徽章 */}
                        {(!reminder.emailStatus || reminder.emailStatus === 'pending') ? (
                          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">✉ 待發送</span>
                        ) : reminder.emailStatus === 'sent' ? (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full" title={reminder.emailSentAt ? `發送時間: ${new Date(reminder.emailSentAt).toLocaleString('zh-TW')}` : ''}>✓ Email已發送</span>
                        ) : reminder.emailStatus === 'failed' ? (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full" title={reminder.emailError || ''}>✗ 發送失敗</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full">未發送</span>
                        )}
                      </div>

                      <div className="space-y-2 text-sm text-gray-800">
                        {/* Email 發送詳細資訊 */}
                        {reminder.emailSentAt && (
                          <div className="flex items-center text-xs text-green-600">
                            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            Email 已於 {new Date(reminder.emailSentAt).toLocaleString('zh-TW')} 發送
                          </div>
                        )}
                        {reminder.emailStatus === 'failed' && reminder.emailError && (
                          <div className="flex items-center text-xs text-red-500">
                            <svg className="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            錯誤：{reminder.emailError}
                          </div>
                        )}
                        <div className="flex items-center">
                          <svg className="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="font-medium">課程時間：</span>
                          <span className="ml-1">
                            {format(eventTime, 'yyyy/MM/dd (E) HH:mm', { locale: zhTW })}
                          </span>
                        </div>

                        <div className="flex items-center">
                          <svg className="w-4 h-4 mr-2 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                          </svg>
                          <span className="font-medium">提醒時間：</span>
                          <span className="ml-1 text-indigo-600 font-semibold">
                            課前 {reminder.reminderMinutes} 分鐘
                          </span>
                        </div>

                        {reminder.teacherName && (
                          <div className="flex items-center">
                            <svg className="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <span className="font-medium">{t('teacher')}：</span>
                            <span className="ml-1">{reminder.teacherName}</span>
                          </div>
                        )}

                        {user?.role === 'admin' && (
                          <div className="flex items-center">
                            <svg className="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                            <span className="font-medium">{t('student')}：</span>
                            <span className="ml-1">{reminder.studentLabel}</span>
                          </div>
                        )}

                        {reminder.orderId && (
                          <div className="flex items-center">
                            <svg className="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="font-medium">訂單編號：</span>
                            <span className="ml-1 font-mono text-xs">{reminder.orderId}</span>
                          </div>
                        )}

                        {reminder.courseId && (
                          <div className="flex items-center">
                            <svg className="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                            <span className="font-medium">課程 ID：</span>
                            <span className="ml-1 font-mono text-xs">{reminder.courseId}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 ml-4">
                      <button
                        onClick={() => router.push('/calendar')}
                        className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors font-medium text-sm"
                      >
                        檢視課程
                      </button>
                      <button
                        onClick={() => handleDelete(reminder.id)}
                        className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium text-sm"
                      >
                        刪除提醒
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
