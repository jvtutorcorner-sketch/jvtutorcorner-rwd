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
  addWeeks,
  subWeeks,
  startOfYear,
  endOfYear,
  addYears,
  subYears,
  eachMonthOfInterval,
  isSameYear,
  setMonth,
  setDate,
  setHours,
  setMinutes,
  differenceInMinutes,
  getDay,
  subDays,
} from 'date-fns';
import { zhTW } from 'date-fns/locale';
import Button from './UI/Button';

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  description?: string;
  type: 'activity' | 'record';
  ownerType?: 'student' | 'teacher';
  courseId?: string;
  orderId?: string;
  teacherName?: string;
  studentName?: string;
  status?: 'upcoming' | 'ongoing' | 'interrupted' | 'absent' | 'finished';
}

interface CalendarProps {
  events: CalendarEvent[];
  view?: ViewType;
  onViewChange?: (view: ViewType) => void;
}

type ViewType = 'month' | 'week' | 'day' | 'year';

const Calendar: React.FC<CalendarProps> = ({ events, view: controlledView, onViewChange }) => {
  const t = useT();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [internalView, setInternalView] = useState<ViewType>('month');

  const view = controlledView || internalView;

  const setView = (v: ViewType) => {
    if (onViewChange) onViewChange(v);
    setInternalView(v);
  };
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


  const next = () => {
    switch (view) {
      case 'year':
        setCurrentDate(addYears(currentDate, 1));
        break;
      case 'month':
        setCurrentDate(addMonths(currentDate, 1));
        break;
      case 'week':
        setCurrentDate(addWeeks(currentDate, 1));
        break;
      case 'day':
        setCurrentDate(addDays(currentDate, 1));
        break;
    }
  };

  const prev = () => {
    switch (view) {
      case 'year':
        setCurrentDate(subYears(currentDate, 1));
        break;
      case 'month':
        setCurrentDate(subMonths(currentDate, 1));
        break;
      case 'week':
        setCurrentDate(subWeeks(currentDate, 1));
        break;
      case 'day':
        setCurrentDate(addDays(currentDate, -1));
        break;
    }
  };

  const renderHeader = () => {
    let titleFormat = 'yyyy年 MMMM';
    if (view === 'year') titleFormat = 'yyyy年';
    if (view === 'day') titleFormat = 'yyyy年MM月dd日 (eeee)';
    if (view === 'week') {
      const start = startOfWeek(currentDate, { locale: zhTW });
      const end = endOfWeek(currentDate, { locale: zhTW });
      // Custom format for week range if needed, or just show Month Year
      // Showing range: "2023年 10月 22日 - 10月 28日"
      return (
        <div className="flex flex-col md:flex-row items-center justify-between px-4 py-4 bg-white border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-semibold text-gray-900">
              {format(start, 'yyyy年MM月dd日', { locale: zhTW })} - {format(end, 'MM月dd日', { locale: zhTW })}
            </h2>
          </div>
          <div className="flex items-center space-x-2 mt-2 md:mt-0">
            <select
              value={view}
              onChange={(e) => setView(e.target.value as ViewType)}
              className="border border-gray-300 rounded-md text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="year">{t('calendar_view_year') || '年'}</option>
              <option value="month">{t('calendar_view_month') || '月'}</option>
              <option value="week">{t('calendar_view_week') || '週'}</option>
              <option value="day">{t('calendar_view_day') || '日'}</option>
            </select>

            <div className="flex items-center space-x-1">
              <Button onClick={prev} variant="outline" size="sm" className="p-1.5">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Button>
              <Button onClick={() => setCurrentDate(new Date())} variant="primary" size="sm" className="px-4">
                {t('today')}
              </Button>
              <Button onClick={next} variant="outline" size="sm" className="p-1.5">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-col md:flex-row items-center justify-between px-4 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center">
          <h2 className="text-xl font-semibold text-gray-900">
            {format(currentDate, titleFormat, { locale: zhTW })}
          </h2>
        </div>
        <div className="flex items-center space-x-2 mt-2 md:mt-0">
          <select
            value={view}
            onChange={(e) => setView(e.target.value as ViewType)}
            className="border border-gray-300 rounded-md text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="year">{t('calendar_view_year') || '年'}</option>
            <option value="month">{t('calendar_view_month') || '月'}</option>
            <option value="week">{t('calendar_view_week') || '週'}</option>
            <option value="day">{t('calendar_view_day') || '日'}</option>
          </select>

          <div className="flex items-center space-x-1">
            <Button onClick={prev} variant="outline" size="sm" className="p-1.5">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
            <Button onClick={() => setCurrentDate(new Date())} variant="primary" size="sm" className="px-4">
              {t('today')}
            </Button>
            <Button onClick={next} variant="outline" size="sm" className="p-1.5">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const getEventStyle = (event: CalendarEvent) => {
    // Priority: status -> ownerType -> type
    // Using vivid, high-contrast colors for each state
    let colorClass = 'bg-blue-500 text-white border border-blue-600';           // default: blue
    if (event.status === 'ongoing') colorClass = 'bg-emerald-500 text-white border border-emerald-600';  // 進行中：鮮綠
    else if (event.status === 'interrupted') colorClass = 'bg-orange-500 text-white border border-orange-600'; // 中斷：橘色
    else if (event.status === 'absent') colorClass = 'bg-rose-500 text-white border border-rose-600';  // 缺席：紅色
    else if (event.status === 'finished') colorClass = 'bg-slate-400 text-white border border-slate-500'; // 結束：灰
    else if (event.status === 'upcoming') {
      const now = new Date();
      if (now >= event.start) {
        // Class time has started but DB state is not ONGOING
        colorClass = 'bg-violet-500 text-white border border-violet-600'; // 未開始上課：紫
      } else {
        colorClass = 'bg-sky-500 text-white border border-sky-600';       // 即將開始：天藍
      }
    } else if (event.ownerType === 'teacher') colorClass = 'bg-violet-500 text-white border border-violet-600';
    else if (event.type === 'activity') colorClass = 'bg-sky-500 text-white border border-sky-600';         // 課程活動：天藍

    return colorClass;
  };

  const renderMonth = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { locale: zhTW });
    const endDate = endOfWeek(monthEnd, { locale: zhTW });

    const daysHeader = [t('day_sun'), t('day_mon'), t('day_tue'), t('day_wed'), t('day_thu'), t('day_fri'), t('day_sat')];

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const formattedDate = format(day, 'd');
        const cloneDay = day;
        const dayEvents = events.filter((event) => isSameDay(event.start, cloneDay));

        days.push(
          <div
            key={day.toString()}
            className={`min-h-[120px] border-r border-b border-gray-200 p-2 transition-colors cursor-pointer ${!isSameMonth(day, monthStart) ? 'bg-gray-50 text-gray-400' : 'bg-white text-gray-900'
              } ${isSameDay(day, new Date()) ? 'bg-blue-50' : ''}`}
            onClick={() => {
              setCurrentDate(cloneDay);
              setView('day');
            }}
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
                  className={`px-2 py-1 text-xs rounded-md cursor-pointer flex flex-col justify-between ${getEventStyle(event)} hover:shadow-sm transition-shadow`}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className="font-semibold truncate">{event.title}</span>
                    {event.teacherName && <span className="opacity-90 ml-1 text-[10px] whitespace-nowrap">{event.teacherName}</span>}
                  </div>
                  <div className="flex justify-between items-center w-full mt-0.5 text-[10px]">
                    <span className="whitespace-nowrap">{format(event.start, 'HH:mm')}</span>
                    {event.studentName && <span className="truncate opacity-90 ml-1 leading-tight">{event.studentName}</span>}
                  </div>
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

    return (
      <div className="flex flex-col h-full">
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
          {daysHeader.map((dayName) => (
            <div key={dayName} className="py-2 text-xs font-medium text-center text-gray-500 uppercase tracking-wider">
              {dayName}
            </div>
          ))}
        </div>
        <div className="bg-white border-l border-t border-gray-200 flex-1 overflow-y-auto">{rows}</div>
      </div>
    );
  };

  const renderYear = () => {
    const yearStart = startOfYear(currentDate);
    const months = eachMonthOfInterval({
      start: yearStart,
      end: endOfYear(yearStart)
    });

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 overflow-y-auto h-full">
        {months.map((month) => {
          const mStart = startOfMonth(month);
          const mEnd = endOfMonth(mStart);
          const dStart = startOfWeek(mStart, { locale: zhTW });
          const dEnd = endOfWeek(mEnd, { locale: zhTW });

          // Mini calendar logic
          const days = [];
          let day = dStart;
          while (day <= dEnd) {
            days.push(day);
            day = addDays(day, 1);
          }

          return (
            <div
              key={month.toString()}
              className="border border-gray-200 rounded-lg p-2 hover:shadow-md transition cursor-pointer bg-white"
              onClick={() => {
                setCurrentDate(month);
                setView('month');
              }}
            >
              <h3 className="text-center font-semibold text-gray-700 mb-2">{format(month, 'MMMM', { locale: zhTW })}</h3>
              <div className="grid grid-cols-7 gap-1 text-[0.6rem] text-center text-gray-400 mb-1">
                {['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {days.map((d, idx) => {
                  const isCurrMonth = isSameMonth(d, month);
                  const hasEvents = isCurrMonth && events.some(e => isSameDay(e.start, d));
                  return (
                    <div key={idx} className={`text-[0.65rem] h-5 w-5 flex items-center justify-center rounded-full mx-auto ${!isCurrMonth ? 'invisible' : ''
                      } ${isSameDay(d, new Date()) ? 'bg-blue-600 text-white font-bold' : (hasEvents ? 'bg-blue-100 text-blue-800 font-semibold' : 'text-gray-700')}`}>
                      {format(d, 'd')}
                    </div>
                  )
                })}
              </div>
            </div>
          );
        })}
      </div>
    )
  };

  const renderWeek = () => {
    const weekStart = startOfWeek(currentDate, { locale: zhTW });
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      weekDays.push(addDays(weekStart, i));
    }

    const hours = Array.from({ length: 24 }, (_, i) => i);

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header: Days of Week */}
        <div className="grid grid-cols-8 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="py-2 text-xs font-medium text-center text-gray-500 border-r border-gray-200">
            GMT+8
          </div>
          {weekDays.map((day) => (
            <div
              key={day.toString()}
              className={`py-2 text-center border-r border-gray-200 cursor-pointer hover:bg-gray-100 ${isSameDay(day, new Date()) ? 'bg-blue-50' : ''}`}
              onClick={() => {
                setCurrentDate(day);
                setView('day');
              }}
            >
              <div className={`text-xs font-medium uppercase ${isSameDay(day, new Date()) ? 'text-blue-600' : 'text-gray-500'}`}>
                {format(day, 'EEE', { locale: zhTW })}
              </div>
              <div className={`text-lg font-semibold ${isSameDay(day, new Date()) ? 'text-blue-600' : 'text-gray-900'}`}>
                {format(day, 'd')}
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable Time Grid */}
        <div className="flex-1 overflow-y-auto relative">
          <div className="grid grid-cols-8 min-h-[1440px]"> {/* 24h * 60px/h = 1440px height */}
            {/* Time Column */}
            <div className="border-r border-gray-200 bg-white">
              {hours.map((hour) => (
                <div key={hour} className="h-[60px] border-b border-gray-100 text-xs text-gray-400 text-right pr-2 relative -top-2.5">
                  {hour}:00
                </div>
              ))}
            </div>

            {/* Day Columns */}
            {weekDays.map((day) => {
              const dayEvents = events.filter((e) => isSameDay(e.start, day));

              // Calculate overlapping events layout
              const sortedEvents = [...dayEvents].sort((a, b) => a.start.getTime() - b.start.getTime());
              const columns: CalendarEvent[][] = [];
              const eventLayouts = new Map<string, { col: number; totalCols: number }>();

              for (const event of sortedEvents) {
                let colIndex = 0;
                while (columns[colIndex] && columns[colIndex].some(e =>
                  (event.start >= e.start && event.start < e.end) ||
                  (event.end > e.start && event.end <= e.end) ||
                  (event.start <= e.start && event.end >= e.end)
                )) {
                  colIndex++;
                }
                if (!columns[colIndex]) columns[colIndex] = [];
                columns[colIndex].push(event);
                eventLayouts.set(event.id, { col: colIndex, totalCols: 0 });
              }

              return (
                <div key={day.toString()} className="border-r border-gray-200 relative bg-white">
                  {hours.map((hour) => (
                    <div key={hour} className="h-[60px] border-b border-gray-100"></div>
                  ))}

                  {/* Events Positioning */}
                  {dayEvents.map(event => {
                    const startHour = event.start.getHours();
                    const startMin = event.start.getMinutes();
                    const top = (startHour * 60) + startMin;
                    const durationInMin = Math.max(30, differenceInMinutes(event.end, event.start));
                    const height = durationInMin;

                    const layout = eventLayouts.get(event.id);
                    const col = layout?.col || 0;
                    const totalCols = columns.length;
                    const width = 100 / totalCols;
                    const left = col * width;

                    return (
                      <div
                        key={event.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEvent(event);
                        }}
                        className={`absolute rounded px-2 py-1 text-xs cursor-pointer overflow-hidden border flex flex-col ${getEventStyle(event)} hover:z-10 hover:shadow-md transition-all`}
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          left: `${left}%`,
                          width: `${width}%`,
                        }}
                      >
                        <div className="flex justify-between items-center w-full">
                          <span className="font-semibold truncate">{event.title}</span>
                          {event.teacherName && <span className="opacity-90 ml-1 text-[10px] whitespace-nowrap">{event.teacherName}</span>}
                        </div>
                        <div className="flex justify-between items-start w-full mt-0.5 text-[10px]">
                          <span className="whitespace-nowrap">{format(event.start, 'HH:mm')}</span>
                          {event.studentName && <span className="truncate ml-1 opacity-90 text-right leading-tight">{event.studentName}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderDay = () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const dayEvents = events.filter((e) => isSameDay(e.start, currentDate));

    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto relative">
          <div className="flex min-h-[1440px]">
            {/* Time Column */}
            <div className="w-16 flex-shrink-0 border-r border-gray-200 bg-white">
              {hours.map((hour) => (
                <div key={hour} className="h-[60px] border-b border-gray-100 text-xs text-gray-400 text-right pr-2 relative -top-2.5">
                  {hour}:00
                </div>
              ))}
            </div>
            {/* Event Area */}
            <div className="flex-1 relative bg-white">
              {hours.map((hour) => (
                <div key={hour} className="h-[60px] border-b border-gray-100"></div>
              ))}
              {(() => {
                const sortedEvents = [...dayEvents].sort((a, b) => a.start.getTime() - b.start.getTime());
                const columns: CalendarEvent[][] = [];
                const eventLayouts = new Map<string, { col: number }>();

                for (const event of sortedEvents) {
                  let colIndex = 0;
                  while (columns[colIndex] && columns[colIndex].some(e =>
                    (event.start >= e.start && event.start < e.end) ||
                    (event.end > e.start && event.end <= e.end) ||
                    (event.start <= e.start && event.end >= e.end)
                  )) {
                    colIndex++;
                  }
                  if (!columns[colIndex]) columns[colIndex] = [];
                  columns[colIndex].push(event);
                  eventLayouts.set(event.id, { col: colIndex });
                }

                return dayEvents.map(event => {
                  const startHour = event.start.getHours();
                  const startMin = event.start.getMinutes();
                  const top = (startHour * 60) + startMin;
                  const durationInMin = Math.max(30, differenceInMinutes(event.end, event.start));
                  const height = durationInMin;

                  const layout = eventLayouts.get(event.id);
                  const col = layout?.col || 0;
                  const totalCols = columns.length;
                  const width = 100 / totalCols;
                  const left = col * width;

                  return (
                    <div
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEvent(event);
                      }}
                      className={`absolute rounded px-3 py-2 text-sm cursor-pointer overflow-hidden border flex flex-col ${getEventStyle(event)} hover:z-10 hover:shadow-md transition-all`}
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        left: `${left}%`,
                        width: `${width}%`
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-base flex flex-row items-center gap-2">
                          {event.title}
                          {event.teacherName && <span className="font-normal text-sm opacity-90">({event.teacherName})</span>}
                        </span>
                        <div className="flex flex-row items-center gap-3 text-sm opacity-90">
                          <span>{format(event.start, 'HH:mm')}</span>
                          {event.studentName && <span className="bg-black/10 px-1.5 py-0.5 rounded font-medium">{event.studentName}</span>}
                        </div>
                      </div>
                      {event.description && <div className="text-xs mt-1 truncate">{event.description}</div>}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      </div>
    )
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

      {/* 狀態圖例 (Status Legend) */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs">
        <span className="font-semibold text-gray-600 mr-2">課程狀態標示：</span>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 rounded-full bg-violet-500 border border-violet-600"></div>
          <span className="text-gray-700">未開始上課</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 rounded-full bg-sky-500 border border-sky-600"></div>
          <span className="text-gray-700">即將開始</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 rounded-full bg-emerald-500 border border-emerald-600"></div>
          <span className="text-gray-700">進行中</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 rounded-full bg-slate-400 border border-slate-500"></div>
          <span className="text-gray-700">已結束</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 rounded-full bg-orange-500 border border-orange-600"></div>
          <span className="text-gray-700">中斷</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 rounded-full bg-rose-500 border border-rose-600"></div>
          <span className="text-gray-700">缺席</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {view === 'month' && renderMonth()}
        {view === 'year' && renderYear()}
        {view === 'week' && renderWeek()}
        {view === 'day' && renderDay()}
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className={`px-6 py-4 flex justify-between items-center ${(() => {
              if (selectedEvent.status === 'ongoing') return 'bg-emerald-600';
              if (selectedEvent.status === 'interrupted') return 'bg-orange-600';
              if (selectedEvent.status === 'absent') return 'bg-rose-600';
              if (selectedEvent.status === 'finished') return 'bg-slate-500';
              if (selectedEvent.status === 'upcoming') {
                return selectedEvent.ownerType === 'teacher' ? 'bg-violet-600' : 'bg-sky-600';
              }
              if (selectedEvent.ownerType === 'teacher') return 'bg-violet-600';
              if (selectedEvent.ownerType === 'student') return 'bg-sky-600';
              return 'bg-blue-600';
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
                <div className="flex items-center space-x-2">
                  <p className="text-lg font-medium text-gray-900">{selectedEvent.title}</p>
                  {selectedEvent.teacherName && (
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
                      {selectedEvent.teacherName}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex space-x-8">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('date')}</label>
                  <p className="text-gray-700">{format(selectedEvent.start, 'yyyy年MM月dd日', { locale: zhTW })}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('time')}</label>
                  <div className="flex items-center space-x-2">
                    <p className="text-gray-700">{format(selectedEvent.start, 'HH:mm')}</p>
                    {selectedEvent.studentName && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                        {selectedEvent.studentName}
                      </span>
                    )}
                  </div>
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
                      const orderParam = selectedEvent.orderId ? `&orderId=${encodeURIComponent(selectedEvent.orderId)}` : '';
                      const href = `/classroom/wait?courseId=${encodeURIComponent(selectedEvent.courseId)}${roleParam}${orderParam}`;
                      return (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full inline-flex items-center justify-center px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium text-sm shadow-sm"
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
                      className="w-full flex items-center justify-center px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium text-sm shadow-sm"
                    >
                      {t('cancel_reminder')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowReminderModal(true)}
                    className="w-full flex items-center justify-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-sm"
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
              <Button onClick={() => setShowReminderModal(false)} variant="outline" className="flex-1">
                {t('cancel')}
              </Button>
              <Button onClick={handleSetReminder} variant="primary" className="flex-1">
                {t('confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
