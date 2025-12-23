'use client';

import React, { useState, useEffect } from 'react';
import { getStoredUser } from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  addDays,
  parseISO,
} from 'date-fns';
import { zhTW } from 'date-fns/locale';

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  description?: string;
  type: 'activity' | 'record';
  ownerType?: 'student' | 'teacher';
  courseId?: string;
  status?: 'upcoming' | 'ongoing' | 'interrupted' | 'finished';
}

interface CalendarProps {
  events: CalendarEvent[];
}

const Calendar: React.FC<CalendarProps> = ({ events }) => {
  const t = useT();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [reminderTime, setReminderTime] = useState('15'); // minutes before
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminders, setReminders] = useState<Record<string, string>>({});

  useEffect(() => {
    const savedReminders = localStorage.getItem('calendar_reminders');
    if (savedReminders) {
      setReminders(JSON.parse(savedReminders));
    }
  }, []);

  const saveReminders = (newReminders: Record<string, string>) => {
    setReminders(newReminders);
    localStorage.setItem('calendar_reminders', JSON.stringify(newReminders));
  };

  const renderHeader = () => {
    return (
      <div className="flex items-center justify-between px-4 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center">
          <h2 className="text-xl font-semibold text-gray-900">
            {format(currentMonth, 'yyyy年 MMMM', { locale: zhTW })}
          </h2>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {t('today')}
          </button>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  const renderDays = () => {
    const days = [t('day_sun'), t('day_mon'), t('day_tue'), t('day_wed'), t('day_thu'), t('day_fri'), t('day_sat')];
    return (
      <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
        {days.map((day) => (
          <div key={day} className="py-2 text-xs font-medium text-center text-gray-500 uppercase tracking-wider">
            {day}
          </div>
        ))}
      </div>
    );
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = '';

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const formattedDate = format(day, 'd');
        const cloneDay = day;
        const dayEvents = events.filter((event) => isSameDay(event.start, cloneDay));

        days.push(
          <div
            key={day.toString()}
            className={`min-h-[120px] border-r border-b border-gray-200 p-2 transition-colors ${
              !isSameMonth(day, monthStart) ? 'bg-gray-50 text-gray-400' : 'bg-white text-gray-900'
            } ${isSameDay(day, new Date()) ? 'bg-blue-50' : ''}`}
            onClick={() => setSelectedDate(cloneDay)}
          >
            <div className="flex justify-between items-start">
              <span className={`text-sm font-medium ${isSameDay(day, new Date()) ? 'bg-blue-600 text-white w-6 h-6 flex items-center justify-center rounded-full' : ''}`}>
                {formattedDate}
              </span>
            </div>
            <div className="mt-2 space-y-1">
              {dayEvents.map((event) => (
                <div
                  key={event.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedEvent(event);
                  }}
                  className={`px-2 py-1 text-xs rounded-md truncate cursor-pointer flex items-center justify-between ${(() => {
                    // Priority: status -> ownerType -> type
                    if (event.status === 'ongoing') return 'bg-green-100 text-green-800 border border-green-200';
                    if (event.status === 'interrupted') return 'bg-red-100 text-red-800 border border-red-200';
                    if (event.status === 'finished') return 'bg-gray-100 text-gray-700 border border-gray-200';
                    if (event.status === 'upcoming') return 'bg-indigo-100 text-indigo-800 border border-indigo-200';
                    if (event.ownerType === 'teacher') return 'bg-purple-100 text-purple-800 border border-purple-200';
                    if (event.ownerType === 'student') return 'bg-indigo-100 text-indigo-800 border border-indigo-200';
                    return event.type === 'activity' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-blue-100 text-blue-800 border border-blue-200';
                  })()} hover:shadow-sm transition-shadow`}
                >
                  <span className="truncate">{format(event.start, 'HH:mm')} {event.title}</span>
                  {reminders[event.id] && (
                    <svg className="w-3 h-3 ml-1 text-indigo-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7" key={day.getTime()}>
          {days}
        </div>
      );
      days = [];
    }
    return <div className="bg-white border-l border-t border-gray-200">{rows}</div>;
  };

  const handleSetReminder = () => {
    if (selectedEvent) {
      const newReminders = { ...reminders, [selectedEvent.id]: reminderTime };
      saveReminders(newReminders);
      alert(`提醒已設定！將在課程開始前 ${reminderTime} 分鐘發送通知至您的信箱。`);
      setShowReminderModal(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
      {renderHeader()}
      {renderDays()}
      <div className="flex-1 overflow-y-auto">
        {renderCells()}
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className={`px-6 py-4 flex justify-between items-center ${(() => {
              if (selectedEvent.status === 'ongoing') return 'bg-green-600';
              if (selectedEvent.status === 'interrupted') return 'bg-red-600';
              if (selectedEvent.status === 'finished') return 'bg-gray-700';
              if (selectedEvent.status === 'upcoming') return 'bg-indigo-600';
              if (selectedEvent.ownerType === 'teacher') return 'bg-purple-600';
              if (selectedEvent.ownerType === 'student') return 'bg-indigo-600';
              return selectedEvent.type === 'activity' ? 'bg-green-600' : 'bg-blue-600';
            })()} text-white`}>
              <h3 className="text-lg font-bold">{t('course_details')}</h3>
              <button onClick={() => setSelectedEvent(null)} className="text-white hover:text-gray-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('course_name')}</label>
                <p className="text-lg font-medium text-gray-900">{selectedEvent.title}</p>
              </div>
              <div className="flex space-x-8">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('date')}</label>
                  <p className="text-gray-700">{format(selectedEvent.start, 'yyyy年MM月dd日', { locale: zhTW })}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('time')}</label>
                  <p className="text-gray-700">{format(selectedEvent.start, 'HH:mm')}</p>
                </div>
              </div>
              {selectedEvent.description && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('description_label')}</label>
                  <p className="text-gray-700 text-sm leading-relaxed">{selectedEvent.description}</p>
                </div>
              )}
              
              <div className="pt-4 border-t border-gray-100 space-y-3">
                {selectedEvent.courseId && (
                  <div className="mb-2">
                    {(() => {
                      const user = getStoredUser();
                      const roleParam = user?.role ? `&role=${encodeURIComponent(user.role)}` : '';
                      const href = `/classroom/wait?courseId=${encodeURIComponent(selectedEvent.courseId)}${roleParam}`;
                      return (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full inline-flex items-center justify-center px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium text-sm"
                        >
                          {t('enter_waiting_room')}
                        </a>
                      );
                    })()}
                  </div>
                )}
                {reminders[selectedEvent.id] ? (
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center text-sm text-indigo-600 bg-indigo-50 px-3 py-2 rounded-lg">
                      <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                      </svg>
                      {t('reminder_set_prefix')} {reminders[selectedEvent.id]} {t('reminder_set_suffix')}
                    </div>
                    <button
                      onClick={() => {
                        const newReminders = { ...reminders };
                        delete newReminders[selectedEvent.id];
                        saveReminders(newReminders);
                      }}
                      className="w-full flex items-center justify-center px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium text-sm"
                    >
                      {t('cancel_reminder')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowReminderModal(true)}
                    className="w-full flex items-center justify-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {t('set_time_reminder')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reminder Modal */}
      {showReminderModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{t('set_reminder_title')}</h3>
            <p className="text-sm text-gray-600 mb-4">{t('set_reminder_description')}</p>
            <select
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg mb-6 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              <option value="5">{t('mins_before_5')}</option>
              <option value="10">{t('mins_before_10')}</option>
              <option value="15">{t('mins_before_15')}</option>
              <option value="30">{t('mins_before_30')}</option>
              <option value="60">{t('mins_before_60')}</option>
              <option value="1440">{t('mins_before_1440')}</option>
            </select>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowReminderModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleSetReminder}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
