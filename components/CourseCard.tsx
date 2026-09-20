// components/CourseCard.tsx
"use client";
import { TEACHERS } from '@/data/teachers';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useT } from './IntlProvider';
import { subjectKey } from '@/lib/subjectI18n';

/**
 * 課程卡可能來自 bundled COURSES、DynamoDB（含 seatsOccupied）或推薦 API
 * （欄位為 category 而非 subject）。欄位不固定，以寬鬆型別容納這些來源。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CourseLike = Record<string, any>;

interface CourseCardProps {
  course: CourseLike;
  className?: string;
}

/** 依科目字串產生穩定的色相，讓封面配色一致又多樣。 */
function hueFromString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) % 360;
  }
  return hash;
}

export const CourseCard: React.FC<CourseCardProps> = ({ course, className = "" }) => {
  const router = useRouter();
  const t = useT();
  const tt = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  // 科目：推薦 API 用 category，其餘用 subject
  const subjectValue = String(course.subject || course.category || '');
  const subjectLabel = subjectValue ? tt(subjectKey(subjectValue), subjectValue) : '';
  const levelLabel = course.level ? tt(`courses.${course.id}.level`, course.level) : '';
  const title = tt(`courses.${course.id}.title`, course.title);
  const description = course.description
    ? tt(`courses.${course.id}.description`, course.description)
    : '';

  // 封面配色（無真實封面圖，用科目漸層 + 科目字樣）
  const hue = hueFromString(subjectValue || title);
  const coverStyle = {
    background: `linear-gradient(135deg, hsl(${hue} 70% 62%), hsl(${(hue + 40) % 360} 72% 48%))`,
  };

  // 價格：優先點數，其次單堂價
  const pointCost = typeof course.pointCost === 'number' ? course.pointCost : undefined;
  const perSession = typeof course.pricePerSession === 'number' ? course.pricePerSession : undefined;

  // 真實報名人數（decorateCoursesWithSeats 附上的 seatsOccupied），0 或未知不顯示
  const enrolled = typeof course.seatsOccupied === 'number' ? course.seatsOccupied : 0;

  // try to find a teacher id from the bundled TEACHERS data by name
  const teacherMatch = TEACHERS.find((tm) => String(tm.name || '').trim().toLowerCase() === String(course.teacherName || '').trim().toLowerCase());
  const teacherHref = teacherMatch
    ? `/teachers/${encodeURIComponent(String(teacherMatch.id))}`
    : `/teachers?teacher=${encodeURIComponent(String(course.teacherName || ''))}`;

  return (
    <Link href={`/courses/${course.id}`} className={`card course-card ${className}`}>
      <div className="course-card-cover" style={coverStyle}>
        <span className="course-card-cover-subject">{subjectLabel || title}</span>
        {enrolled > 0 && (
          <span className="course-card-badge">{t('course_enrolled_count', { count: enrolled })}</span>
        )}
      </div>

      <div className="course-card-body">
        <h3 className="card-title course-card-title">{title}</h3>
        {(subjectLabel || levelLabel) && (
          <p className="card-subtitle">
            {[subjectLabel, levelLabel].filter(Boolean).join('｜')}
          </p>
        )}

        <p className="course-card-teacher">
          {t('teacher_label')}
          <span
            role="link"
            tabIndex={0}
            className="inline-link teacher-name"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              router.push(teacherHref);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                router.push(teacherHref);
              }
            }}
          >
            {teacherMatch ? tt(`teachers.${teacherMatch.id}.name`, course.teacherName) : course.teacherName}
          </span>
        </p>

        {description && <p className="course-card-desc">{description}</p>}

        <div className="course-card-footer">
          {pointCost !== undefined ? (
            <span className="course-card-price">{t('points_amount', { count: pointCost })}</span>
          ) : perSession !== undefined ? (
            <span className="course-card-price">
              NT$ {perSession} <span className="course-card-price-unit">/ {t('per_session')}</span>
            </span>
          ) : (
            <span />
          )}
          <div className="card-tags">
            {(course.tags || []).slice(0, 2).map((tag: string, i: number) => (
              <span key={tag} className="tag">
                {tt(`courses.${course.id}.tags.${i}`, tag)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
};
