"use client";

import { useEffect, useState } from "react";
import { COURSE_RECORDS } from "@/data/courseRecords";

type EscrowRecord = {
  escrowId: string;
  orderId: string;
  enrollmentId: string;
  studentId: string;
  teacherId: string;
  courseId: string;
  courseTitle: string;
  points: number;
  status: 'HOLDING' | 'RELEASED' | 'REFUNDED';
  createdAt: string;
  updatedAt: string;
  releasedAt?: string;
  refundedAt?: string;
};

type CourseInfo = {
  title?: string;
  teacherName?: string;
  durationMinutes?: number;
  totalSessions?: number;
  startDate?: string;
  nextStartDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
};

type UserInfo = {
  firstName?: string;
  lastName?: string;
};

interface TeacherEscrowManagerProps {
  teacherId?: string;
}

export default function TeacherEscrowManager({ teacherId }: TeacherEscrowManagerProps) {
  const [escrows, setEscrows] = useState<EscrowRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'RELEASED' | 'HOLDING' | 'REFUNDED' | 'ALL'>('ALL');
  const [totalPoints, setTotalPoints] = useState<number>(0);
  const [expandedEscrowId, setExpandedEscrowId] = useState<string | null>(null);
  const [courseMap, setCourseMap] = useState<Record<string, CourseInfo>>({});
  const [userMap, setUserMap] = useState<Record<string, UserInfo>>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (teacherId) {
        q.set('teacherId', teacherId);
      }
      if (filterStatus !== 'ALL') {
        q.set('status', filterStatus);
      }

      const res = await fetch(`/api/points-escrow?${q.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load escrow records');
      
      const records = data.data || [];
      setEscrows(records);
      
      // Calculate total points for RELEASED records
      const total = records
        .filter((r: EscrowRecord) => r.status === 'RELEASED')
        .reduce((sum: number, r: EscrowRecord) => sum + r.points, 0);
      setTotalPoints(total);

      // Fetch course and user details
      const courseIds = Array.from(new Set(records.map((r: EscrowRecord) => r.courseId).filter(Boolean))) as string[];
      const studentIds = Array.from(new Set(records.map((r: EscrowRecord) => r.studentId).filter(Boolean))) as string[];
      
      if (courseIds.length > 0) {
        await fetchCourseDetails(courseIds);
      }
      if (studentIds.length > 0) {
        await fetchUserDetails(studentIds);
      }
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function fetchCourseDetails(courseIds: string[]) {
    const courseFetches = courseIds.map((cid) =>
      fetch(`/api/courses?id=${encodeURIComponent(cid)}`)
        .then((r) => r.json())
        .then((j) =>
          j && j.ok && j.course
            ? {
                title: j.course.title,
                teacherName: j.course.teacherName || j.course.teacher || null,
                durationMinutes: j.course.durationMinutes,
                totalSessions: j.course.totalSessions,
                startDate: j.course.startDate || null,
                nextStartDate: j.course.nextStartDate || null,
                endDate: j.course.endDate || null,
                startTime: j.course.startTime || null,
                endTime: j.course.endTime || null,
              }
            : null
        )
        .catch(() => null)
    );

    const results = await Promise.all(courseFetches);
    const map: Record<string, CourseInfo> = {};
    courseIds.forEach((id, idx) => {
      const c = results[idx] as CourseInfo | null;
      if (c) map[id] = c;
    });
    setCourseMap(map);
  }

  async function fetchUserDetails(studentIds: string[]) {
    const userFetches = studentIds.map((sid) =>
      fetch(`/api/profile?email=${encodeURIComponent(sid)}`)
        .then((r) => r.json())
        .then((j) =>
          j && j.ok && j.profile
            ? { firstName: j.profile.firstName, lastName: j.profile.lastName }
            : null
        )
        .catch(() => null)
    );

    const results = await Promise.all(userFetches);
    const map: Record<string, UserInfo> = {};
    studentIds.forEach((id, idx) => {
      const u = results[idx] as UserInfo | null;
      if (u) map[id] = u;
    });
    setUserMap(map);
  }

  useEffect(() => {
    load();
  }, [filterStatus, teacherId]);

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Taipei',
      });
    } catch {
      return dateString;
    }
  };

  const formatDateTime = (value: any) => {
    if (!value) return '-';
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Taipei',
        hour12: false
      }).replace(/\//g, '-');
    } catch (e) {
      return String(value);
    }
  };

  const cleanTimeString = (timeStr: any): string => {
    if (!timeStr) return '';
    let cleaned = String(timeStr).trim();
    const isPM = /PM|pm|下午/.test(cleaned);
    const isAM = /AM|am|上午/.test(cleaned);
    cleaned = cleaned.replace(/[\u4e0a\u4e0b]\u5348/g, '').trim();
    cleaned = cleaned.replace(/\s*(AM|PM|am|pm)\s*/g, '').trim();
    if (cleaned.includes('T')) {
      cleaned = cleaned.split('T')[1].split('.')[0].replace('Z', '');
    }
    const timeMatch = cleaned.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2].padStart(2, '0');
      const seconds = (timeMatch[3] || '00').padStart(2, '0');
      if (isPM && hours < 12) hours += 12;
      if (isAM && hours === 12) hours = 0;
      return `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
    }
    return '';
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'RELEASED':
        return '已入帳';
      case 'HOLDING':
        return '等待釋放';
      case 'REFUNDED':
        return '已退款';
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RELEASED':
        return '#4caf50'; // Green
      case 'HOLDING':
        return '#ff9800'; // Orange
      case 'REFUNDED':
        return '#f44336'; // Red
      default:
        return '#999';
    }
  };

  const getRemainingInfo = (courseId: string) => {
    const total = courseMap[courseId]?.totalSessions || 0;
    const attended = COURSE_RECORDS.filter(r => r.courseId === courseId && r.status === 'attended').length;
    const remaining = Math.max(0, total - attended);
    const duration = courseMap[courseId]?.durationMinutes || 0;
    const remainingMinutes = remaining * duration;
    return { remaining, remainingMinutes };
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>老師點數暫存記錄</h2>

      {error && (
        <div style={{ color: '#d32f2f', padding: '10px', marginBottom: '20px', backgroundColor: '#ffebee', borderRadius: '4px' }}>
          Error: {error}
        </div>
      )}

      {/* Filter Section */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
        <label style={{ marginRight: '15px' }}>
          <strong>狀態篩選：</strong>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            style={{ marginLeft: '10px', padding: '5px', minWidth: '150px' }}
          >
            <option value="RELEASED">已入帳</option>
            <option value="HOLDING">等待釋放</option>
            <option value="REFUNDED">已退款</option>
            <option value="ALL">全部</option>
          </select>
        </label>
      </div>

      {/* Summary Section */}
      {filterStatus === 'RELEASED' && (
        <div style={{
          padding: '15px',
          marginBottom: '20px',
          backgroundColor: '#c8e6c9',
          borderLeft: '4px solid #4caf50',
          borderRadius: '4px'
        }}>
          <strong>老師已入帳點數總計：</strong> <span style={{ fontSize: '20px', color: '#2e7d32', fontWeight: 'bold' }}>{totalPoints}</span> 點
        </div>
      )}

      {/* Loading State */}
      {loading && <p>加載中...</p>}

      {/* Empty State */}
      {!loading && escrows.length === 0 && (
        <p style={{ color: '#999', textAlign: 'center', padding: '40px' }}>
          尚無記錄
        </p>
      )}

      {/* Records Table */}
      {!loading && escrows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="orders-table" style={{ borderCollapse: 'collapse', border: '2px solid #ccc', width: '100%', marginTop: '15px' }}>
            <thead>
              <tr>
                <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>學生</th>
                <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>課程名稱</th>
                <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>老師</th>
                <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'center' }}>單堂時間(分)</th>
                <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'center' }}>剩餘課程數</th>
                <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'center' }}>剩餘時間(分)</th>
                <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>開始時間</th>
                <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>結束時間</th>
                <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'center' }}>點數</th>
                <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>點數入帳時間</th>
                <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'center' }}>狀態</th>
                <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'center' }}>詳情</th>
              </tr>
            </thead>
            <tbody>
              {escrows.map((record) => {
                const { remaining, remainingMinutes } = getRemainingInfo(record.courseId);
                const studentName = userMap[record.studentId]
                  ? `${userMap[record.studentId].firstName || ''} ${userMap[record.studentId].lastName || ''}`.trim()
                  : record.studentId;
                const courseInfo = courseMap[record.courseId];
                const startDateTime = (() => {
                  const c = courseInfo;
                  if (!c) return '-';
                  const rawDatePart = c.nextStartDate || c.startDate;
                  if (!rawDatePart) return '-';
                  const datePart = rawDatePart.split('T')[0];
                  const cleanedTime = cleanTimeString(c.startTime);
                  if (!cleanedTime) {
                    return formatDateTime(`${datePart}T09:00:00`);
                  }
                  return formatDateTime(`${datePart}T${cleanedTime}`);
                })();
                const endDateTime = (() => {
                  const c = courseInfo;
                  if (!c) return '-';
                  const rawDatePart = c.nextStartDate || c.startDate;
                  if (!rawDatePart) return '-';
                  const datePart = rawDatePart.split('T')[0];
                  const cleanedTime = cleanTimeString(c.endTime);
                  if (!cleanedTime) {
                    return formatDateTime(`${datePart}T10:00:00`);
                  }
                  return formatDateTime(`${datePart}T${cleanedTime}`);
                })();

                return (
                  <tr
                    key={record.escrowId}
                    style={{
                      borderBottom: '2px solid #ccc',
                      backgroundColor: expandedEscrowId === record.escrowId ? '#f9f9f9' : 'white',
                    }}
                  >
                    <td data-label="學生" style={{ border: '2px solid #ccc', padding: '6px' }}>
                      {studentName}
                    </td>
                    <td data-label="課程名稱" style={{ border: '2px solid #ccc', padding: '6px' }}>
                      <strong>{record.courseTitle}</strong>
                    </td>
                    <td data-label="老師" style={{ border: '2px solid #ccc', padding: '6px' }}>
                      {courseInfo?.teacherName || '-'}
                    </td>
                    <td data-label="單堂時間(分)" style={{ border: '2px solid #ccc', padding: '6px', textAlign: 'center' }}>
                      {courseInfo?.durationMinutes || '-'}
                    </td>
                    <td data-label="剩餘課程數" style={{ border: '2px solid #ccc', padding: '6px', textAlign: 'center' }}>
                      {remaining}
                    </td>
                    <td data-label="剩餘時間(分)" style={{ border: '2px solid #ccc', padding: '6px', textAlign: 'center' }}>
                      {remainingMinutes} m
                    </td>
                    <td data-label="開始時間" style={{ border: '2px solid #ccc', padding: '6px', fontSize: '12px' }}>
                      {startDateTime}
                    </td>
                    <td data-label="結束時間" style={{ border: '2px solid #ccc', padding: '6px', fontSize: '12px' }}>
                      {endDateTime}
                    </td>
                    <td data-label="點數" style={{ border: '2px solid #ccc', padding: '6px', textAlign: 'center', fontWeight: 'bold', color: '#2e7d32' }}>
                      +{record.points}
                    </td>
                    <td data-label="點數入帳時間" style={{ border: '2px solid #ccc', padding: '6px', fontSize: '12px' }}>
                      {record.releasedAt ? formatDate(record.releasedAt) : '-'}
                    </td>
                    <td data-label="狀態" style={{ border: '2px solid #ccc', padding: '6px', textAlign: 'center' }}>
                      <span
                        style={{
                          padding: '4px 8px',
                          backgroundColor: getStatusColor(record.status),
                          color: 'white',
                          borderRadius: '3px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                        }}
                      >
                        {getStatusLabel(record.status)}
                      </span>
                    </td>
                    <td data-label="詳情" style={{ border: '2px solid #ccc', padding: '6px', textAlign: 'center' }}>
                      <button
                        onClick={() =>
                          setExpandedEscrowId(
                            expandedEscrowId === record.escrowId ? null : record.escrowId
                          )
                        }
                        style={{
                          padding: '5px 10px',
                          backgroundColor: '#2196f3',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        {expandedEscrowId === record.escrowId ? '收起' : '詳情'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Expanded Details Section */}
      {expandedEscrowId && escrows.find((e) => e.escrowId === expandedEscrowId) && (
        <div
          style={{
            marginTop: '20px',
            padding: '15px',
            backgroundColor: '#f9f9f9',
            border: '1px solid #ddd',
            borderRadius: '4px',
          }}
        >
          <h3>詳細資訊</h3>
          {(() => {
            const record = escrows.find((e) => e.escrowId === expandedEscrowId)!;
            const studentName = userMap[record.studentId]
              ? `${userMap[record.studentId].firstName || ''} ${userMap[record.studentId].lastName || ''}`.trim()
              : record.studentId;
            return (
              <table style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '8px', fontWeight: 'bold', width: '150px' }}>Escrow ID:</td>
                    <td style={{ padding: '8px', fontFamily: 'monospace' }}>{record.escrowId}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>訂單 ID:</td>
                    <td style={{ padding: '8px', fontFamily: 'monospace' }}>{record.orderId}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>課程 ID:</td>
                    <td style={{ padding: '8px', fontFamily: 'monospace' }}>{record.courseId}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>課程名稱:</td>
                    <td style={{ padding: '8px' }}>{record.courseTitle}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>學生:</td>
                    <td style={{ padding: '8px' }}>{studentName}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>點數:</td>
                    <td style={{ padding: '8px', fontWeight: 'bold', color: '#2e7d32' }}>+{record.points}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>狀態:</td>
                    <td style={{ padding: '8px' }}>
                      <span
                        style={{
                          padding: '4px 8px',
                          backgroundColor: getStatusColor(record.status),
                          color: 'white',
                          borderRadius: '3px',
                          fontWeight: 'bold',
                        }}
                      >
                        {getStatusLabel(record.status)}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>建立時間:</td>
                    <td style={{ padding: '8px' }}>{formatDate(record.createdAt)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>點數入帳時間:</td>
                    <td style={{ padding: '8px' }}>
                      {record.releasedAt ? formatDate(record.releasedAt) : '-'}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>退款時間:</td>
                    <td style={{ padding: '8px' }}>
                      {record.refundedAt ? formatDate(record.refundedAt) : '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
            );
          })()}
        </div>
      )}
    </div>
  );
}
