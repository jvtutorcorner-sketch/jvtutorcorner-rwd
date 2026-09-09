import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { COURSES } from '@/data/courses';
import LocalDate from '@/components/LocalDate';
import { T } from '@/components/IntlProvider';
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
          <h1><T k="course_not_found_title" /></h1>
          <p><T k="course_not_found_desc" /></p>
        </header>
        <Link href="/courses" className="card-button">
          <T k="course_back_to_list" />
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


  return (
    <div className="page">
      <header className="page-header">
        <h1>{title}</h1>
        <p>
          {subject}｜{level}｜<T k={mode === 'online' ? 'online_course' : 'offline_course'} />
        </p>
      </header>

      <div className="course-layout">
        <section className="course-main">
          <div className="course-section">
            <h2><T k="course_intro_title" /></h2>
            <p>{description || <T k="course_intro_default" />}</p>
          </div>

          {/* Interactive whiteboard removed */}

          <div className="course-section">
            <h2><T k="course_audience_title" /></h2>
            <ul>
              <li><T k="course_audience_1" vars={{ subject }} /></li>
              <li><T k="course_audience_2" /></li>
              <li><T k="course_audience_3" /></li>
            </ul>
          </div>

          <div className="course-section">
            <h2><T k="course_tags_title" /></h2>
            <div className="card-tags">
              {(tags || []).map((tag: string) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </section>

        <aside className="course-side">
          <div className="course-side-card">
            <h3><T k="course_info_title" /></h3>
            <div className="info-row">
              <span><T k="course_info_teacher" /></span>
              <span>{teacherName}</span>
            </div>
            <div className="info-row">
              <span><T k="course_info_language" /></span>
              <span>{language}</span>
            </div>
            <div className="info-row">
              <span><T k="course_info_duration" /></span>
              <span><T k="course_info_minutes" vars={{ count: durationMinutes }} /></span>
            </div>
            <div className="info-row">
              <span><T k="course_info_period" /></span>
              <span>
                <LocalDate value={startDate || nextStartDate} fallback="TBD" /> ~ <LocalDate value={endDate} fallback="TBD" />
              </span>
            </div>
            {pointCost && (
              <div className="info-row">
                <span><T k="course_info_points_label" /></span>
                <span style={{ color: '#7c3aed', fontWeight: 600 }}>
                  <T k="course_info_points_value" vars={{ count: pointCost }} />
                  {enrollmentType === 'both' && <span style={{ marginLeft: 6, fontSize: '0.8rem', color: '#6b7280' }}><T k="course_info_points_either" /></span>}
                  {enrollmentType === 'points' && <span style={{ marginLeft: 6, fontSize: '0.8rem', color: '#6b7280' }}><T k="course_info_points_only" /></span>}
                </span>
              </div>
            )}
            {totalSessions && (
              <div className="info-row">
                <span><T k="course_info_total_sessions" /></span>
                <span><T k="course_info_sessions_value" vars={{ count: totalSessions }} /></span>
              </div>
            )}

            {typeof seatsLeft === 'number' && (
              <div className="info-row">
                <span><T k="course_info_seats_left" /></span>
                <span><T k="course_info_seats_value" vars={{ count: seatsLeft }} /></span>
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
