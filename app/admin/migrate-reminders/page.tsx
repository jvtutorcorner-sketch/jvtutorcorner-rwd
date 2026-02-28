'use client';

import React, { useState, useEffect } from 'react';
import { getStoredUser } from '@/lib/mockAuth';
import { COURSE_ACTIVITIES } from '@/data/courseActivities';
import { COURSE_RECORDS } from '@/data/courseRecords';
import { COURSES } from '@/data/courses';
import Button from '@/components/UI/Button';
import { format, parseISO, addMinutes } from 'date-fns';

interface MigrationStats {
  totalEvents: number;
  eventsWithReminders: number;
  successCount: number;
  failureCount: number;
}

interface TableStats {
  total: number;
  emailStatus: {
    pending: number;
    sent: number;
    failed: number;
    not_sent: number;
    missing: number;
  };
}

export default function MigrateRemindersPage() {
  // `undefined` = not yet known (avoid SSR rendering login screen)
  // `null` = known to be not-logged-in
  const [user, setUser] = useState<any>(undefined);
  const [localStorageData, setLocalStorageData] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<MigrationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [results, setResults] = useState<any>(null);
  const [tableStats, setTableStats] = useState<TableStats | null>(null);
  const [tableStatsLoading, setTableStatsLoading] = useState(false);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState('');

  // 載入使用者和 localStorage 數據
  useEffect(() => {
    const storedUser = getStoredUser();
    setUser(storedUser);

    if (typeof window !== 'undefined') {
      const reminders = localStorage.getItem('calendar_reminders');
      if (reminders) {
        try {
          const parsed = JSON.parse(reminders);
          setLocalStorageData(parsed);
        } catch (e) {
          console.error('無法解析 localStorage:', e);
        }
      }
    }
  }, []);

  // 載入資料表統計
  const loadTableStats = async () => {
    setTableStatsLoading(true);
    try {
      const res = await fetch('/api/calendar/reminders/backfill');
      const data = await res.json();
      if (data.ok) setTableStats(data.stats);
      else console.error('無法取得資料表統計:', data.error);
    } catch (e) {
      console.error('取得資料表統計失敗', e);
    } finally {
      setTableStatsLoading(false);
    }
  };

  // 執行 backfill
  const handleBackfill = async () => {
    if (!user || user.role !== 'admin') {
      setBackfillMessage('❌ 需要管理員權限');
      return;
    }
    setBackfillLoading(true);
    setBackfillMessage('🔄 更新中...');
    try {
      const res = await fetch('/api/calendar/reminders/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAdmin: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setBackfillMessage(`✅ ${data.message}`);
        await loadTableStats(); // 刷新統計
      } else {
        setBackfillMessage(`❌ 失敗: ${data.error}`);
      }
    } catch (e: any) {
      setBackfillMessage(`❌ 錯誤: ${e.message}`);
    } finally {
      setBackfillLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') loadTableStats();
  }, [user]);

  // 計算統計資訊
  useEffect(() => {
    if (Object.keys(localStorageData).length === 0) {
      return;
    }

    const totalEvents = Object.keys(localStorageData).length;

    // 構建事件映射
    const eventsMap: Record<string, any> = {};

    // 從 COURSE_ACTIVITIES 構建事件
    COURSE_ACTIVITIES.forEach((activity) => {
      eventsMap[activity.id] = {
        title: activity.courseName,
        courseId: activity.courseId,
        start: activity.timestamp,
        description: activity.description,
      };
    });

    // 從 COURSE_RECORDS 構建事件
    COURSE_RECORDS.forEach((record) => {
      const course = COURSES.find(c => c.id === record.courseId);
      eventsMap[record.id] = {
        title: course?.title || '課程',
        courseId: record.courseId,
        start: `${record.date}T19:00:00Z`,
        teacherName: course?.teacherName,
      };
    });

    // 從 COURSES 構建課程開始事件
    COURSES.forEach((course) => {
      if (course.nextStartDate) {
        eventsMap[`course-${course.id}-start`] = {
          title: course.title,
          courseId: course.id,
          start: `${course.nextStartDate}T19:00:00Z`,
          teacherName: course.teacherName,
        };
      }
    });

    const eventsWithReminders = Object.keys(localStorageData).filter((eventId) =>
      eventsMap[eventId]
    ).length;

    setStats({
      totalEvents,
      eventsWithReminders,
      successCount: 0,
      failureCount: 0,
    });
  }, [localStorageData]);

  // 執行遷移
  const handleMigrate = async () => {
    if (user === undefined) {
      setMessage('🔄 正在確認登入狀態，請稍候');
      return;
    }

    if (user === null) {
      setMessage('❌ 請先登入');
      return;
    }

    if (Object.keys(localStorageData).length === 0) {
      setMessage('❌ 沒有找到需要遷移的提醒');
      return;
    }

    setLoading(true);
    setMessage('🔄 遷移中...');

    try {
      // 構建事件映射
      const eventsMap: Record<string, any> = {};

      COURSE_ACTIVITIES.forEach((activity) => {
        eventsMap[activity.id] = {
          title: activity.courseName,
          courseId: activity.courseId,
          start: activity.timestamp,
          description: activity.description,
        };
      });

      COURSE_RECORDS.forEach((record) => {
        const course = COURSES.find(c => c.id === record.courseId);
        eventsMap[record.id] = {
          title: course?.title || '課程',
          courseId: record.courseId,
          start: `${record.date}T19:00:00Z`,
          teacherName: course?.teacherName,
        };
      });

      COURSES.forEach((course) => {
        if (course.nextStartDate) {
          eventsMap[`course-${course.id}-start`] = {
            title: course.title,
            courseId: course.id,
            start: `${course.nextStartDate}T19:00:00Z`,
            teacherName: course.teacherName,
          };
        }
      });

      // 為本地儲存中的任何提醒創建占位符事件（如果還未存在）
      // 這特別適用於 order- 前綴的 eventId
      Object.keys(localStorageData).forEach((eventId) => {
        if (!eventsMap[eventId]) {
          // 為缺失的事件創建占位符
          if (eventId.startsWith('order-')) {
            // 訂單事件
            eventsMap[eventId] = {
              title: '訂單相關課程',
              start: new Date().toISOString(),
              orderId: eventId.replace('order-', ''),
            };
          } else {
            // 其他類型的事件
            eventsMap[eventId] = {
              title: '課程事件',
              start: new Date().toISOString(),
            };
          }
        }
      });

      // 呼叫遷移 API
      const response = await fetch('/api/calendar/reminders/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.email,
          reminders: localStorageData,
          events: eventsMap,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        setMessage(`✅ 遷移完成！${data.message}`);
        setResults(data.results);
        setStats({
          ...stats!,
          successCount: data.results.success.length,
          failureCount: data.results.failed.length,
        });
      } else {
        setMessage(`❌ 遷移失敗: ${data.error}`);
      }
    } catch (error: any) {
      setMessage(`❌ 錯誤: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // While we don't yet know the user's auth state, render nothing (prevent SSR mismatch).
  if (user === undefined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-gray-600 text-lg">載入中...</p>
        </div>
      </div>
    );
  }

  if (user === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-gray-600 text-lg">請先登入...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* 標題 */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6 border-l-4 border-indigo-600">
          <div className="flex items-center space-x-4 mb-4">
            <div className="p-3 bg-indigo-100 rounded-lg">
              <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">提醒資料遷移工具</h1>
              <p className="text-gray-600 mt-1">將 localStorage 中的提醒轉移到 DynamoDB</p>
            </div>
          </div>
        </div>

        {/* 用戶資訊 */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 mb-4">正在登入為</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-600">Email</p>
              <p className="text-lg font-semibold text-gray-900">{user.email}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-600">角色</p>
              <p className="text-lg font-semibold text-gray-900 capitalize">{user.role}</p>
            </div>
          </div>
        </div>

        {/* 提醒統計 */}
        {stats && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-4">提醒統計</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-600">localStorage 提醒</p>
                <p className="text-3xl font-bold text-blue-900">{stats.totalEvents}</p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <p className="text-sm text-purple-600">已識別事件</p>
                <p className="text-3xl font-bold text-purple-900">{stats.eventsWithReminders}</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm text-green-600">成功遷移</p>
                <p className="text-3xl font-bold text-green-900">{stats.successCount}</p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-red-600">遷移失敗</p>
                <p className="text-3xl font-bold text-red-900">{stats.failureCount}</p>
              </div>
            </div>
          </div>
        )}

        {/* 資料表狀態 (DynamoDB) */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">資料表狀態 (DynamoDB)</h2>
            <button
              onClick={loadTableStats}
              disabled={tableStatsLoading}
              className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 text-sm font-medium disabled:opacity-50"
            >
              {tableStatsLoading ? '載入中...' : '🔄 刷新狀態'}
            </button>
          </div>

          {tableStats ? (
            <>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-center">
                  <p className="text-xs text-gray-500 mb-1">總記錄數</p>
                  <p className="text-2xl font-bold text-gray-900">{tableStats.total}</p>
                </div>
                <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200 text-center">
                  <p className="text-xs text-yellow-600 mb-1">待發送</p>
                  <p className="text-2xl font-bold text-yellow-900">{tableStats.emailStatus.pending}</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg border border-green-200 text-center">
                  <p className="text-xs text-green-600 mb-1">已發送</p>
                  <p className="text-2xl font-bold text-green-900">{tableStats.emailStatus.sent}</p>
                </div>
                <div className="p-3 bg-red-50 rounded-lg border border-red-200 text-center">
                  <p className="text-xs text-red-600 mb-1">發送失敗</p>
                  <p className="text-2xl font-bold text-red-900">{tableStats.emailStatus.failed}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-center">
                  <p className="text-xs text-gray-500 mb-1">未發送</p>
                  <p className="text-2xl font-bold text-gray-700">{tableStats.emailStatus.not_sent}</p>
                </div>
                <div className={`p-3 rounded-lg border text-center ${tableStats.emailStatus.missing > 0 ? 'bg-orange-50 border-orange-300' : 'bg-green-50 border-green-200'}`}>
                  <p className={`text-xs mb-1 ${tableStats.emailStatus.missing > 0 ? 'text-orange-600' : 'text-green-600'}`}>缺少欄位</p>
                  <p className={`text-2xl font-bold ${tableStats.emailStatus.missing > 0 ? 'text-orange-900' : 'text-green-900'}`}>{tableStats.emailStatus.missing}</p>
                </div>
              </div>

              {tableStats.emailStatus.missing > 0 && (
                <div className="border-t border-gray-200 pt-4 mt-4">
                  <p className="text-sm text-orange-700 mb-3">
                    發現 <strong>{tableStats.emailStatus.missing}</strong> 筆記錄缺少 <code>emailStatus</code> 欄位，可執行補齊作業。
                  </p>
                  <button
                    onClick={handleBackfill}
                    disabled={backfillLoading || user?.role !== 'admin'}
                    className="px-5 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-semibold disabled:opacity-50"
                  >
                    {backfillLoading ? '補齊中...' : `🔧 補齊缺少欄位 (${tableStats.emailStatus.missing} 筆)`}
                  </button>
                </div>
              )}

              {tableStats.emailStatus.missing === 0 && (
                <p className="text-sm text-green-700 bg-green-50 px-4 py-2 rounded-lg border border-green-200">
                  ✅ 所有記錄均已包含 <code>emailStatus</code> 欄位，無需補齊。
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500 italic">{tableStatsLoading ? '載入資料表統計中...' : '點擊「刷新狀態」以載入資料表統計。'}</p>
          )}

          {backfillMessage && (
            <div className={`mt-4 p-3 rounded-lg border-l-4 text-sm ${backfillMessage.includes('✅') ? 'bg-green-50 border-green-500 text-green-800' : 'bg-red-50 border-red-500 text-red-800'}`}>
              {backfillMessage}
            </div>
          )}
        </div>

        {/* 本地儲存提醒詳情 */}
        {Object.keys(localStorageData).length > 0 && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-4">本地儲存的提醒</h2>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {Object.entries(localStorageData).map(([eventId, minutes]) => (
                <div key={eventId} className="p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-mono text-gray-600">{eventId}</p>
                    <p className="text-xs text-gray-500 mt-1">提前 {minutes} 分鐘提醒</p>
                  </div>
                  <div className="text-right">
                    <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-semibold">
                      {minutes} 分
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 訊息 */}
        {message && (
          <div
            className={`rounded-xl p-4 mb-6 border-l-4 ${
              message.includes('✅')
                ? 'bg-green-50 border-green-600 text-green-900'
                : message.includes('❌')
                  ? 'bg-red-50 border-red-600 text-red-900'
                  : 'bg-blue-50 border-blue-600 text-blue-900'
            }`}
          >
            <p className="font-semibold">{message}</p>
          </div>
        )}

        {/* 遷移結果詳情 */}
        {results && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-4">遷移詳情</h2>

            {results.success.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold text-green-700 mb-3">✅ 成功遷移 ({results.success.length})</h3>
                <div className="space-y-2">
                  {results.success.slice(0, 5).map((eventId: string) => (
                    <div key={eventId} className="text-sm text-green-600 flex items-center">
                      <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      {eventId}
                    </div>
                  ))}
                  {results.success.length > 5 && (
                    <p className="text-sm text-gray-500 ml-6">... 及其他 {results.success.length - 5} 個</p>
                  )}
                </div>
              </div>
            )}

            {results.failed.length > 0 && (
              <div>
                <h3 className="font-semibold text-red-700 mb-3">❌ 遷移失敗 ({results.failed.length})</h3>
                <div className="space-y-2">
                  {results.failed.slice(0, 5).map((item: any) => (
                    <div key={item.eventId} className="text-sm text-red-600">
                      <p className="flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        {item.eventId}
                      </p>
                      <p className="text-xs text-rose-500 ml-6">{item.error}</p>
                    </div>
                  ))}
                  {results.failed.length > 5 && (
                    <p className="text-sm text-gray-500 ml-6">... 及其他 {results.failed.length - 5} 個</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 操作按鈕 */}
        <div className="flex gap-3 justify-center">
          <Button
            onClick={handleMigrate}
            disabled={loading || Object.keys(localStorageData).length === 0}
            variant="primary"
            className="px-8 py-3 text-lg"
          >
            {loading ? (
              <>
                <svg className="w-5 h-5 mr-2 inline animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                遷移中...
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                開始遷移
              </>
            )}
          </Button>
          <Button
            onClick={() => window.location.href = '/calendar'}
            variant="outline"
            className="px-8 py-3 text-lg"
          >
            返回行事曆
          </Button>
        </div>

        {/* 提示 */}
        {Object.keys(localStorageData).length === 0 && (
          <div className="mt-8 p-6 bg-amber-50 border-l-4 border-amber-500 rounded-lg">
            <p className="text-amber-900 font-semibold mb-2">ℹ️ 目前沒有本地提醒</p>
            <p className="text-amber-800 text-sm">
              請先前往<a href="/calendar" className="font-semibold hover:underline">行事曆</a>設定提醒。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
