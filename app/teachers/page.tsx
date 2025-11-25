// app/teachers/page.tsx
import { TEACHERS } from '@/data/teachers';
import { TeacherCard } from '@/components/TeacherCard';

type TeachersPageProps = {
  searchParams?: {
    subject?: string;
    language?: string;
    region?: string;
    mode?: string;
  };
};

export default function TeachersPage({ searchParams }: TeachersPageProps) {
  const subject = searchParams?.subject ?? '';
  const language = searchParams?.language ?? '';
  const region = searchParams?.region ?? '';
  // mode 目前沒有用在老師資料上
  // const mode = searchParams?.mode ?? '';

  const filtered = TEACHERS.filter((t) => {
    if (subject && !t.subjects.includes(subject)) return false;
    if (language && !t.languages.includes(language)) return false;
    if (region && !t.location.includes(region)) return false;
    return true;
  });

  const hasFilter = subject || language || region;

  return (
    <div className="page">
      <header className="page-header">
        <h1>所有老師</h1>
        {hasFilter ? (
          <p>目前顯示符合條件的老師，共 {filtered.length} 位。</p>
        ) : (
          <p>依照科目、語言與時薪，找到最適合你的老師。</p>
        )}
      </header>

      <section className="section">
        {filtered.length === 0 ? (
          <p>目前沒有符合篩選條件的老師，請調整搜尋條件再試試。</p>
        ) : (
          <div className="card-grid">
            {filtered.map((teacher) => (
              <TeacherCard key={teacher.id} teacher={teacher} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
