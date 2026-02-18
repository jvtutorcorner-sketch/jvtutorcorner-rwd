import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { COURSES } from '@/data/courses';
import { EnrollButton } from '@/components/EnrollButton';
import Link from 'next/link';

export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Fetch course from DynamoDB
  let course: any = null;
  try {
    const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
    const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';

    const getCmd = new GetCommand({ TableName: COURSES_TABLE, Key: { id } });
    const result = await ddbDocClient.send(getCmd);
    course = result.Item || null;

    if (course && course.teacherId) {
      try {
        const tRes = await ddbDocClient.send(new GetCommand({ TableName: TEACHERS_TABLE, Key: { id: course.teacherId } }));
        if (tRes.Item && (tRes.Item.name || tRes.Item.displayName)) {
          course.teacherName = tRes.Item.name || tRes.Item.displayName;
        }
      } catch (e) { }
    }
  } catch (e) {
    console.error('[CourseDetailPage] DynamoDB get error:', e);
  }

  // If not in DynamoDB, check bundled COURSES
  if (!course) {
    course = COURSES.find((c) => c.id === id);
  }

  if (!course) {
    // 找不到課程，簡單顯示一個提示，並給一個回列表的按鈕
    return (
      <div className="page">
        <header className="page-header">
          <h1>找不到課程</h1>
          <p>這個課程可能已下架，請回到課程列表重新選擇。</p>
        </header>
        <Link href="/courses" className="card-button">
          回課程列表
        </Link>
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
    startDate,
    endDate,
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
              {tags.map((tag: string) => (
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
              <span>單堂時長</span>
              <span>{durationMinutes} 分鐘</span>
            </div>
            {(startDate || endDate) && (
              <div className="info-row">
                <span>開課期間</span>
                <span>
                  {startDate || 'TBD'} ~ {endDate || 'TBD'}
                </span>
              </div>
            )}
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
