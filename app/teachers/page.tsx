// app/teachers/page.tsx
import { TEACHERS } from '@/data/teachers';
import { TeacherCard } from '@/components/TeacherCard';

export default function TeachersPage() {
  return (
    <div className="page">
      <header className="page-header">
        <h1>所有老師</h1>
        <p>依照科目、語言與時薪，找到最適合你的老師。</p>
      </header>

      <section className="section">
        <div className="card-grid">
          {TEACHERS.map((teacher) => (
            <TeacherCard key={teacher.id} teacher={teacher} />
          ))}
        </div>
      </section>
    </div>
  );
}

