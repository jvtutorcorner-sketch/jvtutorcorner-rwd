import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { COURSES } from '@/data/courses';
import { EnrollButton } from '@/components/EnrollButton';
import AutoTranslateText from '@/components/AutoTranslateText';
import { ServerT } from '@/components/IntlProvider';
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
          <h1><ServerT k="course_not_found_title" /></h1>
          <p><ServerT k="course_not_found_message" /></p>
        </header>
        <Link href="/courses" className="card-button">
          <ServerT k="course_not_found_back_button" />
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
    startTime,
    endTime,
    totalSessions,
    seatsLeft,
    currency = 'TWD',
    pointCost,
    enrollmentType,
  } = course;

  const formatDate = (val: any) => {
    if (!val) return 'TBD';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return String(val);
      return d.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).replace(/\//g, '-');
    } catch (e) {
      return String(val);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1><AutoTranslateText text={title} as="span" /></h1>
        <p>
          <AutoTranslateText text={subject} as="span" />｜<AutoTranslateText text={level} as="span" />｜<ServerT k={mode === 'online' ? 'online_course' : 'offline_course'} />
        </p>
      </header>

      <div className="course-layout">
        <section className="course-main">
          <div className="course-section">
            <h2><ServerT k="course_intro_title" /></h2>
            <AutoTranslateText text={description || '這是一門精心設計的主題式課程。'} as="p" />
          </div>

          {/* Interactive whiteboard removed */}

          <div className="course-section">
            <h2><ServerT k="course_target_audience_title" /></h2>
            <ul>
              <li><ServerT k="course_audience_bullet1" vars={{ subject }} /></li>
              <li><ServerT k="course_audience_bullet2" /></li>
              <li><ServerT k="course_audience_bullet3" /></li>
            </ul>
          </div>

          <div className="course-section">
            <h2><ServerT k="course_tags_title" /></h2>
            <div className="card-tags">
              {(tags || []).map((tag: string) => (
                <span key={tag} className="tag">
                  <AutoTranslateText text={tag} as="span" />
                </span>
              ))}
            </div>
          </div>
        </section>

        <aside className="course-side">
          <div className="course-side-card">
            <h3><ServerT k="course_info_title" /></h3>
            <div className="info-row">
              <span><ServerT k="course_info_teacher_label" /></span>
              <span><AutoTranslateText text={teacherName} as="span" /></span>
            </div>
            <div className="info-row">
              <span><ServerT k="course_info_language_label" /></span>
              <span><AutoTranslateText text={language} as="span" /></span>
            </div>
            <div className="info-row">
              <span><ServerT k="course_info_duration_label" /></span>
              <span>{durationMinutes} <ServerT k="minutes" /></span>
            </div>
            <div className="info-row">
              <span><ServerT k="course_info_period_label" /></span>
              <span>
                {formatDate(startDate || nextStartDate)} ~ {formatDate(endDate)}
              </span>
            </div>
            {pointCost && (
              <div className="info-row">
                <span><ServerT k="course_info_points_required_label" /></span>
                <span style={{ color: '#7c3aed', fontWeight: 600 }}>
                  {pointCost} <ServerT k="points_per_session_suffix" />
                  {enrollmentType === 'both' && <span style={{ marginLeft: 6, fontSize: '0.8rem', color: '#6b7280' }}><ServerT k="course_enrollment_both_hint" /></span>}
                  {enrollmentType === 'points' && <span style={{ marginLeft: 6, fontSize: '0.8rem', color: '#6b7280' }}><ServerT k="course_enrollment_points_only_hint" /></span>}
                </span>
              </div>
            )}
            {totalSessions && (
              <div className="info-row">
                <span><ServerT k="course_info_total_sessions_label" /></span>
                <span>{totalSessions} <ServerT k="per_session" /></span>
              </div>
            )}

            {typeof seatsLeft === 'number' && (
              <div className="info-row">
                <span><ServerT k="course_info_seats_left_label" /></span>
                <span>{seatsLeft} <ServerT k="unit_seats" /></span>
              </div>
            )}


            <div style={{ marginTop: 16 }}>
              <EnrollButton
                courseId={course.id}
                courseTitle={course.title}
                requiredPlan={course.requiredPlan || 'basic'}
                price={pricePerSession || 0}
                currency={currency || 'TWD'}
                durationMinutes={durationMinutes || 0}
                pointCost={pointCost}
                enrollmentType={enrollmentType}
                startDate={startDate || nextStartDate}
                endDate={endDate}
              />
            </div>

          </div>
        </aside>
      </div>
    </div>
  );
}
