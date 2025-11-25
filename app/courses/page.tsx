// app/courses/page.tsx
import { COURSES } from '@/data/courses';
import { CourseCard } from '@/components/CourseCard';

export default function CoursesPage() {
  return (
    <div className="page">
      <header className="page-header">
        <h1>所有課程</h1>
        <p>主題式課程，從國中、高中到成人進修都能找到。</p>
      </header>

      <section className="section">
        <div className="card-grid">
          {COURSES.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      </section>
    </div>
  );
}

