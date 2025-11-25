// components/CourseCard.tsx
import { Course } from '@/data/courses';

interface CourseCardProps {
  course: Course;
}

export const CourseCard: React.FC<CourseCardProps> = ({ course }) => {
  return (
    <div className="card">
      <h3 className="card-title">{course.title}</h3>
      <p className="card-subtitle">
        {course.subject}｜{course.level}
      </p>
      <p className="card-intro">
        授課老師：{course.teacherName}
        <br />
        課程語言：{course.language}
      </p>
      <div className="card-meta">
        <span>
          NT$ {course.pricePerSession}/堂 · {course.durationMinutes} 分鐘
        </span>
        <span>{course.mode === 'online' ? '線上課程' : '實體課程'}</span>
      </div>
      <div className="card-tags">
        {course.tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
};

