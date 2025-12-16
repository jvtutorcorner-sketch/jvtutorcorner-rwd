
"use client";

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useEffect, useState } from 'react';
import { COURSES } from '@/data/courses';
import { EnrollButton } from '@/components/EnrollButton';
import { getStoredUser } from '@/lib/mockAuth';

export default function CourseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id as string | undefined;

  const course = useMemo(
    () => (id ? COURSES.find((c) => c.id === id) : undefined),
    [id]
  );

  if (!id || !course) {
    // 找不到課程，簡單顯示一個提示，並給一個回列表的按鈕
    return (
      <div className="page">
        <header className="page-header">
          <h1>找不到課程</h1>
          <p>這個課程可能已下架，請回到課程列表重新選擇。</p>
        </header>
        <button
          className="card-button"
          onClick={() => router.push('/courses')}
        >
          回課程列表
        </button>
      </div>
    );
  }

  const {
    title,
    subject,
    level,
    language,
    teacherName,
    pricePerSession,
    durationMinutes,
    tags,
    mode,
    description,
    nextStartDate,
    totalSessions,
    seatsLeft,
    currency = 'TWD',
  } = course;

  return (
    <div className="page">
      <header className="page-header">
        <h1>{title}</h1>
        <p>
          {subject}｜{level}｜{mode === 'online' ? '線上課程' : '實體課程'}
        </p>
      </header>

      <div className="course-layout">
        <section className="course-main">
          <div className="course-section">
            <h2>課程介紹</h2>
            <p>{description || '這是一門精心設計的主題式課程。'}</p>
          </div>

          {/* Interactive whiteboard removed */}

          <div className="course-section">
            <h2>適合對象</h2>
            <ul>
              <li>希望在 {subject} 有系統進步的學生或上班族。</li>
              <li>可以配合每週固定時間上課。</li>
              <li>願意課後花時間做練習與複習。</li>
            </ul>
          </div>

          <div className="course-section">
            <h2>課程標籤</h2>
            <div className="card-tags">
              {tags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </section>

        <aside className="course-side">
          <div className="course-side-card">
            <h3>課程資訊</h3>
            <div className="info-row">
              <span>授課老師</span>
              <span>{teacherName}</span>
            </div>
            <div className="info-row">
              <span>課程語言</span>
              <span>{language}</span>
            </div>
            <div className="info-row">
              <span>單堂費用</span>
              <span>
                {currency === 'TWD' ? 'NT$ ' : ''}
                {pricePerSession}/堂
              </span>
            </div>
            <div className="info-row">
              <span>單堂時長</span>
              <span>{durationMinutes} 分鐘</span>
            </div>
            {totalSessions && (
              <div className="info-row">
                <span>總堂數</span>
                <span>{totalSessions} 堂</span>
              </div>
            )}
            {nextStartDate && (
              <div className="info-row">
                <span>下一梯次</span>
                <span>{nextStartDate}</span>
              </div>
            )}
            {typeof seatsLeft === 'number' && (
              <div className="info-row">
                <span>剩餘名額</span>
                <span>{seatsLeft} 位</span>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <EnrollButton courseId={course.id} courseTitle={course.title} />
            </div>

            {/* Session duration setting (teacher only) */}
            <div style={{ marginTop: 12 }}>
              <h4>課堂倒數時間（分鐘）</h4>
              <CourseSessionDurationEditor courseId={course.id} teacherName={teacherName} defaultMinutes={(course as any).sessionDurationMinutes ?? 50} />
            </div>

            <p className="course-side-note">
              目前為示範環境，報名資料只會暫存在前端並輸出到 console。
              之後可以在這裡串接 Stripe / 跨國金流或本地第三方支付，
              完成線上刷卡與訂單建立。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CourseSessionDurationEditor({ courseId, teacherName, defaultMinutes }: { courseId: string; teacherName: string; defaultMinutes: number }) {
  const [minutes, setMinutes] = useState<number>(defaultMinutes);
  const [editing, setEditing] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);

  useEffect(() => {
    try {
      const u = getStoredUser();
      if (u) {
        const admin = u.role === 'admin';
        const teacher = Boolean(u.role === 'teacher' || (u.displayName && teacherName && u.displayName.includes(teacherName)));
        setIsTeacher(admin || teacher);
      }
    } catch (e) {}

    try {
      const raw = localStorage.getItem(`course_session_duration_${courseId}`);
      if (raw) setMinutes(Number(raw));
    } catch (e) {}
  }, [courseId, teacherName]);

  const save = () => {
    try {
      localStorage.setItem(`course_session_duration_${courseId}`, String(minutes));
      setEditing(false);
      alert('已儲存課堂倒數時間設定');
    } catch (e) {
      console.warn('save duration failed', e);
      alert('儲存失敗');
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 8 }}>{minutes} 分鐘</div>
      {isTeacher ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="number" value={minutes} min={1} max={240} onChange={(e) => setMinutes(Number(e.target.value || 0))} style={{ width: 80 }} />
          <button onClick={save}>儲存</button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#666' }}>僅授課者可編輯</div>
      )}
    </div>
  );
}
